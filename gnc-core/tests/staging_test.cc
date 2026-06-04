// gnc-core/tests/staging_test.cc
//
// v8 P3.3 (Aerospace §staging) regression. The audit flagged SeparationTrigger.h
// as defined but referenced nowhere: no mass discontinuity at separation and no
// per-stage reconfiguration. These tests run a ballistic Full6DOF vehicle (no
// controller -> pure dynamics) and check that a configured StageSeparation:
//   * fires exactly once, on the first step its trigger condition is met;
//   * removes the jettisoned mass instantaneously;
//   * advances stage_index and stamps the separation label/phase;
//   * switches the active dry mass for the upper stage;
//   * leaves a single-stage vehicle (empty stage_separations) unchanged.

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include "gnc-core/sim/Full6DOFIntegrator.h"

#include <cmath>

using namespace gnc;
using namespace gnc::sim;
using Catch::Matchers::WithinAbs;

namespace {

// A minimal ballistic config: no thrust, no aero, mass_init == mass_dry so the
// only mass change comes from staging. Starts at 1000 m MSL ascending at
// 100 m/s (NED z is down, so v.z < 0 is up).
SimConfig ballistic_config() {
    SimConfig cfg;
    cfg.sim_mode = Mode::Full;
    cfg.dt_s = 0.1;
    cfg.t_end_s = 100.0;
    cfg.feedback_source = FeedbackSource::Truth; // no estimator/controller needed
    cfg.r0_n = {0.0, 0.0, -1000.0};
    cfg.v0_n = {0.0, 0.0, -100.0};
    cfg.mass_init_kg = 100.0;
    cfg.mass_dry_kg = 100.0;
    cfg.ground_alt_m = -1e9; // never "land" during the test
    for (int i = 0; i < 3; ++i) {
        cfg.full.inertia_wet.m[i][i] = 10.0;
        cfg.full.inertia_dry.m[i][i] = 10.0;
    }
    return cfg;
}

}  // namespace

TEST_CASE("Time-triggered separation jettisons mass exactly once", "[staging]") {
    SimConfig cfg = ballistic_config();
    StageSeparation sep;
    sep.trigger = gnc::sep::Trigger::Time;
    sep.trigger_value = 0.5;          // s
    sep.jettison_mass_kg = 30.0;
    sep.next_mass_dry_kg = 70.0;
    sep.label = "stage1_sep";
    cfg.stage_separations = {sep};

    Full6DOFIntegrator sim(cfg);

    int fire_count = 0;
    double mass_before = 0.0, mass_after = 0.0;
    double t_fire = -1.0;
    for (int i = 0; i < 30; ++i) {
        const double m_prev = sim.current().mass_kg;
        SimFrame f = sim.step();
        if (f.separation_fired) {
            ++fire_count;
            mass_before = m_prev;
            mass_after = f.mass_kg;
            t_fire = f.t_s;
            CHECK(f.separation_label == "stage1_sep");
            CHECK(f.stage_index == 1);
            CHECK(f.phase == FlightPhase::Sep1to2);
        }
    }

    CHECK(fire_count == 1);                                   // fires once only
    CHECK(t_fire >= 0.5);                                     // at/after trigger
    CHECK_THAT(mass_before - mass_after, WithinAbs(30.0, 1e-9)); // mass dropped
    // After separation the vehicle persists at the reduced mass and stage 1.
    CHECK_THAT(sim.current().mass_kg, WithinAbs(70.0, 1e-9));
    CHECK(sim.current().stage_index == 1);
    CHECK_FALSE(sim.current().separation_fired); // not still firing afterwards
}

TEST_CASE("Altitude-triggered separation fires when crossing the threshold", "[staging]") {
    SimConfig cfg = ballistic_config();
    StageSeparation sep;
    sep.trigger = gnc::sep::Trigger::Altitude;
    sep.trigger_value = 1050.0;       // m MSL; starts at 1000 m ascending
    sep.jettison_mass_kg = 10.0;
    cfg.stage_separations = {sep};

    Full6DOFIntegrator sim(cfg);

    bool fired = false;
    double alt_at_fire = 0.0;
    for (int i = 0; i < 60; ++i) {
        SimFrame f = sim.step();
        if (f.separation_fired) {
            fired = true;
            alt_at_fire = f.altitude_msl_m;
            break;
        }
    }
    REQUIRE(fired);
    CHECK(alt_at_fire >= 1050.0);
    CHECK_THAT(sim.current().mass_kg, WithinAbs(90.0, 1e-9));
}

TEST_CASE("Event trigger never auto-fires in the core sim", "[staging]") {
    SimConfig cfg = ballistic_config();
    StageSeparation sep;
    sep.trigger = gnc::sep::Trigger::Event; // externally commanded only
    sep.jettison_mass_kg = 50.0;
    cfg.stage_separations = {sep};

    Full6DOFIntegrator sim(cfg);
    for (int i = 0; i < 50; ++i) {
        SimFrame f = sim.step();
        CHECK_FALSE(f.separation_fired);
    }
    CHECK_THAT(sim.current().mass_kg, WithinAbs(100.0, 1e-9)); // unchanged
    CHECK(sim.current().stage_index == 0);
}

TEST_CASE("Single-stage vehicle (no events) is unchanged", "[staging]") {
    SimConfig cfg = ballistic_config(); // empty stage_separations
    Full6DOFIntegrator sim(cfg);
    for (int i = 0; i < 50; ++i) {
        SimFrame f = sim.step();
        CHECK_FALSE(f.separation_fired);
        CHECK(f.stage_index == 0);
    }
    CHECK_THAT(sim.current().mass_kg, WithinAbs(100.0, 1e-9));
}

TEST_CASE("Two sequential separations fire in order", "[staging]") {
    SimConfig cfg = ballistic_config();
    StageSeparation s1;
    s1.trigger = gnc::sep::Trigger::Time;
    s1.trigger_value = 0.3;
    s1.jettison_mass_kg = 20.0;
    s1.label = "sep1";
    StageSeparation s2;
    s2.trigger = gnc::sep::Trigger::Time;
    s2.trigger_value = 0.8;
    s2.jettison_mass_kg = 15.0;
    s2.label = "sep2";
    cfg.stage_separations = {s1, s2};

    Full6DOFIntegrator sim(cfg);
    std::vector<std::string> fired_labels;
    for (int i = 0; i < 30; ++i) {
        SimFrame f = sim.step();
        if (f.separation_fired) fired_labels.push_back(f.separation_label);
    }
    REQUIRE(fired_labels.size() == 2);
    CHECK(fired_labels[0] == "sep1");
    CHECK(fired_labels[1] == "sep2");
    CHECK(sim.current().stage_index == 2);
    CHECK_THAT(sim.current().mass_kg, WithinAbs(100.0 - 20.0 - 15.0, 1e-9));
}
