# gnc-core

Pure C++17 GNC algorithms and Hardware Abstraction Layer (HAL).
Linked by **all** flight-and-ground binaries: the Drogon backend, the simulation engine,
the Path A Android NDK app, and the Path B STM32 FreeRTOS firmware.

## Discipline (Decision 13)

This library contains **no** platform code. CI fails on any of the following includes:

- `<jni.h>` / `<android/*>` / `<linux/*>`
- `<stm32*>` / `<cmsis*>`
- `<FreeRTOS.h>` / `task.h` / `semphr.h` / any RTOS header
- `<windows.h>` / `<unistd.h>` (any system header)

Run `tools/check_hal_leak.sh` locally before pushing. See **Wave 1 L1** in v5.4 Decision 13.

## Layout (v5.4 §1.0.2)

```
gnc-core/
├── include/gnc-core/         (public headers — included by wrappers and backend)
│   ├── types.h               (vectors, quaternions, frames)
│   ├── hal/                  (interfaces only)
│   │   ├── IImu.h IGps.h ICan.h IPyro.h IRadio.h
│   │   ├── IClock.h IThermal.h IFinDriver.h ISeeker.h
│   │   └── HalFactory.h
│   ├── estimation/           (IEstimator + concrete filters)
│   ├── control/              (IController, IMixer, IGuidance, gain scheduler)
│   ├── actuator/             (IActuator + 4 model types + AerospikeStub)
│   ├── sep/                  (SeparationTriggerRegistry: 5 triggers)
│   ├── safety/               (AbortPolicyEngine, SaturationWatchdog)
│   ├── logging/              (FlightLog103Cols)
│   └── sim/                  (Simulator, Integrator — shared by backend sim engine)
├── src/
│   ├── hal/stub/             (StubImu, StubGps, ... — bench fallback per §1.5.2)
│   ├── estimation/
│   ├── control/
│   ├── actuator/
│   ├── sep/
│   ├── safety/
│   ├── logging/
│   └── sim/
└── tests/                    (Catch2; Tier 1 CI)
```

## Build

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_STANDARD=17
cmake --build build -j
ctest --test-dir build/tests
```

## Stub HAL (v5.4 §1.5)

When the native HAL probe fails AND the binary is not tagged `flight_build=true`,
`HalFactory` returns the in-process stub. The stub:

- emits zero IMU samples (gravity-only),
- reports `NO_FIX` GPS,
- logs CAN frames in memory,
- records pyro fire commands,
- returns `IDLE (0xBF)` seeker mode.

Flight binaries refuse the stub and exit with a fatal error.

## Frame conventions (§3.0)

Every quantity carries its frame suffix: `r_n`, `v_n`, `q_b_n`, `b_a_b`, `b_g_b`, `omega_b_b`.
Body, NED, ECEF and Wind frames are the four canonical frames.
