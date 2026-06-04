// gnc-core/sim/Full6DOFIntegrator.h

#pragma once

#include "UnifiedSim.h"

namespace gnc::sim {

class Full6DOFIntegrator : public IntegratorBase {
public:
    explicit Full6DOFIntegrator(SimConfig cfg);

    SimFrame step() override;
    const SimFrame& current() const override { return frame_; }
    void reset() override;
    void updateTuningParams(const TuningParams& params) override;

private:
    SimConfig cfg_;
    SimFrame  frame_;
    EarthModel earth_model_;
    SensorModel sensor_model_;
    gnc::control::ActuatorCommands last_cmds_;
    
    // Actuator Dynamics State
    std::array<double, 4> fin_angles_rad_{0.0, 0.0, 0.0, 0.0};
    double tvc_pitch_angle_rad_{0.0};
    double tvc_yaw_angle_rad_{0.0};
};

}  // namespace gnc::sim
