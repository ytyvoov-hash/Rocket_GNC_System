#include "gnc-core/control/ControlAllocator.h"
#include <cmath>

namespace gnc::control {

ActuatorCommands FinAllocator::allocate(const ControlEffort& effort, const AllocatorState& state) {
    ActuatorCommands cmds;
    // Map desired body moment to fin deflections.
    // L = q * S * L_ref * Cn_delta * delta.
    // Generic fin effectiveness (Cn_delta ~ 0.05 / rad):
    double Cn_delta = 0.05; 
    double Cm_delta = 0.05;
    double Cl_delta = 0.01;
    
    double denom_pitch = state.q_dyn * state.S_ref * state.L_ref * Cm_delta;
    double denom_yaw   = state.q_dyn * state.S_ref * state.L_ref * Cn_delta;
    double denom_roll  = state.q_dyn * state.S_ref * state.L_ref * Cl_delta;

    double d_pitch = (denom_pitch > 1e-6) ? (effort.moments_body.y / denom_pitch) : 0.0;
    double d_yaw   = (denom_yaw > 1e-6)   ? (effort.moments_body.z / denom_yaw)   : 0.0;
    double d_roll  = (denom_roll > 1e-6)  ? (effort.moments_body.x / denom_roll)  : 0.0;

    // +X forward, +Y right, +Z down.
    // Pitch: Fins 2 and 4
    // Yaw: Fins 1 and 3
    // Roll: All 4 fins
    cmds.fins_rad[0] = d_yaw + d_roll;
    cmds.fins_rad[1] = d_pitch + d_roll;
    cmds.fins_rad[2] = d_yaw - d_roll;
    cmds.fins_rad[3] = d_pitch - d_roll;

    // Clamp deflections to +/- 20 degrees (0.35 rad)
    for (int i=0; i<4; i++) {
        if (cmds.fins_rad[i] > 0.35) cmds.fins_rad[i] = 0.35;
        if (cmds.fins_rad[i] < -0.35) cmds.fins_rad[i] = -0.35;
    }

    // Return the actual achieved moment based on saturated fins
    cmds.allocated_aero_moment.y = denom_pitch * ((cmds.fins_rad[1] + cmds.fins_rad[3]) / 2.0);
    cmds.allocated_aero_moment.z = denom_yaw   * ((cmds.fins_rad[0] + cmds.fins_rad[2]) / 2.0);
    cmds.allocated_aero_moment.x = denom_roll  * ((cmds.fins_rad[0] + cmds.fins_rad[1] - cmds.fins_rad[2] - cmds.fins_rad[3]) / 4.0);
    
    return cmds;
}

ActuatorCommands TVCAllocator::allocate(const ControlEffort& effort, const AllocatorState& state) {
    ActuatorCommands cmds;
    // Torque = r_thrust x F_thrust
    // M = T * L * theta => theta = M / (T * L)
    double lever_arm = state.L_ref > 0 ? state.L_ref : 1.0; 
    double denom = state.thrust_n * lever_arm;

    if (denom > 1e-6) {
        cmds.tvc_pitch_rad = effort.moments_body.y / denom;
        cmds.tvc_yaw_rad   = effort.moments_body.z / denom;
    }

    // Clamp to 5 degrees
    if (cmds.tvc_pitch_rad > 0.087) cmds.tvc_pitch_rad = 0.087;
    if (cmds.tvc_pitch_rad < -0.087) cmds.tvc_pitch_rad = -0.087;
    if (cmds.tvc_yaw_rad > 0.087) cmds.tvc_yaw_rad = 0.087;
    if (cmds.tvc_yaw_rad < -0.087) cmds.tvc_yaw_rad = -0.087;

    // Achieved moment
    cmds.allocated_thrust_moment.y = denom * cmds.tvc_pitch_rad;
    cmds.allocated_thrust_moment.z = denom * cmds.tvc_yaw_rad;
    cmds.allocated_thrust_moment.x = 0.0; // TVC usually can't roll

    return cmds;
}

} // namespace gnc::control
