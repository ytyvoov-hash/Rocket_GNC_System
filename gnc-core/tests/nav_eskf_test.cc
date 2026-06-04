// gnc-core/tests/nav_eskf_test.cc
//
// v8 P1.1 (Navigation §4) nav-accuracy regression for the error-state KF that
// closes the SIL loop on estimated state (INV-3). Drives the filter with
// synthetic noisy IMU + GPS generated from a known truth trajectory and bounds
// the estimate error vs truth — the success criterion for estimator-in-the-loop.

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include "gnc-core/estimation/ErrorStateKF.h"

#include <Eigen/Dense>
#include <cmath>
#include <random>

using namespace gnc;
using namespace gnc::estimation;

namespace {

Eigen::Matrix3d R_of(const Quat& q) {
    Eigen::Quaterniond e(q.w, q.x, q.y, q.z);
    e.normalize();
    return e.toRotationMatrix();
}

}  // namespace

TEST_CASE("ESKF bounds estimate error vs truth over a boost/coast trajectory",
          "[estimation][nav][INV-3]") {
    const double dt = 0.01;       // 100 Hz IMU
    const int    N  = 6000;       // 60 s
    const int    gps_every = 10;  // 10 Hz GPS
    const Eigen::Vector3d g_n(0, 0, 9.80665);

    Eigen::Vector3d p(0, 0, 0), v(0, 0, 0);
    const Quat q_truth{0.9961947, 0.0871557, 0.0, 0.0};  // 10° roll, constant
    const Eigen::Matrix3d Rbn = R_of(q_truth);

    EskfParams prm;
    ErrorStateKF kf;
    // Deliberately wrong initial attitude (level) + position offset: the filter
    // must pull the estimate toward truth, proving it is actually estimating.
    kf.initialize(Vec3{3, -2, 1}, Vec3{0, 0, 0}, Quat{1, 0, 0, 0}, prm);

    std::mt19937 rng(42);
    std::normal_distribution<double> nd(0.0, 1.0);

    double max_pos_err = 0.0, max_att_err = 0.0;

    for (int k = 0; k < N; ++k) {
        const double t = k * dt;
        Eigen::Vector3d a_n(0, 0, 0);
        if (t < 8.0) a_n = Eigen::Vector3d(0, 0, -2.0 * 9.80665);  // 2 g boost (up)
        const Eigen::Vector3d f_n = a_n - g_n;
        const Eigen::Vector3d f_b = Rbn.transpose() * f_n;

        p += v * dt + 0.5 * a_n * dt * dt;
        v += a_n * dt;

        Vec3 accel_meas{f_b(0) + 0.05 * nd(rng), f_b(1) + 0.05 * nd(rng),
                        f_b(2) + 0.05 * nd(rng)};
        Vec3 gyro_meas{0.001 * nd(rng), 0.001 * nd(rng), 0.001 * nd(rng)};
        kf.predict(accel_meas, gyro_meas, dt);

        if (k % gps_every == 0) {
            kf.update_gps(
                Vec3{p(0) + 1.5 * nd(rng), p(1) + 1.5 * nd(rng), p(2) + 1.5 * nd(rng)},
                Vec3{v(0) + 0.2 * nd(rng), v(1) + 0.2 * nd(rng), v(2) + 0.2 * nd(rng)});
        }

        const EstimatorState s = kf.state();
        REQUIRE(s.valid);

        const Eigen::Vector3d pe(s.pos_n.x - p(0), s.pos_n.y - p(1), s.pos_n.z - p(2));
        Eigen::Quaterniond qe(s.q_b_n.w, s.q_b_n.x, s.q_b_n.y, s.q_b_n.z);
        qe.normalize();
        Eigen::Quaterniond qt(q_truth.w, q_truth.x, q_truth.y, q_truth.z);
        qt.normalize();
        const double att_err = 2.0 * std::acos(std::min(1.0, std::fabs(qe.dot(qt))));

        if (t > 5.0) {  // steady-state window (after convergence)
            max_pos_err = std::max(max_pos_err, pe.norm());
            max_att_err = std::max(max_att_err, att_err);
        }
    }

    INFO("max steady-state pos err (m) = " << max_pos_err);
    INFO("max steady-state att err (deg) = " << max_att_err * 180.0 / M_PI);

    // GPS position 1σ is 1.5 m; a converged filter must hold well under 5 m.
    REQUIRE(max_pos_err < 5.0);
    // Started 10° off in roll; filter must converge attitude to < 6°.
    REQUIRE(max_att_err < 6.0 * M_PI / 180.0);
    REQUIRE(kf.state().valid);
}

TEST_CASE("ESKF reports valid state immediately after initialize",
          "[estimation][nav]") {
    EskfParams prm;
    ErrorStateKF kf;
    REQUIRE_FALSE(kf.initialized());
    kf.initialize(Vec3{0, 0, 0}, Vec3{0, 0, 0}, Quat{1, 0, 0, 0}, prm);
    REQUIRE(kf.initialized());
    const auto s = kf.state();
    REQUIRE(s.valid);
    REQUIRE_FALSE(kf.diverged());
}
