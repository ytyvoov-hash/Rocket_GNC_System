#pragma once

#include "AbstractFilter.hpp"
#include <Eigen/Dense>

namespace gnc {
namespace estimation {

/**
 * @brief Fallback Extended Kalman Filter (EKF).
 * 
 * Standard EKF implementation. Best for smaller state vectors (e.g. 6-state or 9-state fallback)
 * during sensor failures where computational speed and simplicity are prioritized over robustness 
 * against highly nonlinear dynamics or gimbal locks.
 */
class FallbackEKF : public AbstractFilter {
private:
    Eigen::VectorXd state_;
    Eigen::MatrixXd covariance_;

public:
    FallbackEKF() = default;
    ~FallbackEKF() override = default;

    void initialize(const Eigen::VectorXd& initial_state, const Eigen::MatrixXd& initial_covariance) override;
    
    void predict(const Eigen::VectorXd& u, double dt) override;
    
    void update(const Eigen::VectorXd& z, std::shared_ptr<AbstractMeasurementModel> measurement_model) override;
    
    Eigen::VectorXd getState() const override;
    
    Eigen::MatrixXd getCovariance() const override;
};

} // namespace estimation
} // namespace gnc
