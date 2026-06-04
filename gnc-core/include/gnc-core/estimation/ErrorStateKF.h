// gnc-core/estimation/ErrorStateKF.h
//
// Self-contained 15-state error-state Kalman filter (ESKF) for rocket
// navigation, used to close the SIL loop on *estimated* state (v8 INV-3)
// rather than ground truth.
//
// The v8 audit (Navigation §4) found the navigation library was never
// instantiated and the sim fed the controller true attitude + raw GPS
// ("an Estimator would sit here"). This filter is wired into
// Full6DOFIntegrator so the controller now consumes an estimate produced from
// noisy IMU + GPS, which is the prerequisite for any representative SIL run.
//
// Error state (15): [ δp(3)  δv(3)  δθ(3)  δb_a(3)  δb_g(3) ]
//   δp   position error                  (NED, m)
//   δv   velocity error                  (NED, m/s)
//   δθ   attitude error (rotation vector, body frame, rad) — injected
//        multiplicatively onto the nominal quaternion (SO(3)), never additively
//   δb_a accelerometer bias error        (body, m/s²)
//   δb_g gyro bias error                 (body, rad/s)
//
// Conventions: quaternion q_b_n is Hamiltonian body→NED; gravity is NED with
// +z down. Inertial accel a_n = R(q)·(f_b − b_a) + g_n, where f_b is the
// measured specific force. Body rate ω_b = gyro − b_g.

#pragma once

#include "../types.h"
#include "IEstimator.h"

namespace gnc::estimation {

struct EskfParams {
    // Continuous noise densities.
    double sigma_a  = 0.30;   // accel white noise           (m/s²/√Hz)
    double sigma_g  = 0.01;   // gyro white noise            (rad/s/√Hz)
    double sigma_ba = 1e-3;   // accel bias random walk      (m/s³/√Hz)
    double sigma_bg = 1e-4;   // gyro bias random walk       (rad/s²/√Hz)

    // GPS measurement std-devs.
    double gps_pos_std = 1.5; // m
    double gps_vel_std = 0.2; // m/s

    // Gravity in NED (+z down).
    Vec3 gravity_n{0.0, 0.0, 9.80665};

    // Initial 1-σ uncertainties.
    double init_pos_std = 5.0;     // m
    double init_vel_std = 1.0;     // m/s
    double init_att_std = 0.1745;  // rad (~10°)
    double init_ba_std  = 0.1;     // m/s²
    double init_bg_std  = 0.01;    // rad/s
};

class ErrorStateKF {
public:
    ErrorStateKF() = default;

    // Seed the nominal state and reset the covariance to the configured
    // initial uncertainty.
    void initialize(const Vec3& p0_n, const Vec3& v0_n, const Quat& q0_b_n,
                    const EskfParams& params);

    bool initialized() const { return initialized_; }

    // IMU-driven propagation. accel_meas_b is the measured specific force
    // (body), gyro_meas_b the measured angular rate (body). dt > 0.
    void predict(const Vec3& accel_meas_b, const Vec3& gyro_meas_b, double dt);

    // GPS position + velocity update (NED).
    void update_gps(const Vec3& pos_n, const Vec3& vel_n);

    EstimatorState state() const;
    bool diverged() const { return diverged_; }

private:
    // Nominal state.
    Vec3 p_n_{};
    Vec3 v_n_{};
    Quat q_b_n_{1, 0, 0, 0};
    Vec3 ba_b_{};
    Vec3 bg_b_{};

    // 15×15 covariance, row-major, plain storage (no Eigen in the header).
    double P_[15][15] = {{0.0}};

    EskfParams prm_{};
    bool initialized_ = false;
    bool diverged_    = false;
};

}  // namespace gnc::estimation
