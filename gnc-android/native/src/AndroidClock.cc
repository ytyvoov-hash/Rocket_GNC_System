// gnc-android/AndroidClock.cc — CLOCK_MONOTONIC IClock (v8 P5.2).
#include "gnc-android/AndroidClock.h"

#include "gnc-core/hal/HalFactory.h"

#include <ctime>
#include <memory>
#include <thread>

namespace gnc::android {

gnc::TimePoint AndroidClock::now() const {
    struct timespec ts {};
    clock_gettime(CLOCK_MONOTONIC, &ts);
    const std::int64_t ns =
        static_cast<std::int64_t>(ts.tv_sec) * 1'000'000'000LL + ts.tv_nsec;
    return gnc::TimePoint{ns};
}

void AndroidClock::sleep_until(gnc::TimePoint until) {
    const std::int64_t delta = until.ns_since_boot - now().ns_since_boot;
    if (delta > 0) std::this_thread::sleep_for(std::chrono::nanoseconds(delta));
}

void register_android_clock() {
    gnc::hal::register_clock_factory(
        []() -> std::unique_ptr<gnc::hal::IClock> { return std::make_unique<AndroidClock>(); });
}

}  // namespace gnc::android
