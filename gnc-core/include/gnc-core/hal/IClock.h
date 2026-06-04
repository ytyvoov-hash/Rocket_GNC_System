// gnc-core/hal/IClock.h
// Monotonic clock abstraction. Implementations live in gnc-android / gnc-stm32 /
// gnc-backend / src/hal/stub. Pure interface — no implementation here.

#pragma once

#include "../types.h"

namespace gnc::hal {

class IClock {
public:
    virtual ~IClock() = default;

    // Monotonic nanoseconds since boot. Never goes backwards. Required to be
    // microsecond-accurate at minimum on every platform.
    virtual TimePoint now() const = 0;

    // Sleep for at least `ns_since_boot` past `until`. Bench-only; the flight
    // loop uses the platform scheduler, not this call.
    virtual void sleep_until(TimePoint until) = 0;
};

}  // namespace gnc::hal
