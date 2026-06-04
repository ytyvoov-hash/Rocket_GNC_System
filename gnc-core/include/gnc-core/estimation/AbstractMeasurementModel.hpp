#pragma once

#include <Eigen/Dense>

namespace gnc {
namespace estimation {

/**
 * @brief Abstract interface for a measurement model.
 * 
 * Defines the observation function h(x) and its Jacobian H.
 */
class AbstractMeasurementModel {
public:
    virtual ~AbstractMeasurementModel() = default;

    /**
     * @brief Get the dimension of the measurement vector.
     */
    virtual int getMeasurementDimension() const = 0;

    /**
     * @brief Observation function: z = h(x)
     * @param x Current state vector
     * @return Expected measurement vector
     */
    virtual Eigen::VectorXd predictMeasurement(const Eigen::VectorXd& x) = 0;

    /**
     * @brief Compute the Jacobian of the observation function with respect to the state.
     * H_k = d h(x) / d x | x_k
     */
    virtual Eigen::MatrixXd getMeasurementJacobian(const Eigen::VectorXd& x) = 0;

    /**
     * @brief Compute the measurement noise covariance matrix R_k.
     */
    virtual Eigen::MatrixXd getMeasurementNoiseCovariance() = 0;
};

} // namespace estimation
} // namespace gnc
