// gnc-core/estimation/IEstimator.h
// Polymorphic estimator interface. Concrete implementations:
//   ESKF15           (canonical primary, v5.4 §4.2)
//   MHE17            (optional refinement, v5.4 §4.3)
//   IMM              (multi-stage mode-switching, v5.4 §4.4)
//   Sequential       (legacy EKF fallback)
//   ComplementaryFilter (level-3 fallback)
//   DeadReckoning    (level-4 fallback)

#pragma once

#include "../types.h"
#include "../hal/IImu.h"
#include "../hal/IGps.h"

namespace gnc::estimation {

struct EstimatorState {
    Vec3 pos_n{};
    Vec3 vel_n{};
    Quat q_b_n{};
    Vec3 bias_a_b{};
    Vec3 bias_g_b{};
    double cov_pos_trace{0};
    double cov_att_trace{0};
    bool valid{false};
};

class IEstimator {
public:
    virtual ~IEstimator() = default;

    // Predict step: integrate IMU between updates.
    virtual void predict(const gnc::hal::ImuSample& imu, double dt_s) = 0;

    // Asynchronous update: GPS at ~10 Hz, baro on demand.
    virtual void update_gps(const gnc::hal::GpsSample& gps) = 0;

    virtual EstimatorState state() const = 0;

    // Diagnostic flag — drives the multi-level fallback in §4.6.
    virtual bool diverged() const = 0;
};

}  // namespace gnc::estimation
