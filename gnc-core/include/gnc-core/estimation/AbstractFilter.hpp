#pragma once

#include "AbstractProcessModel.hpp"
#include "AbstractMeasurementModel.hpp"
#include <Eigen/Dense>
#include <memory>

namespace gnc {
namespace estimation {

/**
 * @brief Abstract interface for a state estimator filter (EKF, UKF, ESKF, etc.).
 */
class AbstractFilter {
protected:
    std::shared_ptr<AbstractProcessModel> process_model_;

public:
    virtual ~AbstractFilter() = default;

    /**
     * @brief Set the process model used by the filter.
     */
    void setProcessModel(std::shared_ptr<AbstractProcessModel> model) {
        process_model_ = model;
    }

    /**
     * @brief Initialize the filter state and covariance.
     */
    virtual void initialize(const Eigen::VectorXd& initial_state, const Eigen::MatrixXd& initial_covariance) = 0;

    /**
     * @brief Perform the prediction step: x_{k|k-1}, P_{k|k-1}
     * @param u Control/input vector
     * @param dt Time step
     */
    virtual void predict(const Eigen::VectorXd& u, double dt) = 0;

    /**
     * @brief Perform the measurement update step: x_{k|k}, P_{k|k}
     * @param z Actual measurement
     * @param measurement_model Model defining how to predict z from x
     */
    virtual void update(const Eigen::VectorXd& z, std::shared_ptr<AbstractMeasurementModel> measurement_model) = 0;

    /**
     * @brief Get the current state estimate.
     */
    virtual Eigen::VectorXd getState() const = 0;

    /**
     * @brief Get the current state covariance estimate.
     */
    virtual Eigen::MatrixXd getCovariance() const = 0;
};

} // namespace estimation
} // namespace gnc
