// gnc-stm32/Watchdog.h
//
// v8 P5.1 (Embedded). Deadline-monitor watchdog for the flight loop. Portable
// (host bench + target). On the STM32H7 the `pet_hw` hook is bound to the
// independent watchdog (IWDG) reload register; on the host it is a no-op, so
// the same control flow is exercised in CI.
//
// The flight loop must call kick() every cycle. If more than `timeout_ns`
// elapses between kicks (a hung or overrunning GNC step), expired() latches and
// the loop transitions to SafeMode. The hardware IWDG provides the independent
// backstop should the whole MCU hang (software cannot pet what it cannot reach).

#pragma once

#include "gnc-core/types.h"

#include <cstdint>
#include <functional>

namespace gnc::stm32 {

class Watchdog {
public:
    explicit Watchdog(std::int64_t timeout_ns = 50'000'000 /* 50 ms */)
        : timeout_ns_(timeout_ns) {}

    // Bind the hardware-watchdog reload (target). Optional; host leaves it unset.
    void set_hw_pet(std::function<void()> pet_hw) { pet_hw_ = std::move(pet_hw); }

    // Start/restart the deadline at `now`.
    void start(gnc::TimePoint now) {
        last_kick_ns_ = now.ns_since_boot;
        started_ = true;
        tripped_ = false;
    }

    // Called once per healthy cycle: refresh the deadline and pet the HW IWDG.
    void kick(gnc::TimePoint now) {
        if (!started_) start(now);
        last_kick_ns_ = now.ns_since_boot;
        if (pet_hw_) pet_hw_();
    }

    // True once the deadline has been missed (latching).
    bool expired(gnc::TimePoint now) {
        if (!started_) return false;
        if (now.ns_since_boot - last_kick_ns_ > timeout_ns_) tripped_ = true;
        return tripped_;
    }

    bool tripped() const { return tripped_; }
    std::int64_t timeout_ns() const { return timeout_ns_; }

private:
    std::int64_t timeout_ns_;
    std::int64_t last_kick_ns_{0};
    bool started_{false};
    bool tripped_{false};
    std::function<void()> pet_hw_;
};

}  // namespace gnc::stm32
