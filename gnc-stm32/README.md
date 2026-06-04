# gnc-stm32 — Path B flight target (v8 P5.1)

Minimal but real flight-software skeleton for the **STM32H7** that hosts the
existing `gnc-core` GNC stack (ErrorStateKF estimator + controller + allocator)
over the HAL. The v8 audit (Embedded §) found **no firmware existed on either
path**; this is the Path B execution substrate — the second one alongside the
SIL sim — enabling future Path A vs Path B parity.

## What it is

- **`FlightLoop`** — fixed-rate GNC cycle: `IClock`→dt, `IImu`→ESKF predict,
  `IGps`→ESKF update, controller on the **estimated** state (INV-3), allocator →
  `IFinDriver`, telemetry → `IRadio`, watchdog kick. Faults → `SAFE_MODE`.
- **`FlightState`** — Boot → SelfTest → Safe → Armed → Flight → Descent, plus the
  fail-stop `SafeMode` sink (pyros disarmed, fins neutralised, terminal until reboot).
- **`Watchdog`** — deadline monitor; binds the STM32 IWDG on-target, no-op pet on host.
- **`FlightBuildGuard`** (INV-6) — a flight build refuses to run if `any_stubbed`,
  auth bypass is compiled in, or the image is unsigned / fails its hash.
- **`FirmwareSignature` + `Sha256` + `scripts/sign_firmware.py`** — the signing
  hook: Python records `path_b.firmware_sha256` in `release_manifest.yaml`; the
  target recomputes and compares at boot.
- **`platform/stm32h7/`** — native HAL drivers (DWT-backed `IClock` today; IMU/
  GPS/fin/pyro follow the same registrar pattern), compiled only for the target.

## Build & test (host)

The default build is a **host bench** so the exact flight control flow runs in CI
with the stub HAL (no peripherals):

```bash
cmake -B build-stm32 -S gnc-stm32 -DGNC_STM32_BUILD_TESTS=ON
cmake --build build-stm32 -j
ctest --test-dir build-stm32 --output-on-failure   # flight-loop + signing tests
./build-stm32/gnc_stm32_bench                       # prints boot/tick/abort trace
```

## Cross-compile (target)

```bash
cmake -B build-tgt -S gnc-stm32 \
      -DCMAKE_TOOLCHAIN_FILE=gnc-stm32/cmake/stm32h7.toolchain.cmake \
      -DGNC_TARGET_STM32H7=ON
cmake --build build-tgt -j
```

Requires the GNU Arm Embedded toolchain (`arm-none-eabi-`) plus the board-support
package (CMSIS device headers, startup, linker script, RTOS) on the include/link
path. `GNC_TARGET_STM32H7=ON` defines `GNC_FLIGHT_BUILD`, so the build is
flight-hardened: stub fallback becomes fatal in `HalFactory::build_default(true)`
and the guard blocks an unsigned image.

## Firmware ↔ backend interface

See [`docs/firmware_backend_icd.md`](docs/firmware_backend_icd.md): backend
(`LaunchAuthority`, P0.2) is the arm/launch authority over a verified JWT +
hardware key; firmware owns the real-time loop and the autonomous fail-stop.

## Deferred (not P5.1)

Physical link layer (radio/CAN framing), full 103-column telemetry / HDF5 parity
logs, remaining native drivers against bench hardware (HIL), and asymmetric
firmware signatures.
