// gnc-stm32/src/main_bench.cc
//
// v8 P5.1. Host-build bench entrypoint for the Path B flight application. Uses
// the in-process stub HAL (no peripherals) so the exact flight control flow —
// boot/self-test, watchdog, GNC tick, safe-mode — runs on a developer machine
// and in CI. The cross-compiled STM32H7 image uses the same FlightLoop with
// native HAL drivers registered instead.

#include "gnc-stm32/FlightLoop.h"
#include "gnc-core/control/ControllerFactory.h"

#include <cstdio>

int main() {
    using namespace gnc;
    using namespace gnc::stm32;

    // Bench build: no native HAL registered -> every interface resolves to the
    // stub. flight_build=false so the loop is exercisable without real drivers.
    hal::HalSet hal = hal::build_default(/*flight_build=*/false);

    TuningParams tp;
    tp.algorithm = "PID";
    tp.controller_type = "fins";
    tp.kp = 4.0; tp.ki = 0.0; tp.kd = 2.0;
    tp.n_fins = 4; tp.fin_layout = "cruciform";
    tp.Cm_delta = 0.5; tp.Cn_delta = 0.5; tp.Cl_delta = 0.01;
    auto [ctrl, alloc] = control::ControllerFactory::create(tp);

    FlightConfig cfg;
    FirmwareSignature sig("");  // bench image is unsigned (advisory off-target)

    FlightLoop loop(cfg, std::move(hal), ctrl, alloc, std::move(sig));

    // No real image to hash on the bench.
    FirmwareImage img{nullptr, 0};
    const bool booted = loop.boot(img);
    std::printf("boot=%d state=%s guard.pass=%d (any_stubbed=%d)\n",
                booted, to_string(loop.state()),
                loop.guard_report().pass(), loop.guard_report().any_stubbed);

    loop.arm();
    loop.detect_launch();
    std::printf("after arm+launch: state=%s\n", to_string(loop.state()));

    for (int i = 0; i < 5; ++i) {
        Telemetry tm = loop.tick();
        std::printf("tick %u state=%s nav_valid=%d pos=(%.2f,%.2f,%.2f) fins=%d\n",
                    tm.tick, to_string(tm.state), tm.nav_valid,
                    tm.pos_n.x, tm.pos_n.y, tm.pos_n.z, tm.n_fins);
    }

    loop.abort();
    std::printf("after abort: state=%s\n", to_string(loop.state()));
    return 0;
}
