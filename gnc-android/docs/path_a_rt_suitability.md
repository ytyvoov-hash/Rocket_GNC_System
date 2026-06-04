# Path A (Android) — Hard-Real-Time Suitability Analysis (v8 P5.2 gate)

**Status:** research spike. Plan v8 §3.8 / §6 requires this analysis *before*
committing to Path A, and treats Path A as a spike **gated behind Path B** (P5.1).
This document is that gate. It is an engineering analysis, not a flight-readiness
claim.

## 1. Question

Can a stock Android device (Snapdragon-class, per Plan v8 §0: *Snapdragon 845 +
STM32L431 peripheral*) host the **hard-real-time GNC inner loop** (target 100 Hz,
≤1 ms jitter) directly?

## 2. Findings

**No — not the hard-RT inner loop.** Stock Android (Linux + ART + vendor HAL) is a
throughput-optimised, power-managed, multi-tenant OS. The dominant risks for a
fixed-rate control loop:

| Hazard | Mechanism | Effect on a 100 Hz loop |
|--------|-----------|--------------------------|
| Scheduler jitter | CFS is not a hard-RT scheduler; no deadline guarantee without `SCHED_FIFO`/`SCHED_DEADLINE` + privileges Android apps don't get | Missed/late ticks, unbounded tail latency |
| Thermal throttling | SoC DVFS clamps CPU under sustained load/heat (a vibration- and sun-exposed rocket bay is worst case) | Loop slows non-deterministically mid-flight |
| Power management | Doze, App Standby, core parking, `cpuidle` C-states | 10–100 ms stalls unless held off |
| GC pauses | ART garbage collection on the managed (Kotlin/Java) side | Stop-the-world pauses if the loop touches the JVM heap |
| Vendor HAL latency | USB/sensor stack buffering, no time-of-validity guarantee | Measurement latency uncertainty into the filter |
| No fail-stop watchdog | Android has no equivalent of the STM32 IWDG bound to the control loop | A hung loop is not autonomously safed |

## 3. Architectural conclusion (the honest split)

Path A is viable **only** with the hard-RT inner loop kept on the **STM32L431
peripheral**, with Android as the **supervisory / outer-loop + telemetry host**:

```
 ┌────────────────────────── Android (Path A host) ──────────────────────────┐
 │  Kotlin app (foreground service, wakelock)                                 │
 │     └─ JNI ─► gnc-core native (NDK):                                        │
 │                 ErrorStateKF (sensor fusion) + outer-loop guidance/control  │
 │                 @ ~10–50 Hz (soft-RT, jitter-tolerant)                      │
 │     └─ USB-CDC link (921600 bps, CRC-16/CCITT) ◄──────────────┐            │
 └───────────────────────────────────────────────────────────────┼───────────┘
                                                                   │ USB
 ┌──────────────────────── STM32L431 peripheral ───────────────────┴───────────┐
 │  Hard-RT inner control loop (100 Hz, IWDG watchdog, safe-mode)               │
 │  owns sensors + actuators; autonomous fail-stop independent of the phone     │
 └──────────────────────────────────────────────────────────────────────────────┘
```

This mirrors the Path B (`gnc-stm32`) fail-stop model: the element that touches
actuators (here the L431) owns the watchdog and safe-mode and does not depend on
the soft-RT host to stay safe.

## 4. Required mitigations *if* Path A is pursued beyond the spike

- Pin the native loop to an isolated core (`cpuset`/`isolcpus`), request
  `SCHED_FIFO` via a privileged helper, and disable that core's `cpuidle`.
- Run the GNC step in **native (NDK) code with no JVM-heap allocation** on the
  hot path (no GC exposure) — the bridge in this spike is all C++.
- Foreground service + partial wakelock; opt out of Doze/battery optimisation.
- Treat the phone as untrusted for the inner loop: the L431 must safe itself on
  link loss (heartbeat timeout) regardless of the phone's state.
- Characterise tick jitter and thermal behaviour on the actual target SoC under
  representative load/heat before any flight claim.

## 5. Go / No-Go

- **Go (spike, this PR):** build the Android execution substrate — NDK build of
  `gnc-core`, JNI bridge, the USB-CDC link protocol, an Android clock, and a
  minimal app — to prove the second mobile substrate *exists* and is testable.
- **No-Go (flight):** Android is **not** cleared to run the hard-RT inner loop.
  That stays on the L431. Path A flight readiness additionally requires the
  mitigations in §4, the safety case (FHA/FMEA/SSA), and HIL jitter/thermal data.
