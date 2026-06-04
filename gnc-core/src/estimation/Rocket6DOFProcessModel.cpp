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

namespace {

// Continuous-time derivative of the 13-state kinematic model.
//   r' = v                              (NED)
//   v' = a_n                            (control = net NED acceleration input)
//   q' = ½ q ⊗ [0, ω_b]                 (body rate ω from state)
//   ω' = 0                              (no torque model in the predictor)
Eigen::VectorXd state_derivative(const Eigen::VectorXd& x, const Eigen::VectorXd& u) {
    Eigen::VectorXd d = Eigen::VectorXd::Zero(13);

    // Position derivative = velocity.
    d.segment<3>(0) = x.segment<3>(3);
    // Velocity derivative = commanded/known NED acceleration (3-dim input).
    if (u.size() >= 3) d.segment<3>(3) = u.segment<3>(0);

    // Quaternion derivative from body angular rate (Hamiltonian, body→NED).
    const double qw = x(6), qx = x(7), qy = x(8), qz = x(9);
    const double wx = x(10), wy = x(11), wz = x(12);
    d(6) = 0.5 * (-qx * wx - qy * wy - qz * wz);
    d(7) = 0.5 * ( qw * wx + qy * wz - qz * wy);
    d(8) = 0.5 * ( qw * wy - qx * wz + qz * wx);
    d(9) = 0.5 * ( qw * wz + qx * wy - qy * wx);
    // Angular-rate derivative left at zero (constant-rate kinematic predictor).
    return d;
}

}  // namespace

Eigen::VectorXd Rocket6DOFProcessModel::propagate(const Eigen::VectorXd& state, const Eigen::VectorXd& control, double dt) {
    // Real RK4 integration of the full kinematic state (position, velocity,
    // quaternion, angular rate) — replaces the previous position-only Euler
    // stub flagged by the v8 audit (Navigation §4). The quaternion is
    // re-normalised after the step to stay on the unit sphere.
    const Eigen::VectorXd k1 = state_derivative(state, control);
    const Eigen::VectorXd k2 = state_derivative(state + 0.5 * dt * k1, control);
    const Eigen::VectorXd k3 = state_derivative(state + 0.5 * dt * k2, control);
    const Eigen::VectorXd k4 = state_derivative(state + dt * k3, control);

    Eigen::VectorXd x_next = state + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);

    // Re-normalise the quaternion (indices 6..9).
    const double qn = x_next.segment<4>(6).norm();
    if (qn > 1e-12) x_next.segment<4>(6) /= qn;

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
