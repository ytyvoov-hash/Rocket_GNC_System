#include <gnc-core/estimation/LevenbergMarquardtMheSolver.hpp>
#include <Eigen/SparseCholesky>
#include <iostream>

namespace gnc {
namespace estimation {

void LevenbergMarquardtMheSolver::setup(std::shared_ptr<AbstractProcessModel> process_model, int horizon_length) {
    process_model_ = process_model;
    horizon_length_ = horizon_length;
}

Eigen::VectorXd LevenbergMarquardtMheSolver::computeResiduals(
    const std::vector<Eigen::VectorXd>& x, 
    const std::vector<Eigen::VectorXd>& u, 
    const std::vector<MheMeasurement>& z, 
    double dt) 
{
    int nx = process_model_->getStateDimension();
    int nz_total = 0;
    for (const auto& meas : z) nz_total += meas.model->getMeasurementDimension();
    
    // Total residuals: (N) dynamics residuals + measurements residuals
    int N = horizon_length_;
    int residual_dim = N * nx + nz_total;
    Eigen::VectorXd r(residual_dim);
    
    int idx = 0;
    // 1. Dynamics residuals: x_{k+1} - f(x_k, u_k)
    for (int k = 0; k < N; ++k) {
        Eigen::VectorXd x_next_pred = process_model_->propagate(x[k], u[k], dt);
        r.segment(idx, nx) = x[k+1] - x_next_pred;
        idx += nx;
    }
    
    // 2. Measurement residuals: z - h(x)
    for (size_t k = 0; k < z.size(); ++k) {
        int m_dim = z[k].model->getMeasurementDimension();
        Eigen::VectorXd z_pred = z[k].model->predictMeasurement(x[N]); // simplified: assuming all measurements happen at current time N for this scaffold
        r.segment(idx, m_dim) = z[k].z - z_pred;
        idx += m_dim;
    }
    
    return r;
}

Eigen::SparseMatrix<double> LevenbergMarquardtMheSolver::computeJacobian(
    const std::vector<Eigen::VectorXd>& x, 
    const std::vector<Eigen::VectorXd>& u, 
    const std::vector<MheMeasurement>& z, 
    double dt) 
{
    int nx = process_model_->getStateDimension();
    int N = horizon_length_;
    int nz_total = 0;
    for (const auto& meas : z) nz_total += meas.model->getMeasurementDimension();
    
    int residual_dim = N * nx + nz_total;
    int state_vars = (N + 1) * nx;
    
    Eigen::SparseMatrix<double> J(residual_dim, state_vars);
    std::vector<Eigen::Triplet<double>> triplets;
    
    int row_idx = 0;
    // Dynamics Jacobians
    for (int k = 0; k < N; ++k) {
        Eigen::MatrixXd F = process_model_->getStateJacobian(x[k], u[k], dt);
        
        // d( r_k ) / d x_k = -F
        for (int i = 0; i < nx; ++i) {
            for (int j = 0; j < nx; ++j) {
                triplets.push_back(Eigen::Triplet<double>(row_idx + i, k * nx + j, -F(i, j)));
            }
        }
        
        // d( r_k ) / d x_{k+1} = I
        for (int i = 0; i < nx; ++i) {
            triplets.push_back(Eigen::Triplet<double>(row_idx + i, (k + 1) * nx + i, 1.0));
        }
        row_idx += nx;
    }
    
    // Measurement Jacobians (Simplified: applying to x_N)
    for (size_t k = 0; k < z.size(); ++k) {
        int m_dim = z[k].model->getMeasurementDimension();
        Eigen::MatrixXd H = z[k].model->getMeasurementJacobian(x[N]);
        
        for (int i = 0; i < m_dim; ++i) {
            for (int j = 0; j < nx; ++j) {
                triplets.push_back(Eigen::Triplet<double>(row_idx + i, N * nx + j, -H(i, j)));
            }
        }
        row_idx += m_dim;
    }
    
    J.setFromTriplets(triplets.begin(), triplets.end());
    return J;
}

std::vector<Eigen::VectorXd> LevenbergMarquardtMheSolver::solve(
    const std::vector<Eigen::VectorXd>& initial_guess,
    const std::vector<Eigen::VectorXd>& controls,
    const std::vector<MheMeasurement>& measurements,
    double dt) 
{
    if (!process_model_ || initial_guess.size() != static_cast<size_t>(horizon_length_ + 1)) {
        return initial_guess; // Return guess on error
    }

    std::vector<Eigen::VectorXd> x = initial_guess;
    int nx = process_model_->getStateDimension();
    int state_vars = (horizon_length_ + 1) * nx;
    
    double current_lambda = lambda_;
    Eigen::VectorXd r = computeResiduals(x, controls, measurements, dt);
    double current_cost = r.squaredNorm();
    
    for (int iter = 0; iter < max_iterations_; ++iter) {
        Eigen::SparseMatrix<double> J = computeJacobian(x, controls, measurements, dt);
        
        // J^T J x = J^T r
        Eigen::SparseMatrix<double> JtJ = J.transpose() * J;
        Eigen::VectorXd Jtr = J.transpose() * r;
        
        // Add Levenberg-Marquardt damping
        for (int i = 0; i < state_vars; ++i) {
            JtJ.coeffRef(i, i) += current_lambda * JtJ.coeff(i, i) + 1e-6; // Ensure positive definiteness
        }
        
        Eigen::SimplicialLDLT<Eigen::SparseMatrix<double>> solver;
        solver.compute(JtJ);
        Eigen::VectorXd delta_x = solver.solve(-Jtr);
        
        // Evaluate new state
        std::vector<Eigen::VectorXd> x_new = x;
        for (int k = 0; k <= horizon_length_; ++k) {
            x_new[k] += delta_x.segment(k * nx, nx);
        }
        
        Eigen::VectorXd r_new = computeResiduals(x_new, controls, measurements, dt);
        double new_cost = r_new.squaredNorm();
        
        if (new_cost < current_cost) {
            x = x_new;
            r = r_new;
            current_cost = new_cost;
            current_lambda /= 10.0;
            
            // Check convergence
            if (delta_x.norm() < 1e-5) {
                break;
            }
        } else {
            current_lambda *= 10.0;
        }
    }
    
    return x;
}

} // namespace estimation
} // namespace gnc
