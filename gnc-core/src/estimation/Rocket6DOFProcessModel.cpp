#include <gnc-core/estimation/Rocket6DOFProcessModel.hpp>
#include <iostream>

namespace gnc {
namespace estimation {

Rocket6DOFProcessModel::Rocket6DOFProcessModel(const sim::SimConfig& cfg, const Eigen::MatrixXd& process_noise)
    : integrator_(cfg), Q_(process_noise) {}

int Rocket6DOFProcessModel::getStateDimension() const {
    return 13; // pos(3), vel(3), quat(4), angular_rate(3)
}

int Rocket6DOFProcessModel::getInputDimension() const {
    return 3;
}

sim::SimFrame Rocket6DOFProcessModel::vectorToFrame(const Eigen::VectorXd& x) const {
    sim::SimFrame frame;
    // We only populate kinematic state for the propagation
    frame.r_n.x = x(0);
    frame.r_n.y = x(1);
    frame.r_n.z = x(2);
    
    frame.v_n.x = x(3);
    frame.v_n.y = x(4);
    frame.v_n.z = x(5);
    
    frame.q_b_n.w = x(6);
    frame.q_b_n.x = x(7);
    frame.q_b_n.y = x(8);
    frame.q_b_n.z = x(9);
    
    frame.omega_b_b.x = x(10);
    frame.omega_b_b.y = x(11);
    frame.omega_b_b.z = x(12);
    
    return frame;
}

Eigen::VectorXd Rocket6DOFProcessModel::frameToVector(const sim::SimFrame& frame) const {
    Eigen::VectorXd x(13);
    x(0) = frame.r_n.x;
    x(1) = frame.r_n.y;
    x(2) = frame.r_n.z;
    
    x(3) = frame.v_n.x;
    x(4) = frame.v_n.y;
    x(5) = frame.v_n.z;
    
    x(6) = frame.q_b_n.w;
    x(7) = frame.q_b_n.x;
    x(8) = frame.q_b_n.y;
    x(9) = frame.q_b_n.z;
    
    x(10) = frame.omega_b_b.x;
    x(11) = frame.omega_b_b.y;
    x(12) = frame.omega_b_b.z;
    
    return x;
}

Eigen::VectorXd Rocket6DOFProcessModel::propagate(const Eigen::VectorXd& state, const Eigen::VectorXd& control, double dt) {
    // In a real scenario, we'd inject the current state into the integrator, apply controls,
    // step by dt, and extract the state. The Full6DOFIntegrator currently maintains internal state,
    // so we would need a method to set its state.
    // Assuming such a method exists or we use a static propagation function.
    
    // Fallback: simplified propagation logic since integrator_.step() uses internal dt
    // and internal state. For true integration, the physics engine should be stateless or
    // have setters/getters.
    
    Eigen::VectorXd x_next = state;
    // Kinematic update (simple Euler for now, should call RK4 physics engine)
    x_next.segment<3>(0) += state.segment<3>(3) * dt; // pos += vel * dt
    // ...
    return x_next;
}

Eigen::MatrixXd Rocket6DOFProcessModel::getStateJacobian(const Eigen::VectorXd& state, const Eigen::VectorXd& control, double dt) {
    int n = getStateDimension();
    Eigen::MatrixXd F(n, n);
    for(int i=0; i<n; ++i) {
        for(int j=0; j<n; ++j) {
            F(i,j) = (i==j) ? 1.0 : 0.0;
        }
    }
    
    // Numerical Jacobian computation
    double eps = 1e-6;
    for (int i = 0; i < n; ++i) {
        Eigen::VectorXd x_plus = state;
        x_plus(i) += eps;
        Eigen::VectorXd x_next_plus = propagate(x_plus, control, dt);
        
        Eigen::VectorXd x_minus = state;
        x_minus(i) -= eps;
        Eigen::VectorXd x_next_minus = propagate(x_minus, control, dt);
        
        F.col(i) = (x_next_plus - x_next_minus) / (2 * eps);
    }
    
    return F;
}

Eigen::MatrixXd Rocket6DOFProcessModel::getProcessNoiseCovariance(double dt) {
    return Q_ * dt;
}

} // namespace estimation
} // namespace gnc
