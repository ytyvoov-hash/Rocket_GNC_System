#pragma once

#include <Eigen/Dense>
#include <vector>

namespace gnc {
namespace estimation {

/**
 * @brief Abstract interface for a process model.
 * 
 * Defines the state transition function f(x, u, dt) and its Jacobians.
 * Allows filters like ESKF, EKF, and MHE to be decoupled from the physics equations.
 */
class AbstractProcessModel {
public:
    virtual ~AbstractProcessModel() = default;

    /**
     * @brief Get the dimension of the state vector.
     */
    virtual int getStateDimension() const = 0;

    /**
     * @brief Get the dimension of the control/input vector.
     */
    virtual int getInputDimension() const = 0;

    /**
     * @brief State transition function: x_{k+1} = f(x_k, u_k, dt)
     * @param x Current state vector
     * @param u Current input/control vector
     * @param dt Time step
     * @return Next state vector
     */
    virtual Eigen::VectorXd propagate(const Eigen::VectorXd& x, const Eigen::VectorXd& u, double dt) = 0;

    /**
     * @brief Compute the Jacobian of the state transition function with respect to the state.
     * F_k = d f(x, u, dt) / d x | x_k, u_k
     */
    virtual Eigen::MatrixXd getStateJacobian(const Eigen::VectorXd& x, const Eigen::VectorXd& u, double dt) = 0;

    /**
     * @brief Compute the process noise covariance matrix Q_k.
     */
    virtual Eigen::MatrixXd getProcessNoiseCovariance(double dt) = 0;
};

} // namespace estimation
} // namespace gnc
