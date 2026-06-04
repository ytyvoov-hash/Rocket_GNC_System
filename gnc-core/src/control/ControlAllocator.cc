#include "gnc-core/control/ControlAllocator.h"

#include <Eigen/Dense>
#include <algorithm>
#include <cmath>

namespace gnc::control {

// ---------------------------------------------------------------------------
// FinGeometry builders
// ---------------------------------------------------------------------------
FinGeometry FinGeometry::cruciform4(double Cl, double Cm, double Cn, double delta_max) {
    FinGeometry g;
    g.n_fins = 4;
    // Two yaw fins (0,2) and two pitch fins (1,3); roll authority from all,
    // with opposite roll sign on the (2,3) pair. Reproduces the legacy "+"
    // mapping's achieved moments while minimising control effort.
    g.eff[0] = {+Cl, 0.0, +Cn};
    g.eff[1] = {+Cl, +Cm, 0.0};
    g.eff[2] = {-Cl, 0.0, +Cn};
    g.eff[3] = {-Cl, +Cm, 0.0};
    for (int i = 0; i < 4; ++i) g.delta_max_rad[i] = delta_max;
    return g;
}

FinGeometry FinGeometry::ring(int n, double k_roll, double k_pitch_yaw, double delta_max) {
    FinGeometry g;
    g.n_fins = std::clamp(n, 1, kMaxFins);
    constexpr double kTwoPi = 6.283185307179586;
    for (int i = 0; i < g.n_fins; ++i) {
        const double phi = kTwoPi * static_cast<double>(i) / static_cast<double>(g.n_fins);
        g.eff[i] = {k_roll,
                    k_pitch_yaw * std::cos(phi),   // pitch projection
                    k_pitch_yaw * std::sin(phi)};  // yaw projection
        g.delta_max_rad[i] = delta_max;
    }
    return g;
}

FinGeometry FinGeometry::canard4(double Cl, double Cm, double Cn, double delta_max) {
    // Forward-mounted surfaces: pitch/yaw effectiveness is sign-inverted
    // relative to a tail fin (a positive pitch demand deflects the canard
    // the opposite way). Roll authority is unchanged.
    return cruciform4(Cl, -Cm, -Cn, delta_max);
}

// ---------------------------------------------------------------------------
// FinAllocator: (regularised) minimum-norm least-squares allocation
//     delta = B^T (B B^T + lambda I)^-1 * m,   m = moment / (q S L)
// which exactly achieves the demand when unsaturated and spreads effort across
// redundant surfaces for over-actuated (n>3) layouts.
// ---------------------------------------------------------------------------
ActuatorCommands FinAllocator::allocate(const ControlEffort& effort, const AllocatorState& state) {
    ActuatorCommands cmds;
    const int n = std::clamp(geom_.n_fins, 0, kMaxFins);
    cmds.n_fins = n;
    if (n == 0) return cmds;

    const double scale = state.q_dyn * state.S_ref * state.L_ref;

    // Effectiveness matrix B (3xN): rows = roll, pitch, yaw.
    Eigen::MatrixXd B(3, n);
    for (int i = 0; i < n; ++i) {
        B(0, i) = geom_.eff[i].x;  // Cl_i  (roll)
        B(1, i) = geom_.eff[i].y;  // Cm_i  (pitch)
        B(2, i) = geom_.eff[i].z;  // Cn_i  (yaw)
    }

    Eigen::VectorXd delta = Eigen::VectorXd::Zero(n);
    if (scale > 1e-6) {
        Eigen::Vector3d m;
        m << effort.moments_body.x / scale,   // roll
             effort.moments_body.y / scale,   // pitch
             effort.moments_body.z / scale;   // yaw

        // Tikhonov-regularised right pseudo-inverse (handles rank-deficient or
        // ill-conditioned B without blowing up).
        const Eigen::Matrix3d BBt = B * B.transpose();
        const double lambda = 1e-9 * BBt.trace() + 1e-12;
        const Eigen::Matrix3d reg = BBt + lambda * Eigen::Matrix3d::Identity();
        delta = B.transpose() * reg.ldlt().solve(m);
    }

    // Per-fin position clamp.
    for (int i = 0; i < n; ++i) {
        const double lim = geom_.delta_max_rad[i] > 0.0 ? geom_.delta_max_rad[i] : 0.35;
        cmds.fins_rad[i] = std::clamp(delta(i), -lim, lim);
    }

    // Achieved moment from the (possibly saturated) deflections.
    Eigen::VectorXd d(n);
    for (int i = 0; i < n; ++i) d(i) = cmds.fins_rad[i];
    const Eigen::Vector3d achieved = scale * (B * d);
    cmds.allocated_aero_moment.x = achieved(0);
    cmds.allocated_aero_moment.y = achieved(1);
    cmds.allocated_aero_moment.z = achieved(2);

    return cmds;
}

// ---------------------------------------------------------------------------
// TVCAllocator (unchanged): gimbal angle from desired pitch/yaw moment.
// ---------------------------------------------------------------------------
ActuatorCommands TVCAllocator::allocate(const ControlEffort& effort, const AllocatorState& state) {
    ActuatorCommands cmds;
    cmds.n_fins = 0;
    double lever_arm = state.L_ref > 0 ? state.L_ref : 1.0;
    double denom = state.thrust_n * lever_arm;

    if (denom > 1e-6) {
        cmds.tvc_pitch_rad = effort.moments_body.y / denom;
        cmds.tvc_yaw_rad   = effort.moments_body.z / denom;
    }

    // Clamp to 5 degrees
    cmds.tvc_pitch_rad = std::clamp(cmds.tvc_pitch_rad, -0.087, 0.087);
    cmds.tvc_yaw_rad   = std::clamp(cmds.tvc_yaw_rad, -0.087, 0.087);

    // Achieved moment
    cmds.allocated_thrust_moment.y = denom * cmds.tvc_pitch_rad;
    cmds.allocated_thrust_moment.z = denom * cmds.tvc_yaw_rad;
    cmds.allocated_thrust_moment.x = 0.0; // TVC usually can't roll

    return cmds;
}

} // namespace gnc::control
