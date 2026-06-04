#pragma once

#include "gnc-core/types.h"
#include "gnc-core/control/IController.h"
#include <array>

namespace gnc::control {

struct AllocatorState {
    double q_dyn{0.0};
    double mach{0.0};
    double thrust_n{0.0};
    double S_ref{0.0};
    double L_ref{0.0};
};

struct ActuatorCommands {
    // Array of 4 fin deflections (rad)
    std::array<double, 4> fins_rad{0.0, 0.0, 0.0, 0.0};
    // TVC pitch/yaw gimbal deflections (rad)
    double tvc_pitch_rad{0.0};
    double tvc_yaw_rad{0.0};
    // Resulting aerodynamic torque and thrust torque from these allocations
    Vec3 allocated_aero_moment{0.0, 0.0, 0.0};
    Vec3 allocated_thrust_moment{0.0, 0.0, 0.0};
};

class IControlAllocator {
public:
    virtual ~IControlAllocator() = default;

    virtual ActuatorCommands allocate(const ControlEffort& effort, const AllocatorState& state) = 0;
};

} // namespace gnc::control
