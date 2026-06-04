#pragma once

#include "AbstractFilter.hpp"
#include <Eigen/Dense>

namespace gnc {
namespace estimation {

/**
 * @brief Generic Error-State Kalman Filter (ESKF).
 * 
 * Works with any dimension state vector as long as it is defined by the process model.
 * Note: If the state contains quaternions, the process model is responsible for 
 * mapping the nominal state (which contains quaternions) to the error state 
 * (which contains rotation vectors) and vice versa in the Jacobians.
 */
class GenericESKF : public AbstractFilter {
private:
    Eigen::VectorXd nominal_state_;
    Eigen::MatrixXd error_covariance_;

public:
    GenericESKF() = default;
    ~GenericESKF() override = default;

    void initialize(const Eigen::VectorXd& initial_state, const Eigen::MatrixXd& initial_covariance) override;
    
    void predict(const Eigen::VectorXd& u, double dt) override;
    
    void update(const Eigen::VectorXd& z, std::shared_ptr<AbstractMeasurementModel> measurement_model) override;
    
    Eigen::VectorXd getState() const override;
    
    Eigen::MatrixXd getCovariance() const override;
};

} // namespace estimation
} // namespace gnc
