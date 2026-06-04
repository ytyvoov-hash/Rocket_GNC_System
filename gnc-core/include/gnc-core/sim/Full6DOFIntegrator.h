// gnc-core/sim/Full6DOFIntegrator.h

#pragma once

#include "UnifiedSim.h"
#include "gnc-core/estimation/ErrorStateKF.h"

namespace gnc::sim {

class Full6DOFIntegrator : public IntegratorBase {
public:
    explicit Full6DOFIntegrator(SimConfig cfg);

    SimFrame step() override;
    const SimFrame& current() const override { return frame_; }
    void reset() override;
    void updateTuningParams(const TuningParams& params) override;

private:
    // v8 P3.3 — staging. Evaluates the next pending separation event against the
    // current frame; if its trigger condition is met, jettisons mass, switches
    // the active stage's mass/inertia/aero/thrust, and stamps the frame.
    void evaluateStaging(double current_thrust_n);

    SimConfig cfg_;
    SimFrame  frame_;
    EarthModel earth_model_;
    SensorModel sensor_model_;
    gnc::control::ActuatorCommands last_cmds_;

    // v8 INV-3: navigation estimator that closes the SIL loop on estimated
    // (noisy) state rather than ground truth.
    gnc::estimation::ErrorStateKF nav_;
    bool   nav_initialized_{false};
    double gps_accum_s_{0.0};

    // v8 P3.3 — staging progress.
    std::size_t next_sep_idx_{0};   // index of the next pending separation event
    bool        boost_seen_{false}; // observed thrust on the current stage (for Burnout)

    // Actuator Dynamics State (sized for the largest committed fin count).
    std::array<double, gnc::control::kMaxFins> fin_angles_rad_{};
    double tvc_pitch_angle_rad_{0.0};
    double tvc_yaw_angle_rad_{0.0};
};

}  // namespace gnc::sim
