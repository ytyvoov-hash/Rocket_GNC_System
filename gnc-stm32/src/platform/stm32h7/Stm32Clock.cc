// gnc-stm32/src/platform/stm32h7/Stm32Clock.cc
//
// v8 P5.1. Native IClock for the STM32H7, backed by the DWT cycle counter
// (CYCCNT) for sub-microsecond monotonic time. Compiled ONLY for the
// cross-target build (GNC_TARGET_STM32H7); on the host this translation unit is
// excluded so the bench build needs no CMSIS headers.
//
// This is the template every native HAL driver follows: implement the gnc-core
// interface, then register a factory so HalFactory::build_default() resolves to
// it instead of the stub. The remaining drivers (IImu over SPI, IGps over UART,
// IFinDriver over CAN/rudder_7b, IPyro over GPIO) follow the same shape and are
// brought up against bench hardware as part of HIL.

#if defined(GNC_TARGET_STM32H7)

#include "gnc-core/hal/HalFactory.h"
#include "gnc-core/hal/IClock.h"

#include "stm32h7xx.h"  // CMSIS device header (vendor SDK, target-only)

namespace gnc::hal {

namespace {

class Stm32Clock final : public IClock {
public:
    Stm32Clock() {
        // Enable the DWT cycle counter (one-time).
        CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
        DWT->LAR = 0xC5ACCE55;  // unlock (Cortex-M7)
        DWT->CYCCNT = 0;
        DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
        cycles_per_ns_ = static_cast<double>(SystemCoreClock) / 1e9;
    }

    TimePoint now() const override {
        const std::uint32_t c = DWT->CYCCNT;
        return TimePoint{static_cast<std::int64_t>(c / cycles_per_ns_)};
    }

    // The flight loop is scheduled by the RTOS tick / timer ISR, not this call;
    // a busy-wait here is acceptable only for bring-up.
    void sleep_until(TimePoint until) override {
        while (now().ns_since_boot < until.ns_since_boot) { __NOP(); }
    }

private:
    double cycles_per_ns_{1.0};
};

std::unique_ptr<IClock> make_stm32_clock() {
    return std::make_unique<Stm32Clock>();
}

// Register at static-init so build_default() finds the native clock.
struct Stm32ClockRegistrar {
    Stm32ClockRegistrar() { register_clock_factory(&make_stm32_clock); }
};
Stm32ClockRegistrar g_stm32_clock_registrar;

}  // namespace
}  // namespace gnc::hal

#endif  // GNC_TARGET_STM32H7
