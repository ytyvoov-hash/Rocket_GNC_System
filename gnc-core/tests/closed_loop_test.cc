// gnc-core/tests/closed_loop_test.cc
//
// v8 P4.1 (Quality §golden set + closed-loop GNC regression). Two things the
// audit flagged as missing: (1) `rockets/BA/golden/` was empty — no acceptance
// baseline, so physics/integrator regressions go undetected; (2) there was no
// end-to-end GNC-loop test exercising integrator + estimator + controller +
// allocator together on *estimated* state (INV-3).
//
// This file provides both, self-contained (no file IO so it is CI-portable):
//
//   * GOLDEN ACCEPTANCE BASELINE — eight envelope cells (mirrors
//     rockets/BA/scenarios.yaml) run as deterministic ballistic ascents of the
//     canonical Full6DOF integrator; each cell's metrics are asserted against
//     the committed golden (rockets/BA/golden/golden_metrics.csv) within the
//     bounds in rockets/BA/tolerances.yaml:golden_metrics. A behavioural change
//     in the integrator now fails here. Verified byte-identical at -O0 / -O2.
//
//   * CLOSED-LOOP GNC PIPELINE — the full loop on FeedbackSource::Estimated
//     (ErrorStateKF in the loop). Asserts integration-level invariants that hold
//     regardless of control-law quality: finite trajectory, propellant fully
//     burned, bounded body rates, and run-to-run determinism. Quantitative
//     attitude-tracking goldens are deliberately omitted — the control laws are
//     still the audited PD stubs and the plan warns a golden on stub internals
//     bakes in wrong behaviour; those arrive with controller graduation.

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include "gnc-core/sim/Full6DOFIntegrator.h"
#include "gnc-core/control/ControllerFactory.h"

#include <cmath>

using namespace gnc;
using namespace gnc::sim;
using namespace gnc::control;
using Catch::Matchers::WithinAbs;
using Catch::Matchers::WithinRel;

namespace {

// BA reference mass/inertia/geometry shared by every cell (rocket_properties.yaml).
void apply_ba_reference(SimConfig& c) {
    c.sim_mode = Mode::Full;
    c.dt_s = 0.005;
    c.r0_n = {0.0, 0.0, 0.0};
    c.q0_b_n = {1.0, 0.0, 0.0, 0.0}; // body -Z (thrust) aligned with NED -Z = up
    c.mass_dry_kg = 283.89;
    c.full.inertia_wet.m[0][0] = 6.77;
    c.full.inertia_wet.m[1][1] = 1290.08;
    c.full.inertia_wet.m[2][2] = 1290.08;
    c.full.inertia_dry.m[0][0] = 4.04;
    c.full.inertia_dry.m[1][1] = 936.08;
    c.full.inertia_dry.m[2][2] = 936.08;
    c.full.S_ref_m2 = 0.05853;
    c.full.L_ref_m = 0.273;
}

struct CellGolden {
    const char* id;
    double thrust_n, burn_s, mass_init_kg;
    double apogee_m, t_apogee_s, v_max_ms, mach_max, t_burnout_s, mass_final_kg;
};

// Mirrors rockets/BA/golden/golden_metrics.csv (8 envelope cells).
constexpr CellGolden kGolden[] = {
    {"cell1", 40000, 13.1, 568.89, 23960.680, 65.225,  985.927, 2.8973, 13.055, 284.869},
    {"cell2", 50000, 13.1, 568.89, 29085.321, 68.510, 1212.755, 3.5639, 13.055, 284.869},
    {"cell3", 60000, 13.1, 568.89, 33489.254, 70.735, 1424.155, 4.1851, 13.055, 284.869},
    {"cell4", 70000, 13.1, 568.89, 37360.347, 72.345, 1622.058, 4.7667, 13.055, 284.869},
    {"cell5", 55000, 10.0, 568.89, 24688.591, 63.785, 1091.882, 3.2087,  9.965, 284.888},
    {"cell6", 45000, 16.0, 568.89, 31924.599, 71.900, 1252.511, 3.6807, 15.945, 284.870},
    {"cell7", 50000, 13.1, 520.00, 30205.554, 69.025, 1256.494, 3.6924, 13.045, 284.881},
    {"cell8", 50000, 13.1, 620.00, 27996.391, 67.970, 1170.009, 3.4383, 13.065, 284.788},
};

// tolerances.yaml:golden_metrics
constexpr double kApogeeRel   = 0.005;
constexpr double kVMaxRel     = 0.005;
constexpr double kMachRel     = 0.005;
constexpr double kTApogeeAbs  = 0.20;
constexpr double kTBurnoutAbs = 0.20;
constexpr double kMassFinAbs  = 2.0;
constexpr double kSpeedOfSound = 340.29; // generator reference (matches golden)

struct CellResult {
    double apogee_m{0}, t_apogee_s{0}, v_max_ms{0}, mach_max{0};
    double t_burnout_s{-1}, mass_final_kg{0};
};

// Deterministic ballistic vertical ascent — the golden generator.
CellResult run_ballistic(double thrust_n, double burn_s, double mass_init_kg) {
    SimConfig c;
    apply_ba_reference(c);
    c.t_end_s = 600.0;
    c.feedback_source = FeedbackSource::Truth; // no controller -> pure dynamics
    c.v0_n = {0.0, 0.0, 0.0};
    c.thrust_N = thrust_n;
    c.burn_time_s = burn_s;
    c.mass_init_kg = mass_init_kg;

    Full6DOFIntegrator sim(c);
    CellResult r;
    double prev_alt = -1e9;
    for (int i = 0; i < 120000; ++i) {
        SimFrame f = sim.step();
        if (f.altitude_msl_m > r.apogee_m) { r.apogee_m = f.altitude_msl_m; r.t_apogee_s = f.t_s; }
        if (f.speed_m_s > r.v_max_ms) r.v_max_ms = f.speed_m_s;
        const double mach = f.speed_m_s / kSpeedOfSound;
        if (mach > r.mach_max) r.mach_max = mach;
        if (r.t_burnout_s < 0 && f.mass_kg <= c.mass_dry_kg + 1.0) {
            r.t_burnout_s = f.t_s; r.mass_final_kg = f.mass_kg;
        }
        if (f.altitude_msl_m < prev_alt && f.t_s > burn_s && f.altitude_msl_m < r.apogee_m - 100.0)
            break;
        prev_alt = f.altitude_msl_m;
    }
    return r;
}

struct LoopResult {
    double apogee_m{0}, max_rate_rad_s{0}, mass_final_kg{0};
    bool finite{true};
    int steps{0};
};

// Full closed-loop GNC pipeline on estimated state (INV-3).
LoopResult run_closed_loop() {
    SimConfig c;
    apply_ba_reference(c);
    c.t_end_s = 60.0;
    c.feedback_source = FeedbackSource::Estimated; // ErrorStateKF in the loop
    c.v0_n = {0.0, 0.0, -0.1};
    c.thrust_N = 50000.0;
    c.burn_time_s = 13.1;
    c.mass_init_kg = 568.89;
    c.sensor_params.accel_noise_density = 0.02;
    c.sensor_params.gyro_noise_density = 0.001;
    c.sensor_params.gps_pos_std = 1.5;
    c.sensor_params.gps_vel_std = 0.1;
    c.gps_update_hz = 10.0;

    TuningParams tp;
    tp.algorithm = "PID";
    tp.controller_type = "fins";
    tp.kp = 4.0; tp.ki = 0.0; tp.kd = 2.0;
    tp.n_fins = 4; tp.fin_layout = "cruciform";
    tp.Cl_delta = 0.01; tp.Cm_delta = 0.5; tp.Cn_delta = 0.5;
    tp.fin_delta_max_rad = 20.0 * gnc::DEG2RAD;
    auto [ctrl, alloc] = ControllerFactory::create(tp);
    c.controller = ctrl;
    c.allocator = alloc;

    Full6DOFIntegrator sim(c);
    LoopResult r;
    double prev_alt = -1e9;
    for (int i = 0; i < 12000; ++i) {
        SimFrame f = sim.step();
        ++r.steps;
        if (f.altitude_msl_m > r.apogee_m) r.apogee_m = f.altitude_msl_m;
        const double rate = std::sqrt(f.omega_b_b.x * f.omega_b_b.x +
                                      f.omega_b_b.y * f.omega_b_b.y +
                                      f.omega_b_b.z * f.omega_b_b.z);
        if (rate > r.max_rate_rad_s) r.max_rate_rad_s = rate;
        if (!std::isfinite(f.altitude_msl_m) || !std::isfinite(rate)) r.finite = false;
        r.mass_final_kg = f.mass_kg;
        if (f.altitude_msl_m < prev_alt && f.t_s > 14.0 && f.altitude_msl_m < r.apogee_m - 100.0)
            break;
        prev_alt = f.altitude_msl_m;
    }
    return r;
}

}  // namespace

TEST_CASE("BA golden acceptance baseline — 8 envelope cells", "[golden][acceptance]") {
    for (const auto& g : kGolden) {
        DYNAMIC_SECTION("cell " << g.id) {
            CellResult r = run_ballistic(g.thrust_n, g.burn_s, g.mass_init_kg);
            CHECK_THAT(r.apogee_m,    WithinRel(g.apogee_m, kApogeeRel));
            CHECK_THAT(r.v_max_ms,    WithinRel(g.v_max_ms, kVMaxRel));
            CHECK_THAT(r.mach_max,    WithinRel(g.mach_max, kMachRel));
            CHECK_THAT(r.t_apogee_s,  WithinAbs(g.t_apogee_s, kTApogeeAbs));
            CHECK_THAT(r.t_burnout_s, WithinAbs(g.t_burnout_s, kTBurnoutAbs));
            CHECK_THAT(r.mass_final_kg, WithinAbs(g.mass_final_kg, kMassFinAbs));
        }
    }
}

TEST_CASE("Closed-loop GNC pipeline runs on estimated state (INV-3)", "[closed_loop]") {
    LoopResult r = run_closed_loop();

    SECTION("trajectory is finite and propellant fully burned") {
        CHECK(r.finite);
        CHECK(r.steps > 0);
        // mass_init 568.89 -> dry 283.89; loop must deplete to ~dry.
        CHECK_THAT(r.mass_final_kg, WithinAbs(283.89, 2.0));
    }
    SECTION("vehicle ascends to a physically sensible apogee") {
        CHECK(r.apogee_m > 5000.0);
        CHECK(r.apogee_m < 60000.0);
    }
    SECTION("body rates stay bounded (loop does not numerically diverge)") {
        CHECK(r.max_rate_rad_s < 10.0);
    }
}

TEST_CASE("Closed-loop pipeline is deterministic (fixed seed)", "[closed_loop][determinism]") {
    LoopResult a = run_closed_loop();
    LoopResult b = run_closed_loop();
    CHECK(a.apogee_m == b.apogee_m);
    CHECK(a.max_rate_rad_s == b.max_rate_rad_s);
    CHECK(a.mass_final_kg == b.mass_final_kg);
    CHECK(a.steps == b.steps);
}
