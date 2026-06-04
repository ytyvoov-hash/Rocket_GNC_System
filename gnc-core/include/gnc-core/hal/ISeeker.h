// gnc-core/hal/ISeeker.h
// Seeker subsystem abstraction. Path A hosts the seeker on the Snapdragon
// (Adreno GPU / Hexagon / CPU); Path B hosts it on a Jetson Nano reachable
// over UART or CAN. v5.4 Decision 5.

#pragma once

#include <cstdint>

namespace gnc::hal {

// MisPlot mode bytes per §7.3.12.
enum class SeekerMode : std::uint8_t {
    Idle              = 0xBF,
    Searching         = 0xC0,
    Tracking          = 0xC1,
    Locked            = 0xC2,
    LostLockCoasting  = 0xC3,
    Fault             = 0xCF,
};

struct SeekerLos {
    double los_az_deg{0};
    double los_el_deg{0};
    double los_rate_az_deg_s{0};
    double los_rate_el_deg_s{0};
    double target_range_m{0};      // -1 if unknown
    SeekerMode mode{SeekerMode::Idle};
    bool valid{false};
};

class ISeeker {
public:
    virtual ~ISeeker() = default;

    // Poll the latest LOS measurement. Bench stub returns Idle.
    virtual SeekerLos poll() = 0;

    // Mission-time mode requests; the seeker is the source of truth and may
    // refuse (e.g. Tracking -> Searching).
    virtual bool request_mode(SeekerMode m) = 0;
};

}  // namespace gnc::hal
