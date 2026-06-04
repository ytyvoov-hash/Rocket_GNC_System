#pragma once

#include "MheSolverInterface.hpp"
#include <Eigen/Sparse>
#include <memory>

namespace gnc {
namespace estimation {

/**
 * @brief Custom C++ Levenberg-Marquardt Non-linear Least Squares Solver for MHE.
 * 
 * Uses Eigen to iteratively solve the sliding-window state estimation problem.
 * Designed for firmware without external dependencies.
 */
class LevenbergMarquardtMheSolver : public MheSolverInterface {
private:
    std::shared_ptr<AbstractProcessModel> process_model_;
    int horizon_length_;
    int max_iterations_ = 50;
    double lambda_ = 1e-3; // LM damping factor

    // Helper functions
    Eigen::VectorXd computeResiduals(
        const std::vector<Eigen::VectorXd>& x, 
        const std::vector<Eigen::VectorXd>& u, 
        const std::vector<MheMeasurement>& z, 
        double dt);
        
    Eigen::SparseMatrix<double> computeJacobian(
        const std::vector<Eigen::VectorXd>& x, 
        const std::vector<Eigen::VectorXd>& u, 
        const std::vector<MheMeasurement>& z, 
        double dt);

public:
    LevenbergMarquardtMheSolver() = default;
    ~LevenbergMarquardtMheSolver() override = default;

    void setup(std::shared_ptr<AbstractProcessModel> process_model, int horizon_length) override;

    std::vector<Eigen::VectorXd> solve(
        const std::vector<Eigen::VectorXd>& initial_guess,
        const std::vector<Eigen::VectorXd>& controls,
        const std::vector<MheMeasurement>& measurements,
        double dt) override;
};

} // namespace estimation
} // namespace gnc
