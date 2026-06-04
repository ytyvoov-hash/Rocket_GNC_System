// gnc-android/AndroidClock.h
//
// v8 P5.2. Native IClock for the Android (Path A) host, backed by
// CLOCK_MONOTONIC. Registers with the gnc-core HAL factory via the same
// registrar pattern the STM32H7 clock uses. Compiles and runs on the host
// (Linux/macOS) so the bridge is testable without a phone.

#pragma once

#include "gnc-core/hal/IClock.h"

namespace gnc::android {

class AndroidClock final : public gnc::hal::IClock {
public:
    gnc::TimePoint now() const override;
    void sleep_until(gnc::TimePoint until) override;
};

// Registers AndroidClock as the native IClock with the gnc-core factory.
void register_android_clock();

}  // namespace gnc::android
