// gnc-stm32/FlightBuildGuard.h
//
// v8 INV-6 (flight-build hardening). A flight binary must refuse to run if it
// is not actually flight-worthy. This guard is checked during SelfTest; any
// failure forces SafeMode before the vehicle can be armed.
//
// Flight build fails closed if ANY of:
//   * a HAL interface fell back to the in-process stub (hal.any_stubbed) — a
//     flight board must have every real driver present;
//   * the dev auth bypass was compiled in (GNC_ALLOW_AUTH_BYPASS) — mirrors the
//     P0.2 backend hardening so the ground link cannot be spoofed;
//   * the firmware image is unsigned or its digest does not match the expected
//     hash (FirmwareSignature).
//
// On the host bench (GNC_FLIGHT_BUILD undefined) the guard is advisory: it
// reports the same findings but does not force SafeMode, so the loop is
// exercisable with stub HALs in CI.

#pragma once

#include "gnc-core/hal/HalFactory.h"
#include "gnc-stm32/FirmwareSignature.h"

#include <string>
#include <vector>

namespace gnc::stm32 {

struct GuardReport {
    bool flight_build{false};
    bool any_stubbed{false};
    bool auth_bypass_compiled{false};
    bool firmware_verified{false};
    std::vector<std::string> failures;  // human-readable reasons

    // PASS iff nothing disqualifies a flight build. Always inspect `failures`.
    bool pass() const { return failures.empty(); }
};

class FlightBuildGuard {
public:
    // `firmware_verified` is the result of FirmwareSignature::verify().
    static GuardReport evaluate(const gnc::hal::HalSet& hal, bool firmware_verified);

    // True only when compiled as a flight build (GNC_FLIGHT_BUILD).
    static bool is_flight_build();
};

}  // namespace gnc::stm32
