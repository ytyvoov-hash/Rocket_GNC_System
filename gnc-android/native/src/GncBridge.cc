// gnc-android/GncBridge.cc — Path A supervisory outer loop (v8 P5.2).
#include "gnc-android/GncBridge.h"

#include <cmath>

namespace gnc::android {

using gnc::control::ActuatorCommands;
using gnc::control::AllocatorState;
using gnc::control::ControlEffort;
using gnc::control::ControllerState;
using gnc::estimation::EskfParams;

GncBridge::GncBridge(BridgeConfig cfg,
                     std::shared_ptr<gnc::control::IController> controller,
                     std::shared_ptr<gnc::control::IControlAllocator> allocator)
    : cfg_(cfg), ctrl_(std::move(controller)), alloc_(std::move(allocator)) {
    if (ctrl_) ctrl_->init();
}

CommandMsg GncBridge::step(const SensorMsg& s, bool armed) {
    CommandMsg cmd;

    // --- dt from the inner-loop timestamps -------------------------------
    double dt = 0.0;
    if (last_t_ns_ >= 0 && s.t_ns > last_t_ns_) {
        dt = static_cast<double>(s.t_ns - last_t_ns_) * 1e-9;
    }
    last_t_ns_ = s.t_ns;

    // --- nav init on first valid sample ----------------------------------
    if (!nav_init_) {
        nav_.initialize(cfg_.p0_n, cfg_.v0_n, cfg_.q0_b_n, EskfParams{});
        nav_init_ = true;
    }

    // --- ESKF predict (IMU) ----------------------------------------------
    if (s.imu_valid && dt > 0.0) {
        const gnc::Vec3 acc{s.acc_b[0], s.acc_b[1], s.acc_b[2]};
        const gnc::Vec3 gyro{s.gyro_b[0], s.gyro_b[1], s.gyro_b[2]};
        nav_.predict(acc, gyro, dt);
        gps_accum_s_ += dt;
    }

    // --- ESKF update (GPS), throttled ------------------------------------
    if (s.gps_valid && gps_accum_s_ >= cfg_.gps_min_interval_s) {
        nav_.update_gps(gnc::Vec3{s.lat, s.lon, s.alt},
                        gnc::Vec3{s.vel_n[0], s.vel_n[1], s.vel_n[2]});
        gps_accum_s_ = 0.0;
    }

    const auto ns = nav_.state();
    tm_.pos_n = ns.pos_n;
    tm_.vel_n = ns.vel_n;
    tm_.nav_valid = ns.valid;
    tm_.diverged = nav_.diverged();

    // Euler (ZYX) from the estimated quaternion (same convention as the sim).
    const gnc::Quat& q = ns.q_b_n;
    const double sinp = 2.0 * (q.w * q.y - q.z * q.x);
    const double pitch = std::abs(sinp) >= 1.0 ? std::copysign(gnc::PI * 0.5, sinp) : std::asin(sinp);
    const double yaw = std::atan2(2.0 * (q.w * q.z + q.x * q.y), 1.0 - 2.0 * (q.y * q.y + q.z * q.z));
    const double roll = std::atan2(2.0 * (q.w * q.x + q.y * q.z), 1.0 - 2.0 * (q.x * q.x + q.y * q.y));
    tm_.euler_rad = {roll, pitch, yaw};

    cmd.target_euler[0] = static_cast<float>(cfg_.target_euler_rad.x);
    cmd.target_euler[1] = static_cast<float>(cfg_.target_euler_rad.y);
    cmd.target_euler[2] = static_cast<float>(cfg_.target_euler_rad.z);

    // --- outer-loop control + allocation (only when armed) ---------------
    if (armed && !tm_.diverged && ctrl_ && alloc_) {
        ControllerState cs;
        cs.position_n = ns.pos_n;
        cs.velocity_n = ns.vel_n;
        cs.euler_angles_rad = tm_.euler_rad;
        cs.angular_velocity_rad_s = {s.gyro_b[0], s.gyro_b[1], s.gyro_b[2]};

        ControllerState target;
        target.euler_angles_rad = cfg_.target_euler_rad;

        const ControlEffort effort = ctrl_->calculate_control(cs, target, dt > 0 ? dt : 0.02);

        AllocatorState as;
        as.S_ref = cfg_.S_ref_m2;
        as.L_ref = cfg_.L_ref_m;
        const ActuatorCommands acmds = alloc_->allocate(effort, as);

        cmd.n_fins = static_cast<std::uint8_t>(acmds.n_fins);
        for (int i = 0; i < acmds.n_fins && i < 4; ++i)
            cmd.fin_cmd_rad[i] = static_cast<float>(acmds.fins_rad[i]);
        tm_.n_fins = acmds.n_fins;
        cmd.mode = static_cast<std::uint8_t>(LinkMode::Flight);
    } else if (tm_.diverged) {
        cmd.mode = static_cast<std::uint8_t>(LinkMode::Abort);
    } else {
        cmd.mode = static_cast<std::uint8_t>(armed ? LinkMode::Armed : LinkMode::Idle);
    }

    return cmd;
}

}  // namespace gnc::android
