#pragma once

#include "gnc-core/types.h"

namespace gnc::control {

struct ControlEffort {
    Vec3 moments_body{0.0, 0.0, 0.0};
    Vec3 forces_body{0.0, 0.0, 0.0};
};

struct ControllerState {
    Vec3 euler_angles_rad{0.0, 0.0, 0.0}; // Roll, Pitch, Yaw
    Vec3 angular_velocity_rad_s{0.0, 0.0, 0.0};
    double altitude_m{0.0};
    double mach{0.0};
    double q_dyn{0.0};
    double mass_kg{0.0};
    Vec3 position_n{0.0, 0.0, 0.0};
    Vec3 velocity_n{0.0, 0.0, 0.0};
};

class IController {
public:
    virtual ~IController() = default;

    virtual void init() = 0;
    virtual ControlEffort calculate_control(const ControllerState& current_state, const ControllerState& target_state, double dt) = 0;
    virtual void reset() = 0;
};

} // namespace gnc::control
