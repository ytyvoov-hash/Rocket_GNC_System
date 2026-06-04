# gnc-android — Path A (Android) execution substrate (v8 P5.2)

The second mobile execution substrate for `gnc-core`, alongside Path B
(`gnc-stm32`). This is a **research spike**, gated behind Path B per Plan v8 §6:
it proves the substrate *exists* and is testable, and it delivers the
**hard-real-time suitability analysis** the plan requires *before* committing to
Path A.

## Read this first

- **`docs/path_a_rt_suitability.md`** — the gating RT analysis.
  **Conclusion: Android is NOT cleared to run the hard-RT inner loop.** The
  hard-RT 100 Hz control loop stays on the STM32L431 peripheral; Android hosts
  the soft-RT outer loop (sensor fusion + guidance) + telemetry.
- **`docs/path_a_link_icd.md`** — the Android↔L431 USB-CDC wire protocol.

## Layout

```
gnc-android/
  docs/                 RT-suitability analysis (the gate) + link ICD
  native/
    include/gnc-android/ Messages.h, UsbCdcLink.h, AndroidClock.h, GncBridge.h
    src/                 *.cc + jni_glue.cc (JNI, built only with GNC_ANDROID_JNI)
  app/                   Kotlin app skeleton (MainActivity, FlightService, NativeBridge)
  tests/bridge_test.cc   host regression (Catch2)
  cmake/android.notes.md NDK build instructions
  CMakeLists.txt
```

## What runs where

```
Android (this project)                          STM32L431 (peripheral)
  Kotlin app + foreground service                 hard-RT inner loop @ 100 Hz
    └ JNI → GncBridge (native, no JVM heap):        IWDG watchdog + safe-mode
        ErrorStateKF + controller + allocator       owns sensors + actuators
        on ESTIMATED state (INV-3), ~10–50 Hz       safes itself on link loss
    └ UsbCdcLink ⇄ (USB-CDC, CRC-16/CCITT) ⇄ ───────┘
```

This mirrors Path B's fail-stop ownership: the element touching actuators (the
L431) owns the watchdog and does not rely on the soft-RT host to stay safe.

## Building / testing on the host

The native substrate builds and tests with no NDK/phone:

```bash
cmake -S gnc-android -B build -DGNC_ANDROID_BUILD_TESTS=ON
cmake --build build
ctest --test-dir build --output-on-failure
```

`tests/bridge_test.cc` covers: CRC-16/CCITT known-answer, message round-trips,
framing+stuffing over a loopback transport, CRC-corruption rejection, and a
**closed outer loop over the link** (L431→sensor→fuse→control→command→L431) on
the estimated state.

For the on-device `libgnc-core-jni.so`, see `cmake/android.notes.md`.

## Status / not done (honest)

- **Done:** RT analysis (gate), link protocol (framing/CRC/messages, tested),
  Android clock, GNC bridge hosting the gnc-core stack on estimated state, JNI
  surface, app skeleton, manifest `path_a` fields.
- **Not done (deferred / HIL):** real USB enumeration + bulk transfer
  (`UsbCdcTransport` is a documented stub), on-target jitter/thermal
  characterisation, Doze/core-pinning hardening (RT analysis §4), Path A↔Path B
  parity gate (DoD-D), full 103-column telemetry.
