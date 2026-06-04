// gnc-core/hal/IGps.h
// GPS receiver abstraction.

#pragma once

#include "../types.h"

namespace gnc::hal {

enum class GpsFix : std::uint8_t {
    NoFix = 0,
    Gps   = 1,
    Sbas  = 2,
    Rtk   = 3,
};

struct GpsSample {
    TimePoint t;
    double lat_deg{0};
    double lon_deg{0};
    double alt_m{0};
    Vec3 vel_n{};
    GpsFix fix{GpsFix::NoFix};
    std::uint8_t satellites{0};
    double hdop{99.0};
    double latency_ms{100.0};   // measurement-time-of-validity offset
    bool valid{false};
};

class IGps {
public:
    virtual ~IGps() = default;
    virtual GpsSample poll() = 0;
    virtual bool present() const = 0;
};

}  // namespace gnc::hal
