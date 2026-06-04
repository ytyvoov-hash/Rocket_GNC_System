#pragma once

#include "AbstractProcessModel.hpp"
#include <gnc-core/sim/Full6DOFIntegrator.h>
#include <Eigen/Dense>

namespace gnc {
namespace estimation {

/**
 * @brief Concrete Process Model for a 6DOF rocket.
 * 
 * Uses the physics engine from Full6DOFIntegrator to propagate the state forward
 * and computes numerical Jacobians for EKF/ESKF.
 */
class Rocket6DOFProcessModel : public AbstractProcessModel {
private:
    sim::Full6DOFIntegrator integrator_;
    Eigen::MatrixXd Q_;

    // Helper to map Eigen::VectorXd to SimFrame and vice versa
    sim::SimFrame vectorToFrame(const Eigen::VectorXd& x) const;
    Eigen::VectorXd frameToVector(const sim::SimFrame& frame) const;

public:
    Rocket6DOFProcessModel(const sim::SimConfig& cfg, const Eigen::MatrixXd& process_noise);
    ~Rocket6DOFProcessModel() override = default;

    int getStateDimension() const override;
    int getInputDimension() const override;

    Eigen::VectorXd propagate(const Eigen::VectorXd& state, const Eigen::VectorXd& control, double dt) override;

    Eigen::MatrixXd getStateJacobian(const Eigen::VectorXd& state, const Eigen::VectorXd& control, double dt) override;

    Eigen::MatrixXd getProcessNoiseCovariance(double dt) override;
};

} // namespace estimation
} // namespace gnc
