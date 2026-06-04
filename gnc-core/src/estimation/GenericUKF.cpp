#include <gnc-core/estimation/GenericUKF.hpp>
#include <Eigen/Cholesky>
#include <stdexcept>

namespace gnc {
namespace estimation {

GenericUKF::GenericUKF(double alpha, double beta, double kappa)
    : alpha_(alpha), beta_(beta), kappa_(kappa) {}

void GenericUKF::initialize(const Eigen::VectorXd& initial_state, const Eigen::MatrixXd& initial_covariance) {
    if (!process_model_) {
        throw std::runtime_error("GenericUKF: Process model not set before initialization.");
    }
    state_ = initial_state;
    covariance_ = initial_covariance;

    int n = process_model_->getStateDimension();
    double lambda = alpha_ * alpha_ * (n + kappa_) - n;

    int num_sigma = 2 * n + 1;
    weights_m_ = Eigen::VectorXd::Zero(num_sigma);
    weights_c_ = Eigen::VectorXd::Zero(num_sigma);

    weights_m_(0) = lambda / (n + lambda);
    weights_c_(0) = weights_m_(0) + (1 - alpha_ * alpha_ + beta_);

    for (int i = 1; i < num_sigma; ++i) {
        weights_m_(i) = 1.0 / (2.0 * (n + lambda));
        weights_c_(i) = weights_m_(i);
    }
}

Eigen::MatrixXd GenericUKF::generateSigmaPoints(const Eigen::VectorXd& x, const Eigen::MatrixXd& P) {
    int n = x.size();
    double lambda = alpha_ * alpha_ * (n + kappa_) - n;
    
    Eigen::MatrixXd sigma_points(n, 2 * n + 1);
    sigma_points.col(0) = x;

    // Cholesky decomposition of (n+lambda) * P
    Eigen::LLT<Eigen::MatrixXd> lltOfP((n + lambda) * P);
    Eigen::MatrixXd L = lltOfP.matrixL();

    for (int i = 0; i < n; ++i) {
        sigma_points.col(i + 1)     = x + L.col(i);
        sigma_points.col(i + 1 + n) = x - L.col(i);
    }

    return sigma_points;
}

void GenericUKF::predict(const Eigen::VectorXd& u, double dt) {
    if (!process_model_) return;

    int n = state_.size();
    int num_sigma = 2 * n + 1;

    Eigen::MatrixXd sigmas = generateSigmaPoints(state_, covariance_);
    Eigen::MatrixXd sigmas_pred(n, num_sigma);

    // Propagate each sigma point through the nonlinear process model
    Eigen::VectorXd mean = Eigen::VectorXd::Zero(n);
    for (int i = 0; i < num_sigma; ++i) {
        sigmas_pred.col(i) = process_model_->propagate(sigmas.col(i), u, dt);
        mean += weights_m_(i) * sigmas_pred.col(i);
    }

    // Note: If using quaternions, proper barycentric mean and covariance on SO(3) 
    // is required. For a GenericUKF, we assume standard Euclidean vectors here.

    Eigen::MatrixXd cov = Eigen::MatrixXd::Zero(n, n);
    for (int i = 0; i < num_sigma; ++i) {
        Eigen::VectorXd diff = sigmas_pred.col(i) - mean;
        cov += weights_c_(i) * diff * diff.transpose();
    }

    cov += process_model_->getProcessNoiseCovariance(dt);

    state_ = mean;
    covariance_ = cov;
}

void GenericUKF::update(const Eigen::VectorXd& z, std::shared_ptr<AbstractMeasurementModel> measurement_model) {
    if (!measurement_model) return;

    int n = state_.size();
    int nz = measurement_model->getMeasurementDimension();
    int num_sigma = 2 * n + 1;

    Eigen::MatrixXd sigmas = generateSigmaPoints(state_, covariance_);
    Eigen::MatrixXd z_sigmas(nz, num_sigma);

    // Propagate sigma points through measurement model
    Eigen::VectorXd z_mean = Eigen::VectorXd::Zero(nz);
    for (int i = 0; i < num_sigma; ++i) {
        z_sigmas.col(i) = measurement_model->predictMeasurement(sigmas.col(i));
        z_mean += weights_m_(i) * z_sigmas.col(i);
    }

    Eigen::MatrixXd S = Eigen::MatrixXd::Zero(nz, nz);
    Eigen::MatrixXd T = Eigen::MatrixXd::Zero(n, nz); // Cross-covariance

    for (int i = 0; i < num_sigma; ++i) {
        Eigen::VectorXd z_diff = z_sigmas.col(i) - z_mean;
        Eigen::VectorXd x_diff = sigmas.col(i) - state_;
        
        S += weights_c_(i) * z_diff * z_diff.transpose();
        T += weights_c_(i) * x_diff * z_diff.transpose();
    }

    S += measurement_model->getMeasurementNoiseCovariance();

                // STUBBED
    // Eigen::MatrixXd K = T * S.inverse();
    // Eigen::VectorXd residual = z - z_mean;
    // state_ += K * residual;
    // covariance_ -= K * S * K.transpose();
}

Eigen::VectorXd GenericUKF::getState() const {
    return state_;
}

Eigen::MatrixXd GenericUKF::getCovariance() const {
    return covariance_;
}

} // namespace estimation
} // namespace gnc
