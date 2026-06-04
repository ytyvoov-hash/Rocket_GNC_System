#include <gnc-core/estimation/FallbackEKF.hpp>
#include <stdexcept>

namespace gnc {
namespace estimation {

void FallbackEKF::initialize(const Eigen::VectorXd& initial_state, const Eigen::MatrixXd& initial_covariance) {
    if (!process_model_) {
        throw std::runtime_error("FallbackEKF: Process model not set before initialization.");
    }
    state_ = initial_state;
    covariance_ = initial_covariance;
}

void FallbackEKF::predict(const Eigen::VectorXd& u, double dt) {
    if (!process_model_) return;

    // 1. Compute Jacobians and Noise at current state
    Eigen::MatrixXd F = process_model_->getStateJacobian(state_, u, dt);
    Eigen::MatrixXd Q = process_model_->getProcessNoiseCovariance(dt);

    // 2. Propagate state forward using the nonlinear process model
    state_ = process_model_->propagate(state_, u, dt);

    // 3. Predict covariance
    covariance_ = F * covariance_ * F.transpose() + Q;
}

void FallbackEKF::update(const Eigen::VectorXd& z, std::shared_ptr<AbstractMeasurementModel> measurement_model) {
    if (!measurement_model) return;

    // 1. Predict measurement from propagated state
    Eigen::VectorXd z_pred = measurement_model->predictMeasurement(state_);
    Eigen::VectorXd residual = z - z_pred;

    // 2. Compute measurement Jacobian and Noise Covariance
    Eigen::MatrixXd H = measurement_model->getMeasurementJacobian(state_);
    Eigen::MatrixXd R = measurement_model->getMeasurementNoiseCovariance();

    // 3. Compute Kalman Gain
    Eigen::MatrixXd S = H * covariance_ * H.transpose() + R;
    Eigen::MatrixXd K = covariance_ * H.transpose() * S.inverse();

    // 4. Update state
    state_ += K * residual;

    // 5. Update covariance
    int n = covariance_.rows();
    Eigen::MatrixXd I = Eigen::MatrixXd::Identity(n, n);
    covariance_ = (I - K * H) * covariance_;
}

Eigen::VectorXd FallbackEKF::getState() const {
    return state_;
}

Eigen::MatrixXd FallbackEKF::getCovariance() const {
    return covariance_;
}

} // namespace estimation
} // namespace gnc
