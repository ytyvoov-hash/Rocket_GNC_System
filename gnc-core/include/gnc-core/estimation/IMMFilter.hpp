#pragma once

#include "AbstractFilter.hpp"
#include <vector>
#include <memory>
#include <Eigen/Dense>

namespace gnc {
namespace estimation {

/**
 * @brief Interacting Multiple Model (IMM) Filter.
 * 
 * Runs an arbitrary array of filter models concurrently and blends their outputs
 * based on a Markov transition probability matrix and the likelihood of each model
 * given the current measurements.
 */
class IMMFilter : public AbstractFilter {
private:
    std::vector<std::shared_ptr<AbstractFilter>> models_;
    Eigen::MatrixXd transition_matrix_;
    Eigen::VectorXd mode_probabilities_;
    
    Eigen::VectorXd state_;
    Eigen::MatrixXd covariance_;

public:
    IMMFilter() = default;
    ~IMMFilter() override = default;

    /**
     * @brief Configure the IMM with the specific models and transition matrix.
     */
    void setup(const std::vector<std::shared_ptr<AbstractFilter>>& models, const Eigen::MatrixXd& transition_matrix);

    void initialize(const Eigen::VectorXd& initial_state, const Eigen::MatrixXd& initial_covariance) override;
    
    void predict(const Eigen::VectorXd& u, double dt) override;
    
    void update(const Eigen::VectorXd& z, std::shared_ptr<AbstractMeasurementModel> measurement_model) override;
    
    Eigen::VectorXd getState() const override;
    
    Eigen::MatrixXd getCovariance() const override;
};

} // namespace estimation
} // namespace gnc
