// gnc-stm32/FlightLoop.h
//
// v8 P5.1 (Embedded). The Path B flight loop: hosts the gnc-core GNC stack
// (ErrorStateKF estimator + controller + allocator) over the HAL and drives the
// fin/pyro/radio interfaces at a fixed rate. This is the second execution
// substrate the plan calls for (the first being the SIL sim), enabling future
// Path A vs Path B parity.
//
// One cycle (tick):
//   1. clock.now() -> dt
//   2. imu.poll()  -> estimator.predict
//   3. gps.poll()  -> estimator.update_gps (when fresh)
//   4. build ControllerState from the *estimated* state (INV-3)
//   5. controller.calculate_control(estimate, target) -> moments
//   6. allocator.allocate(moments) -> fin deflections
//   7. fins.send(); radio.send(telemetry)
//   8. watchdog.kick()
// Faults (estimator divergence, watchdog expiry, HAL error) -> SafeMode.

#pragma once

#include "gnc-stm32/FlightState.h"
#include "gnc-stm32/Watchdog.h"
#include "gnc-stm32/FirmwareSignature.h"
#include "gnc-stm32/FlightBuildGuard.h"

#include "gnc-core/hal/HalFactory.h"
#include "gnc-core/estimation/ErrorStateKF.h"
#include "gnc-core/control/IController.h"
#include "gnc-core/control/IControlAllocator.h"
#include "gnc-core/types.h"

#include <memory>

namespace gnc::stm32 {

struct FlightConfig {
    double dt_s{0.005};                  // 200 Hz nominal GNC rate
    double gps_update_hz{10.0};
    Vec3   target_euler_rad{0.0, gnc::PI * 0.5, 0.0};  // vertical hold (pitch 90)
    double S_ref_m2{0.05853};
    double L_ref_m{0.273};
    double thrust_est_n{0.0};            // fed to the allocator state
    std::int64_t watchdog_timeout_ns{50'000'000};  // 50 ms

    // Initial nav seed.
    Vec3 p0_n{0.0, 0.0, 0.0};
    Vec3 v0_n{0.0, 0.0, 0.0};
    Quat q0_b_n{1.0, 0.0, 0.0, 0.0};
};

struct Telemetry {
    std::uint32_t tick{0};
    FlightState   state{FlightState::Boot};
    Vec3   pos_n{};
    Vec3   vel_n{};
    Vec3   euler_rad{};
    double fin_cmd_rad[gnc::control::kMaxFins]{};
    int    n_fins{0};
    bool   nav_valid{false};
    bool   healthy{true};
};

class FlightLoop {
public:
    FlightLoop(FlightConfig cfg,
               gnc::hal::HalSet hal,
               std::shared_ptr<gnc::control::IController> controller,
               std::shared_ptr<gnc::control::IControlAllocator> allocator,
               FirmwareSignature signature);

    // Boot -> SelfTest: probe HAL, run the flight-build guard, verify firmware,
    // initialise nav/controller. Returns false (and forces SafeMode in a flight
    // build) if the guard fails. `image` is the region to hash for signature
    // verification.
    bool boot(const FirmwareImage& image);

    // Operator commands (sequenced by the ground link in a real mission).
    bool arm();
    void abort();          // -> SafeMode
    bool detect_launch();  // Armed -> Flight

    // One GNC cycle. Safe to call in any state; only Armed/Flight/Descent drive
    // actuators. Returns the cycle telemetry.
    Telemetry tick();

    FlightState state() const { return state_; }
    const GuardReport& guard_report() const { return guard_; }

private:
    void enter_safe_mode(const char* reason);
    bool transition(FlightState to);

    FlightConfig cfg_;
    gnc::hal::HalSet hal_;
    std::shared_ptr<gnc::control::IController> ctrl_;
    std::shared_ptr<gnc::control::IControlAllocator> alloc_;
    FirmwareSignature sig_;

    gnc::estimation::ErrorStateKF nav_;
    Watchdog wd_;
    GuardReport guard_;

    FlightState state_{FlightState::Boot};
    std::uint32_t tick_count_{0};
    double gps_accum_s_{0.0};
    bool nav_initialized_{false};
};

}  // namespace gnc::stm32
