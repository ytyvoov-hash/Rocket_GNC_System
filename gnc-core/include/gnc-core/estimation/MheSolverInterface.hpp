#pragma once

#include "AbstractProcessModel.hpp"
#include "AbstractMeasurementModel.hpp"
#include <Eigen/Dense>
#include <vector>
#include <memory>

namespace gnc {
namespace estimation {

/**
 * @brief Measurement structure for MHE horizon window.
 */
struct MheMeasurement {
    double timestamp;
    Eigen::VectorXd z;
    std::shared_ptr<AbstractMeasurementModel> model;
};

/**
 * @brief Abstract interface for Moving Horizon Estimator solvers (ACADOS, CasADi, Levenberg-Marquardt).
 */
class MheSolverInterface {
public:
    virtual ~MheSolverInterface() = default;

    /**
     * @brief Setup the solver with the specific process model and horizon length.
     * @param process_model The nonlinear process model defining system dynamics
     * @param horizon_length Number of steps (N) in the sliding window
     */
    virtual void setup(std::shared_ptr<AbstractProcessModel> process_model, int horizon_length) = 0;

    /**
     * @brief Solve the non-linear least squares trajectory optimization over the horizon.
     * @param initial_guess Array of state guesses [x_{k-N}, ..., x_k]
     * @param controls Array of control inputs [u_{k-N}, ..., u_{k-1}]
     * @param measurements Array of measurements over the horizon
     * @param dt Time step between nodes
     * @return Optimized state trajectory [x_{k-N}^*, ..., x_k^*]
     */
    virtual std::vector<Eigen::VectorXd> solve(
        const std::vector<Eigen::VectorXd>& initial_guess,
        const std::vector<Eigen::VectorXd>& controls,
        const std::vector<MheMeasurement>& measurements,
        double dt) = 0;
};

} // namespace estimation
} // namespace gnc
