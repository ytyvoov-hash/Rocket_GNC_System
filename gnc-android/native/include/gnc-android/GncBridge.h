// gnc-android/GncBridge.h
//
// v8 P5.2. The Path A supervisory bridge: hosts the gnc-core GNC stack
// (ErrorStateKF estimator + controller + allocator) as the Android-side
// OUTER loop. Per docs/path_a_rt_suitability.md, the hard-RT inner loop stays
// on the STM32L431; this bridge consumes inner-loop SensorMsg snapshots, runs
// sensor fusion + outer-loop guidance/control on the estimated state (INV-3),
// and produces a CommandMsg back to the L431.
//
// The class is pure C++ (no JNI), so it runs in host unit tests. jni_glue.cc
// (built only with -DGNC_ANDROID_JNI) wraps it for the Kotlin app.

#pragma once

#include "gnc-android/Messages.h"

#include "gnc-core/estimation/ErrorStateKF.h"
#include "gnc-core/control/IController.h"
#include "gnc-core/control/IControlAllocator.h"
#include "gnc-core/types.h"

#include <memory>

namespace gnc::android {

struct BridgeConfig {
    double gps_min_interval_s{0.1};                    // throttle GPS updates
    gnc::Vec3 target_euler_rad{0.0, gnc::PI * 0.5, 0.0};  // vertical hold
    double S_ref_m2{0.05853};
    double L_ref_m{0.273};
    gnc::Vec3 p0_n{0, 0, 0};
    gnc::Vec3 v0_n{0, 0, 0};
    gnc::Quat q0_b_n{1, 0, 0, 0};
};

struct BridgeTelemetry {
    gnc::Vec3 pos_n{};
    gnc::Vec3 vel_n{};
    gnc::Vec3 euler_rad{};
    int n_fins{0};
    bool nav_valid{false};
    bool diverged{false};
};

class GncBridge {
public:
    GncBridge(BridgeConfig cfg,
              std::shared_ptr<gnc::control::IController> controller,
              std::shared_ptr<gnc::control::IControlAllocator> allocator);

    // Process one inner-loop sensor snapshot: ESKF predict (IMU) + update (GPS),
    // outer-loop control on the estimated state, allocation -> fin command.
    // `armed` reflects the operator/launch-authority state relayed by the app.
    // Returns the command to send back to the L431.
    CommandMsg step(const SensorMsg& s, bool armed);

    const BridgeTelemetry& telemetry() const { return tm_; }
    bool diverged() const { return nav_.diverged(); }

private:
    BridgeConfig cfg_;
    std::shared_ptr<gnc::control::IController> ctrl_;
    std::shared_ptr<gnc::control::IControlAllocator> alloc_;
    gnc::estimation::ErrorStateKF nav_;
    BridgeTelemetry tm_{};
    std::int64_t last_t_ns_{-1};
    double gps_accum_s_{0.0};
    bool nav_init_{false};
};

}  // namespace gnc::android
