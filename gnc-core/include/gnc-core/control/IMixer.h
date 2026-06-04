// gnc-core/control/IMixer.h
// Fin / TVC allocation. The mixer enforces the more-restrictive of rocket-level
// and actuator-level limits (v5.4 §2.8.4) and writes saturation bitmasks to
// flight-log columns 102 and 103 (Decision 14).

#pragma once

#include "../types.h"
#include "IController.h"
#include "../hal/IFinDriver.h"

#include <cstdint>
#include <vector>

namespace gnc::control {

enum class SaturationStrategy : std::uint8_t {
    UniformReduction = 0,        // Default (Decision 14)
    Redistribute = 1,
    DemandReductionUpstream = 2,
};

struct MixerResult {
    std::vector<gnc::hal::FinCommand> fin_cmds;
    std::uint16_t rate_limited_mask{0};       // log column 102
    std::uint16_t position_limited_mask{0};   // log column 103
    double pitch_saturation{0};
    double yaw_saturation{0};
    double roll_saturation{0};
};

class IMixer {
public:
    virtual ~IMixer() = default;

    virtual MixerResult allocate(const TorqueDemand& demand,
                                 double mach,
                                 double altitude_m,
                                 double dt_s) = 0;

    virtual void set_strategy(SaturationStrategy s) = 0;
};

}  // namespace gnc::control
