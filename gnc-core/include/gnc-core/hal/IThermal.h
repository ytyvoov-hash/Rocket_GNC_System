// gnc-core/hal/IThermal.h
// Thermal monitoring abstraction. CPU temp + heap free + load. Used by S13
// hardware health monitor (1 Hz) and by safety/AbortPolicyEngine.

#pragma once

#include <cstdint>

namespace gnc::hal {

struct ThermalSample {
    double cpu_temp_c{0};
    double cpu_load_pct{0};
    std::uint32_t heap_free_kb{0};
    std::uint32_t stack_high_water_kb{0};
};

class IThermal {
public:
    virtual ~IThermal() = default;
    virtual ThermalSample sample() = 0;
};

}  // namespace gnc::hal
