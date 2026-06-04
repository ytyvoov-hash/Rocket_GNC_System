// gnc-core/tests/smoke_test.cc
// Verifies:
//   1. The stub HAL boots when no native factories are registered.
//   2. Flight-build mode refuses to fall back to the stub (v5.4 §1.5.1).
//   3. Separation-trigger registry matches v5.4 Decision 16.

#include <catch2/catch_test_macros.hpp>
#include <stdexcept>

#include "gnc-core/types.h"
#include "gnc-core/hal/HalFactory.h"
#include "gnc-core/sep/SeparationTrigger.h"

using namespace gnc;

TEST_CASE("Stub HAL boots and emits gravity", "[hal][stub]")
{
    auto hs = hal::build_default(/*flight_build=*/false);

    REQUIRE(hs.clock);
    REQUIRE(hs.imu);
    REQUIRE(hs.gps);
    REQUIRE(hs.can);
    REQUIRE(hs.pyro);
    REQUIRE(hs.radio);
    REQUIRE(hs.thermal);
    REQUIRE(hs.fins);
    REQUIRE(hs.seeker);
    REQUIRE(hs.any_stubbed);   // no native factories registered in this test

    auto imu = hs.imu->poll();
    REQUIRE(imu.valid);
    REQUIRE(imu.acc_b.z > 9.0);   // gravity present in body Z
}

TEST_CASE("Flight build refuses the stub", "[hal][flight_build]")
{
    REQUIRE_THROWS_AS(hal::build_default(/*flight_build=*/true), std::runtime_error);
}

TEST_CASE("Separation triggers match Decision 16", "[sep]")
{
    using gnc::sep::Trigger;
    using gnc::sep::from_string;
    using gnc::sep::to_string;

    Trigger t;
    REQUIRE(from_string("burnout",  t));
    REQUIRE(from_string("time",     t));
    REQUIRE(from_string("altitude", t));
    REQUIRE(from_string("velocity", t));
    REQUIRE(from_string("event",    t));

    // The legacy FE value 'manual' must NOT resolve (renamed to 'event').
    REQUIRE_FALSE(from_string("manual", t));

    REQUIRE(to_string(Trigger::Event) == "event");
}

TEST_CASE("FlightPhase enum values mirror MisPlot 77-byte frame phase codes", "[types]")
{
    REQUIRE(static_cast<int>(FlightPhase::Prelaunch) == 0);
    REQUIRE(static_cast<int>(FlightPhase::BoostS1)   == 1);
    REQUIRE(static_cast<int>(FlightPhase::CoastS1)   == 2);
    REQUIRE(static_cast<int>(FlightPhase::Sep1to2)   == 3);
    REQUIRE(static_cast<int>(FlightPhase::BoostS2)   == 4);
    REQUIRE(static_cast<int>(FlightPhase::CoastS2)   == 5);
    REQUIRE(static_cast<int>(FlightPhase::Terminal)  == 6);
}
