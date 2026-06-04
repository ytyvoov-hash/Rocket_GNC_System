// gnc-stm32/src/FlightLoop.cc
#include "gnc-stm32/FlightLoop.h"

#include <cmath>
#include <vector>

namespace gnc::stm32 {

using gnc::control::ActuatorCommands;
using gnc::control::AllocatorState;
using gnc::control::ControlEffort;
using gnc::control::ControllerState;
using gnc::estimation::EskfParams;
using gnc::hal::FinCommand;

FlightLoop::FlightLoop(FlightConfig cfg,
                       gnc::hal::HalSet hal,
                       std::shared_ptr<gnc::control::IController> controller,
                       std::shared_ptr<gnc::control::IControlAllocator> allocator,
                       FirmwareSignature signature)
    : cfg_(cfg),
      hal_(std::move(hal)),
      ctrl_(std::move(controller)),
      alloc_(std::move(allocator)),
      sig_(std::move(signature)),
      wd_(cfg.watchdog_timeout_ns) {}

bool FlightLoop::transition(FlightState to) {
    if (!is_legal_transition(state_, to)) return false;
    state_ = to;
    return true;
}

void FlightLoop::enter_safe_mode(const char* /*reason*/) {
    // Fail-stop: neutralise every actuator and disarm all pyros.
    if (hal_.fins) {
        std::vector<FinCommand> zero;
        const auto fb = hal_.fins->feedback();
        zero.reserve(fb.empty() ? 4 : fb.size());
        const std::uint8_t n = hal_.fins->fin_count();
        for (std::uint8_t i = 0; i < n; ++i) zero.push_back(FinCommand{i, 0.0, 0.0});
        hal_.fins->send(zero);
    }
    if (hal_.pyro) hal_.pyro->disarm_all();
    state_ = FlightState::SafeMode;  // terminal; bypasses the legal-edge table
}

bool FlightLoop::boot(const FirmwareImage& image) {
    if (state_ != FlightState::Boot) return false;
    transition(FlightState::SelfTest);

    const bool fw_ok = sig_.verify(image);
    guard_ = FlightBuildGuard::evaluate(hal_, fw_ok);

    // Seed the navigation filter.
    EskfParams ep;
    if (cfg_.gps_update_hz > 0.0) { /* defaults are fine for bench */ }
    nav_.initialize(cfg_.p0_n, cfg_.v0_n, cfg_.q0_b_n, ep);
    nav_initialized_ = nav_.initialized();
    if (ctrl_) ctrl_->init();

    // INV-6: a flight build must not proceed if the guard fails.
    if (guard_.flight_build && !guard_.pass()) {
        enter_safe_mode("flight-build guard failed");
        return false;
    }
    if (!nav_initialized_) {
        enter_safe_mode("nav init failed");
        return false;
    }
    transition(FlightState::Safe);
    wd_.start(hal_.clock ? hal_.clock->now() : gnc::TimePoint{0});
    return true;
}

bool FlightLoop::arm() {
    return transition(FlightState::Armed);
}

bool FlightLoop::detect_launch() {
    return transition(FlightState::Flight);
}

void FlightLoop::abort() {
    enter_safe_mode("operator abort");
}

Telemetry FlightLoop::tick() {
    Telemetry tm;
    tm.tick = ++tick_count_;
    tm.state = state_;

    const gnc::TimePoint now = hal_.clock ? hal_.clock->now() : gnc::TimePoint{0};

    // Watchdog: a missed deadline (hung/overrunning step) forces SafeMode.
    if (state_ != FlightState::SafeMode && wd_.expired(now)) {
        enter_safe_mode("watchdog expired");
        tm.state = state_;
        tm.healthy = false;
        return tm;
    }

    // ---- Navigation (always run when initialised; INV-3 estimated state) ----
    if (nav_initialized_ && hal_.imu) {
        const auto imu = hal_.imu->poll();
        if (imu.valid) nav_.predict(imu.acc_b, imu.gyro_b, cfg_.dt_s);
        gps_accum_s_ += cfg_.dt_s;
        if (hal_.gps && gps_accum_s_ >= (1.0 / cfg_.gps_update_hz)) {
            const auto gps = hal_.gps->poll();
            if (gps.valid) {
                nav_.update_gps(Vec3{gps.lat_deg, gps.lon_deg, gps.alt_m}, gps.vel_n);
            }
            gps_accum_s_ = 0.0;
        }
    }

    if (nav_.diverged()) {
        enter_safe_mode("estimator diverged");
        tm.state = state_;
        tm.healthy = false;
        return tm;
    }

    const auto ns = nav_.state();
    tm.pos_n = ns.pos_n;
    tm.vel_n = ns.vel_n;
    tm.nav_valid = ns.valid;

    // Euler (ZYX) from the estimated quaternion — same convention as the sim.
    const Quat& q = ns.q_b_n;
    double sinp = 2.0 * (q.w * q.y - q.z * q.x);
    double pitch = std::abs(sinp) >= 1.0 ? std::copysign(gnc::PI * 0.5, sinp) : std::asin(sinp);
    double yaw = std::atan2(2.0 * (q.w * q.z + q.x * q.y), 1.0 - 2.0 * (q.y * q.y + q.z * q.z));
    double roll = std::atan2(2.0 * (q.w * q.x + q.y * q.z), 1.0 - 2.0 * (q.x * q.x + q.y * q.y));
    tm.euler_rad = {roll, pitch, yaw};

    // ---- Control + allocation only drive actuators in Armed/Flight/Descent ---
    const bool actuating = state_ == FlightState::Armed ||
                           state_ == FlightState::Flight ||
                           state_ == FlightState::Descent;
    if (actuating && ctrl_ && alloc_) {
        ControllerState cs;
        cs.position_n = ns.pos_n;
        cs.velocity_n = ns.vel_n;
        cs.euler_angles_rad = tm.euler_rad;
        cs.angular_velocity_rad_s = {0.0, 0.0, 0.0};
        cs.mass_kg = 0.0;

        ControllerState target;
        target.euler_angles_rad = cfg_.target_euler_rad;

        const ControlEffort effort = ctrl_->calculate_control(cs, target, cfg_.dt_s);

        AllocatorState as;
        as.q_dyn = 0.0;
        as.thrust_n = cfg_.thrust_est_n;
        as.S_ref = cfg_.S_ref_m2;
        as.L_ref = cfg_.L_ref_m;
        const ActuatorCommands cmds = alloc_->allocate(effort, as);

        tm.n_fins = cmds.n_fins;
        std::vector<FinCommand> fc;
        fc.reserve(cmds.n_fins);
        for (int i = 0; i < cmds.n_fins && i < gnc::control::kMaxFins; ++i) {
            tm.fin_cmd_rad[i] = cmds.fins_rad[i];
            fc.push_back(FinCommand{static_cast<std::uint8_t>(i),
                                    cmds.fins_rad[i] * (180.0 / gnc::PI), 0.0});
        }
        if (hal_.fins) hal_.fins->send(fc);
    }

    wd_.kick(now);
    return tm;
}

}  // namespace gnc::stm32
