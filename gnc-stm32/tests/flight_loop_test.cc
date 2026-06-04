// gnc-stm32/tests/flight_loop_test.cc
//
// v8 P5.1. Host-build regression for the Path B flight application: SHA-256 +
// signing hook, INV-6 flight-build guard, the flight-loop state machine, the
// watchdog -> safe-mode path, and a closed GNC tick over the (stub) HAL. All
// run on the host so CI exercises the exact on-target control flow.

#include <catch2/catch_test_macros.hpp>

#include "gnc-stm32/FlightLoop.h"
#include "gnc-stm32/Sha256.h"
#include "gnc-stm32/FirmwareSignature.h"
#include "gnc-stm32/FlightBuildGuard.h"
#include "gnc-core/control/ControllerFactory.h"

#include <cstring>
#include <string>

using namespace gnc;
using namespace gnc::stm32;

namespace {

std::tuple<std::shared_ptr<control::IController>, std::shared_ptr<control::IControlAllocator>>
make_pid() {
    TuningParams tp;
    tp.algorithm = "PID";
    tp.controller_type = "fins";
    tp.kp = 4.0; tp.ki = 0.0; tp.kd = 2.0;
    tp.n_fins = 4; tp.fin_layout = "cruciform";
    tp.Cm_delta = 0.5; tp.Cn_delta = 0.5; tp.Cl_delta = 0.01;
    return control::ControllerFactory::create(tp);
}

FlightLoop make_bench_loop(const FlightConfig& cfg, const std::string& expected_hash = "") {
    hal::HalSet hal = hal::build_default(/*flight_build=*/false);
    auto [ctrl, alloc] = make_pid();
    return FlightLoop(cfg, std::move(hal), ctrl, alloc, FirmwareSignature(expected_hash));
}

}  // namespace

// ---------------------------------------------------------------------------
// SHA-256 known-answer (FIPS 180-4) — keeps the C++ digest in lockstep with the
// Python signing script (hashlib).
// ---------------------------------------------------------------------------
TEST_CASE("sha256 known vectors", "[fw]") {
    REQUIRE(Sha256::hash_hex(reinterpret_cast<const std::uint8_t*>(""), 0) ==
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const char* abc = "abc";
    REQUIRE(Sha256::hash_hex(reinterpret_cast<const std::uint8_t*>(abc), 3) ==
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    // A 1000-byte 'a' run crosses block boundaries.
    std::string big(1000, 'a');
    REQUIRE(Sha256::hash_hex(reinterpret_cast<const std::uint8_t*>(big.data()), big.size()).size() == 64);
}

// ---------------------------------------------------------------------------
// Firmware signature verify: matching digest passes, tamper/unsigned fail.
// ---------------------------------------------------------------------------
TEST_CASE("firmware signature verify", "[fw]") {
    const std::string image = "FLIGHT-IMAGE-v8";
    const auto* p = reinterpret_cast<const std::uint8_t*>(image.data());
    const std::string good = Sha256::hash_hex(p, image.size());

    FirmwareImage img{p, image.size()};

    REQUIRE(FirmwareSignature(good).is_signed());
    REQUIRE(FirmwareSignature(good).verify(img));

    // Wrong (but well-formed) hash -> reject.
    std::string wrong = good; wrong[0] = (wrong[0] == 'a') ? 'b' : 'a';
    REQUIRE_FALSE(FirmwareSignature(wrong).verify(img));

    // Unsigned -> reject.
    REQUIRE_FALSE(FirmwareSignature("").is_signed());
    REQUIRE_FALSE(FirmwareSignature("").verify(img));
}

// ---------------------------------------------------------------------------
// INV-6 flight-build guard. On the bench (stub HAL) the guard FAILS (stubs +
// unsigned) but is advisory; a real flight build would force SafeMode.
// ---------------------------------------------------------------------------
TEST_CASE("flight-build guard flags stub HAL and unsigned image", "[guard]") {
    hal::HalSet hal = hal::build_default(/*flight_build=*/false);
    REQUIRE(hal.any_stubbed);  // bench has no native drivers

    GuardReport r = FlightBuildGuard::evaluate(hal, /*firmware_verified=*/false);
    REQUIRE_FALSE(r.pass());
    REQUIRE(r.any_stubbed);
    REQUIRE_FALSE(r.firmware_verified);
    REQUIRE(r.failures.size() >= 2);  // stub + unsigned
    REQUIRE_FALSE(FlightBuildGuard::is_flight_build());  // host build
}

// ---------------------------------------------------------------------------
// State-machine legality.
// ---------------------------------------------------------------------------
TEST_CASE("state machine legal edges", "[fsm]") {
    REQUIRE(is_legal_transition(FlightState::Boot, FlightState::SelfTest));
    REQUIRE(is_legal_transition(FlightState::Safe, FlightState::Armed));
    REQUIRE(is_legal_transition(FlightState::Armed, FlightState::Flight));
    REQUIRE(is_legal_transition(FlightState::Armed, FlightState::Safe));  // disarm
    REQUIRE_FALSE(is_legal_transition(FlightState::Boot, FlightState::Flight));
    REQUIRE_FALSE(is_legal_transition(FlightState::SafeMode, FlightState::Safe));  // terminal
}

// ---------------------------------------------------------------------------
// Bench boot + closed GNC tick over the stub HAL (INV-3 estimated state).
// ---------------------------------------------------------------------------
TEST_CASE("bench loop boots and ticks closed-loop", "[loop]") {
    FlightConfig cfg;  // 50 ms watchdog -> won't trip during a few quick ticks
    FlightLoop loop = make_bench_loop(cfg);

    FirmwareImage img{nullptr, 0};
    REQUIRE(loop.boot(img));                       // host build: guard advisory
    REQUIRE(loop.state() == FlightState::Safe);

    REQUIRE(loop.arm());
    REQUIRE(loop.state() == FlightState::Armed);
    REQUIRE(loop.detect_launch());
    REQUIRE(loop.state() == FlightState::Flight);

    Telemetry tm{};
    for (int i = 0; i < 10; ++i) tm = loop.tick();
    REQUIRE(loop.state() == FlightState::Flight);   // healthy: stayed in Flight
    REQUIRE(tm.nav_valid);
    REQUIRE(tm.n_fins == 4);                         // allocator drove 4 fins
    for (int i = 0; i < tm.n_fins; ++i) REQUIRE(std::isfinite(tm.fin_cmd_rad[i]));
}

// ---------------------------------------------------------------------------
// Abort drives SafeMode and latches (no further actuation).
// ---------------------------------------------------------------------------
TEST_CASE("abort enters latched safe mode", "[loop][safe]") {
    FlightConfig cfg;
    FlightLoop loop = make_bench_loop(cfg);
    FirmwareImage img{nullptr, 0};
    REQUIRE(loop.boot(img));
    REQUIRE(loop.arm());
    loop.abort();
    REQUIRE(loop.state() == FlightState::SafeMode);

    Telemetry tm = loop.tick();
    REQUIRE(tm.state == FlightState::SafeMode);  // stays terminal
    REQUIRE(tm.n_fins == 0);                     // no actuation in safe mode
}

// ---------------------------------------------------------------------------
// Watchdog deadline miss forces SafeMode. A 1 ns timeout trips on the first
// tick (real wall-clock time elapses after boot's start()).
// ---------------------------------------------------------------------------
TEST_CASE("watchdog expiry forces safe mode", "[loop][wdt]") {
    FlightConfig cfg;
    cfg.watchdog_timeout_ns = 1;  // impossible to meet -> trips immediately
    FlightLoop loop = make_bench_loop(cfg);
    FirmwareImage img{nullptr, 0};
    REQUIRE(loop.boot(img));
    REQUIRE(loop.arm());
    REQUIRE(loop.detect_launch());

    Telemetry tm = loop.tick();
    REQUIRE(tm.state == FlightState::SafeMode);
    REQUIRE_FALSE(tm.healthy);
}

// ---------------------------------------------------------------------------
// Watchdog unit: deterministic synthetic clock.
// ---------------------------------------------------------------------------
TEST_CASE("watchdog deadline monitor", "[wdt]") {
    Watchdog wd(100);  // 100 ns
    wd.start(TimePoint{0});
    REQUIRE_FALSE(wd.expired(TimePoint{50}));
    wd.kick(TimePoint{50});
    REQUIRE_FALSE(wd.expired(TimePoint{120}));  // 70 ns since last kick
    REQUIRE(wd.expired(TimePoint{260}));        // 210 ns since last kick -> trip
    REQUIRE(wd.tripped());
}
