// gnc-core/tests/alloc_test.cc
//
// v8 P3.1 (Control §3) allocator regression. The legacy FinAllocator was
// hardcoded to 4 fins and so could not fly the 8-fin (GH) / 12-fin (SA)
// templates. These tests exercise the template-driven, least-squares allocator
// across fin counts and a canard layout, and check that:
//   * the achieved body moment matches the demand when unsaturated;
//   * over-actuated (n>3) ring layouts allocate correctly;
//   * a canard layout sign-inverts the pitch/yaw deflection but still achieves
//     the demanded moment;
//   * per-fin saturation bounds deflections without producing more moment than
//     commanded.

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include "gnc-core/control/ControlAllocator.h"

#include <cmath>

using namespace gnc;
using namespace gnc::control;
using Catch::Matchers::WithinAbs;

namespace {

AllocatorState nominal_state() {
    AllocatorState s;
    s.q_dyn = 5.0e3;   // Pa
    s.S_ref = 0.05;    // m^2
    s.L_ref = 2.0;     // m
    s.thrust_n = 0.0;
    return s;
}

ControlEffort demand(double mx, double my, double mz) {
    ControlEffort e;
    e.moments_body = {mx, my, mz};
    return e;
}

}  // namespace

TEST_CASE("FinAllocator cruciform4 achieves the demanded moment", "[alloc]") {
    FinAllocator alloc(FinGeometry::cruciform4(0.1, 0.5, 0.5));
    const auto st = nominal_state();
    const auto cmds = alloc.allocate(demand(20.0, 50.0, -30.0), st);

    REQUIRE(cmds.n_fins == 4);
    // Unsaturated: achieved == demanded (to numerical tolerance).
    CHECK_THAT(cmds.allocated_aero_moment.x, WithinAbs(20.0, 1e-6));
    CHECK_THAT(cmds.allocated_aero_moment.y, WithinAbs(50.0, 1e-6));
    CHECK_THAT(cmds.allocated_aero_moment.z, WithinAbs(-30.0, 1e-6));
}

TEST_CASE("FinAllocator ring layouts allocate across fin counts", "[alloc]") {
    const auto st = nominal_state();
    const auto d = demand(15.0, 40.0, 25.0);

    for (int n : {6, 8, 12}) {
        FinAllocator alloc(FinGeometry::ring(n, 0.2, 0.6));
        const auto cmds = alloc.allocate(d, st);
        INFO("n_fins = " << n);
        REQUIRE(cmds.n_fins == n);
        // Over-actuated allocation still achieves the demand exactly.
        CHECK_THAT(cmds.allocated_aero_moment.x, WithinAbs(15.0, 1e-6));
        CHECK_THAT(cmds.allocated_aero_moment.y, WithinAbs(40.0, 1e-6));
        CHECK_THAT(cmds.allocated_aero_moment.z, WithinAbs(25.0, 1e-6));
        // Unused fin slots stay at zero.
        for (int i = n; i < kMaxFins; ++i) {
            CHECK(cmds.fins_rad[i] == 0.0);
        }
    }
}

TEST_CASE("Canard layout sign-inverts deflection but matches the moment", "[alloc]") {
    const auto st = nominal_state();
    const auto d = demand(0.0, 40.0, 0.0);  // pure pitch demand

    FinAllocator tail(FinGeometry::cruciform4(0.1, 0.5, 0.5));
    FinAllocator canard(FinGeometry::canard4(0.1, 0.5, 0.5));

    const auto tail_cmds = tail.allocate(d, st);
    const auto canard_cmds = canard.allocate(d, st);

    // Pitch fins are indices 1 and 3. The canard deflects opposite to the tail.
    CHECK_THAT(canard_cmds.fins_rad[1], WithinAbs(-tail_cmds.fins_rad[1], 1e-9));
    CHECK_THAT(canard_cmds.fins_rad[3], WithinAbs(-tail_cmds.fins_rad[3], 1e-9));
    CHECK(std::abs(tail_cmds.fins_rad[1]) > 1e-6);

    // Both still produce the demanded pitch moment.
    CHECK_THAT(tail_cmds.allocated_aero_moment.y, WithinAbs(40.0, 1e-6));
    CHECK_THAT(canard_cmds.allocated_aero_moment.y, WithinAbs(40.0, 1e-6));
}

TEST_CASE("Saturation bounds deflections and never over-produces moment", "[alloc]") {
    const auto st = nominal_state();
    // Absurdly large demand forces every fin to its position limit.
    FinAllocator alloc(FinGeometry::cruciform4(0.01, 0.05, 0.05, 0.35));
    const auto cmds = alloc.allocate(demand(1.0e9, 1.0e9, 1.0e9), st);

    for (int i = 0; i < cmds.n_fins; ++i) {
        INFO("fin " << i);
        CHECK(std::abs(cmds.fins_rad[i]) <= 0.35 + 1e-9);
    }
    // Achieved pitch moment cannot exceed what the saturated fins can produce.
    const double max_pitch = st.q_dyn * st.S_ref * st.L_ref * 0.05 * (2.0 * 0.35);
    CHECK(std::abs(cmds.allocated_aero_moment.y) <= max_pitch + 1e-6);
}

TEST_CASE("Zero dynamic pressure yields zero deflection", "[alloc]") {
    AllocatorState st = nominal_state();
    st.q_dyn = 0.0;
    FinAllocator alloc(FinGeometry::cruciform4(0.1, 0.5, 0.5));
    const auto cmds = alloc.allocate(demand(10.0, 10.0, 10.0), st);
    for (int i = 0; i < cmds.n_fins; ++i) {
        CHECK(cmds.fins_rad[i] == 0.0);
    }
}
