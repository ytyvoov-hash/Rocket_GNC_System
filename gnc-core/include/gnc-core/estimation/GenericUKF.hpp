#pragma once

#include "AbstractFilter.hpp"
#include <Eigen/Dense>

namespace gnc {
namespace estimation {

/**
 * @brief Generic Unscented Kalman Filter (UKF).
 * 
 * Uses the Unscented Transform to propagate the state and covariance
 * through nonlinear process and measurement models without requiring Jacobians.
 */
class GenericUKF : public AbstractFilter {
private:
    Eigen::VectorXd state_;
    Eigen::MatrixXd covariance_;

    // Tuning parameters
    double alpha_;
    double beta_;
    double kappa_;
    
    // Weights for sigma points
    Eigen::VectorXd weights_m_; // For mean
    Eigen::VectorXd weights_c_; // For covariance

    Eigen::MatrixXd generateSigmaPoints(const Eigen::VectorXd& x, const Eigen::MatrixXd& P);

public:
    GenericUKF(double alpha = 1e-3, double beta = 2.0, double kappa = 0.0);
    ~GenericUKF() override = default;

    void initialize(const Eigen::VectorXd& initial_state, const Eigen::MatrixXd& initial_covariance) override;
    
    void predict(const Eigen::VectorXd& u, double dt) override;
    
    void update(const Eigen::VectorXd& z, std::shared_ptr<AbstractMeasurementModel> measurement_model) override;
    
    Eigen::VectorXd getState() const override;
    
    Eigen::MatrixXd getCovariance() const override;
};

} // namespace estimation
} // namespace gnc
