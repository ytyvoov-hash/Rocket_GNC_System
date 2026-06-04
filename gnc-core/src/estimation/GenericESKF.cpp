#include <gnc-core/estimation/GenericESKF.hpp>
#include <stdexcept>

namespace gnc {
namespace estimation {

void GenericESKF::initialize(const Eigen::VectorXd& initial_state, const Eigen::MatrixXd& initial_covariance) {
    if (!process_model_) {
        throw std::runtime_error("GenericESKF: Process model not set before initialization.");
    }
    nominal_state_ = initial_state;
    error_covariance_ = initial_covariance;
}

void GenericESKF::predict(const Eigen::VectorXd& u, double dt) {
    if (!process_model_) return;

    // 1. Predict nominal state forward
    nominal_state_ = process_model_->propagate(nominal_state_, u, dt);

    // 2. Compute error-state Jacobians
    Eigen::MatrixXd F = process_model_->getStateJacobian(nominal_state_, u, dt);
    Eigen::MatrixXd Q = process_model_->getProcessNoiseCovariance(dt);

    // 3. Predict error covariance
    // P_{k|k-1} = F * P_{k-1|k-1} * F^T + Q
    error_covariance_ = F * error_covariance_ * F.transpose() + Q;
}

void GenericESKF::update(const Eigen::VectorXd& z, std::shared_ptr<AbstractMeasurementModel> measurement_model) {
    if (!measurement_model) return;

    // 1. Predict measurement based on nominal state
    Eigen::VectorXd z_pred = measurement_model->predictMeasurement(nominal_state_);
    Eigen::VectorXd residual = z - z_pred;

    // 2. Compute measurement Jacobian and Noise Covariance
    Eigen::MatrixXd H = measurement_model->getMeasurementJacobian(nominal_state_);
    Eigen::MatrixXd R = measurement_model->getMeasurementNoiseCovariance();

    // 3. Compute Kalman Gain: K = P * H^T * (H * P * H^T + R)^-1
    Eigen::MatrixXd S = H * error_covariance_ * H.transpose() + R;
    Eigen::MatrixXd K = error_covariance_ * H.transpose() * S.inverse();

    // 4. Compute error state update: dx = K * residual
    Eigen::VectorXd error_state = K * residual;

    // 5. Update covariance: P = (I - K * H) * P
    int n = error_covariance_.rows();
    Eigen::MatrixXd I = Eigen::MatrixXd::Identity(n, n);
    error_covariance_ = (I - K * H) * error_covariance_;

    // 6. Inject error state into nominal state
    // For a generic filter, simple addition. If the state uses quaternions, 
    // the process model or a specific injection routine should handle the SO(3) update.
    // Assuming simple additive error state for now.
    nominal_state_ += error_state;
}

Eigen::VectorXd GenericESKF::getState() const {
    return nominal_state_;
}

Eigen::MatrixXd GenericESKF::getCovariance() const {
    return error_covariance_;
}

} // namespace estimation
} // namespace gnc
