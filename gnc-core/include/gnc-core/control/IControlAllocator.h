#pragma once

#include "gnc-core/types.h"
#include "gnc-core/control/IController.h"
#include <array>

namespace gnc::control {

// Maximum number of aerodynamic control surfaces the platform supports.
// Sized for the largest committed template (12-fin SA); the canonical
// cruciform vehicle uses the first 4. Fixed capacity keeps ActuatorCommands
// trivially copyable and heap-free in the control loop.
inline constexpr int kMaxFins = 12;

struct AllocatorState {
    double q_dyn{0.0};
    double mach{0.0};
    double thrust_n{0.0};
    double S_ref{0.0};
    double L_ref{0.0};
};

struct ActuatorCommands {
    // Fin deflections (rad). Only the first `n_fins` entries are meaningful.
    std::array<double, kMaxFins> fins_rad{};
    int n_fins{4};
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

    // Per-axis equivalent control-surface deflection (rad) that the given
    // command vector represents, returned as {roll, pitch, yaw}. The plant
    // uses this to index a delta-swept aero deck so the realised control
    // moment is sourced from aerodynamic data rather than the allocator's own
    // linear effectiveness estimate. Default {0,0,0} for allocators without
    // aerodynamic surfaces (e.g. pure TVC).
    virtual Vec3 equivalentDeflections(const ActuatorCommands& cmds) const {
        (void)cmds;
        return Vec3{0.0, 0.0, 0.0};
    }
};

} // namespace gnc::control
