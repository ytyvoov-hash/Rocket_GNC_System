// gnc-stm32/src/FlightBuildGuard.cc
#include "gnc-stm32/FlightBuildGuard.h"

namespace gnc::stm32 {

bool FlightBuildGuard::is_flight_build() {
#ifdef GNC_FLIGHT_BUILD
    return true;
#else
    return false;
#endif
}

GuardReport FlightBuildGuard::evaluate(const gnc::hal::HalSet& hal, bool firmware_verified) {
    GuardReport r;
    r.flight_build = is_flight_build();
    r.any_stubbed = hal.any_stubbed;
    r.firmware_verified = firmware_verified;
#ifdef GNC_ALLOW_AUTH_BYPASS
    r.auth_bypass_compiled = true;
#else
    r.auth_bypass_compiled = false;
#endif

    if (r.any_stubbed)
        r.failures.push_back("HAL fell back to stub driver(s) (any_stubbed)");
    if (r.auth_bypass_compiled)
        r.failures.push_back("auth bypass compiled in (GNC_ALLOW_AUTH_BYPASS)");
    if (!r.firmware_verified)
        r.failures.push_back("firmware unsigned or digest mismatch");

    return r;
}

}  // namespace gnc::stm32
