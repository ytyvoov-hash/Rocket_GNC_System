# Rocket GNC System Plan v5.4

A unified, rocket-agnostic, multi-stage Guidance, Navigation and Control system. The system is driven by rocket templates, mission files, an actuator library, a controller library and a hardware mapping; any rocket that satisfies the Template Validation Contract (clauses C1–C25) can be imported, simulated, tuned, tested and flown without source-code changes. Two flight-computer paths are supported as first-class citizens: Path A (Snapdragon 845 + STM32L431 peripheral) and Path B (STM32H743 / STM32H753 with integrated IMU + FreeRTOS). Path selection is made per mission via the mission file.

---

## Change-log v5.3 → v5.4

v5.4 folds the *Close-Integration* ground-tool decisions (`close integeration_GNC plan.md`) into the unified plan. Every CloseUI feature that survived the *KEEP / ADD / MODIFY / DROP* review (§ 2 of the close-integration plan) is now anchored to its exact location in this document.

**ADDED** (Table 1 of the close-integration plan).

| # | Decision | Anchor in v5.4 |
|---|----------|----------------|
| 1 | Native + C++ stub fallback loader (pure C++) | new §1.5 |
| 2 | USB auto-scan + auto-assign on startup | new §11.2.5 (before §11.3) |
| 3 | 5 s hotplug rescan | §11.3 (S13 acceptance result extended) |
| 4 | Routing Manager dialog + manual VID:PID bypass | new screen S13a in §6.2 / §6.4.7 |
| 5 | Persistent assignments (`gnc_device_assignments.json`) | new §7.3.13 |
| 6 | CAN adapter protocol auto-probe | extended §7.3.11 |
| 7 | Broadcast-to-all servo sweep | extended §11.4.1 |
| 8 | TX/RX throughput counters per port | §11.3 status-bar (new paragraph) |

**MODIFIED** (Table 3 of the close-integration plan).

| # | Element | v5.4 merged form |
|---|---------|------------------|
| 1 | Servo sweep test | Default broadcast (3 s); sequential fallback; per-fin pass / fail still logged. See §11.4.1. |
| 2 | Hardware-mapping resolution | `hardware_mapping.yaml` stays canonical; auto-scan produces a *suggested* mapping; deviations are warnings, never silent overrides. See §1.5, §7.3.13, §11.2.5. |
| 3 | S13 Hardware Health Monitor | Adds live per-port TX/RX bytes/s column and 5 s rescan ticker. See §11.3. |
| 4 | CAN bridge handling | Auto-probe runs first at open; mismatch with declared `bridge.type` becomes a warning. See §7.3.11. |
| 5 | Pre-launch tool deployment | **Path A Android app in `BENCH_TEST` state + Web GCS S13a screen**, both sharing `gnc_device_assignments.json` via the backend. See §1.5, §6.4.7, §7.3.13. |

**KEPT** unchanged from v5.3 (Table 2 of the close-integration plan): `hardware_mapping.yaml` as authoritative spec; the Phase 7 flight-side architecture (CANOpen, NodeID scheme, watchdogs); decoded telemetry on S13 / S16; CAN utilisation budget clause C25 (< 70 %); the 24-item pre-launch checklist S01–S24 + GO/NO-GO; three-layer flight logging; SIL test harness (Phase 8); HIL benches (Phase 9) with scenarios 9A–9D; ESKF / MHE / IMM estimation stack; Web GCS as primary operator UI; 2-key ARM + hardware switch + code signing; three-tier CI/CD with HAL leak detection.

**DROPPED** from CloseUI when integrating (Table 4 of the close-integration plan, recorded for traceability — these CloseUI elements are *not* adopted by v5.4): the raw-byte terminal pane (developers still get a debug pane, operators see decoded telemetry only); the Tkinter / desktop GUI (Web GCS + Android app cover all operator surfaces); broadcast without authority check (must respect the launch state machine); a standalone `libclose` library as a separate product (the pattern is folded into `gnc-core` per §1.5); "Show ALL devices" silent bypass (the operator must accept liability and log operator ID — see §6.4.7); `force_shadow=True` without YAML reconciliation (manual entries surface as YAML patches for review — see §7.3.13).

The full close-integration plan (decision tables 1–4) is preserved verbatim in `close integeration_GNC plan.md` at repo root and is the audit source for this revision.

---

## Executive Architectural Decisions

The seventeen architectural decisions below are facts about the system. Every other section depends on them.

**Decision 1 — Estimation stack.**
ESKF 15-state is the canonical primary estimator and runs on whichever flight computer the mission selects. MHE 17-state is an optional refinement layer, off by default. When `mission.mhe.enabled = true`, MHE output supersedes ESKF; otherwise ESKF output is used. Path-aware defaults when MHE is enabled: Path A horizon `N=10` at 10 Hz; Path B horizon `N=5` at 5 Hz. The fallback chain on either path is `MHE → ESKF → Legacy EKF → Complementary Filter → Dead Reckoning`. MHE horizon and rate are user-editable inside the per-path supported ranges.

**Decision 2 — Loop-rate configuration.**
The flight-loop rate is set in the mission file at setup time and locked before the pre-launch sequence. Path A default is 100 Hz with supported range 50–200 Hz. Path B default is 200 Hz with supported range 100–500 Hz. Once locked, any post-lock change is rejected with a visible error. The same chosen rate runs estimation, control, guidance and the mixer on the chosen flight computer. There is no backup flight computer on either path; the resulting single-device SPOF is mitigated by pre-flight burn-in, thermal monitoring, brown-out protection and the independent black-box recorder.

**Decision 3 — Rocket-agnostic, unified system.**
The product is one GNC platform that flies any rocket whose template satisfies clauses C1–C25. The platform supports both flight-computer paths (A and B), all autopilot modes, all controller types, all separation triggers, all estimator approaches and the optional seeker subsystem from day 1. New rockets are added by importing their template; no source-code changes are required. The recommended demonstration sequence — `BA → ES_273 → SA → GH` — is engineering guidance for validating the platform on rockets of increasing complexity, not a system constraint; any rocket whose template passes C1–C25 can be flown as soon as the team is ready.

**Decision 4 — Dual-path parity, mission-time selection.**
Path A and Path B are first-class with full feature parity. The choice between them is made per mission via `flight_computer_path: A | B`. Templates are path-agnostic. Algorithms live in pure C++17 inside `gnc-core`; two thin wrappers (`gnc-android`, `gnc-stm32`) provide platform glue through a Hardware Abstraction Layer. Path A puts the flight loop on the Snapdragon 845 and uses the STM32L431CCT6 as a peripheral controller; Path B puts the flight loop on the STM32H743 (or STM32H753) and that chip handles peripherals as well.

**Decision 5 — Optional seeker subsystem (day-1 capability).**
The seeker ships from day 1 and is optional per mission. Templates declare per-stage `seeker_capable: bool`. The mission file declares `mission.seeker.{enabled, mode, target_class, loss_of_lock_policy, camera_id, fov_deg, mount_isolation, los_rate_method, pn_variant, pn_gain_N}` mission-wide; activation is gated by `seeker_capable: true` on the stage that exercises the terminal phase. Default is `seeker.enabled: false`; the operator turns it on when the mission needs terminal homing. Both strapdown and gimbaled modes are supported. Path A hosts the seeker on the Snapdragon (Adreno 630 GPU; CPU and Hexagon offload selectable). Path B hosts the seeker on a Jetson Nano co-processor reachable from the STM32H7xx via UART or CAN. Camera intrinsics (`hardware_mapping.yaml: seeker.camera.intrinsics`) are mandatory for any stage with `seeker_capable: true` (clause C13 extended).

**Decision 6 — Template schema.**
The 11-file template folder structure and the 101-column flight-log schema are frozen and append-only. `rocket_properties.yaml` carries the multi-stage block (`num_stages`, `stages[]`), `CA_multiplier`, `thrust_multiplier` and per-fin `actuator_ref` / `per_fin_actuator_ref` references. Two flight-log columns are appended for saturation reporting (102 `fin_rate_limited_flag`, 103 `fin_position_limited_flag`).

**Decision 7 — Mission file, actuator library and controller library.**
Three structured artefacts live alongside the rocket template. The mission file (`mission/<mission_id>.yaml`) captures everything that varies per flight, including path selection. The actuator library (`actuator_library.yaml`) defines named actuator types referenced by templates; multiple model types are supported (see §2.8). The controller library (`controller_library.yaml`) defines named controller gain sets referenced per stage. Clause C14 enforces that every fin slot resolves to a valid actuator-library entry; clause C22 enforces that every per-stage `controller_ref` resolves to a valid controller-library entry.

**Decision 8 — Path B variant and RTOS.**
Path B flight computer is locked to STM32H743 (primary) with STM32H753 accepted as an alternate. Both run the same FreeRTOS-based firmware via `gnc-stm32`; differences between the variants are confined to the HAL level. Variant selection is read from `hardware_mapping.yaml`. STM32CubeMX generates scaffolding; arm-none-eabi-gcc compiles; SWO/RTT trace and FreeRTOS runtime stack monitoring are mandatory.

**Decision 9 — Parallel build, single acceptance gate.**
Path A and Path B are built and validated in parallel from day 1. Both wrappers (`gnc-android`, `gnc-stm32`) compile in CI from the first commit. The acceptance gate is one set: every committed rocket × both paths × the SIL scenario set, plus a successful flight of at least one rocket on each path with dual-path parity ≥ 90 %. Per-week scheduling is left to PM and is not asserted by this plan. The committed rockets per release are listed in `release_manifest.yaml` at repo root (clause C-RM, see §1.0.5).

**Decision 10 — Mode-based autopilot, per-stage (all modes day-1).**
Per stage with `autopilot: enabled`, the mission file declares `autopilot_mode` from a fixed enum **all five of whose values ship from day 1**: `auto_shape` (computes optimal trajectory from `target_ground_range_m`; requires GPS), `fixed_pitch` (uses `guidance_reference_pitch_deg`), `passive_ballistic` (no active control), `waypoint` (multi-waypoint follower; requires `stages[i].autopilot_params.waypoints[]`), `terminal_homing` (proportional navigation; uses the seeker subsystem from Decision 5; requires `stages[i].autopilot_params.target` or `target_los`). The operator picks the mode per stage in screen S5; any of the five is selectable on any rocket whose template declares `autopilot: enabled` for that stage. Validator enforces per-mode required-field checks. `mission.guidance_reference_pitch_deg` is exposed as a power-user override and used by `fixed_pitch`.

**Decision 11 — External IMU detection and verification.**
Path A external IMU presence is auto-detected at hardware probe AND verified against `optional_devices.external_imu.present` in the mission file. Mismatch in either direction fails pre-launch with a clear error (S22). No silent fallback, no silent override. When present, the external IMU is fused additively with the Snapdragon built-in IMU.

**Decision 12 — CI/CD tiered.**
Three tiers run in a single CI pipeline with parallel jobs. Tier 1 (every PR commit, target < 5 min): `gnc-core` host C++ unit tests, BE Python tests, FE Vitest, lint. Tier 2 (every PR commit, parallel to Tier 1, target < 15 min): Path A Android NDK + Gradle build; Path B arm-none-eabi-gcc build; smoke tests; HAL leak check. Tier 3 (nightly + on-demand, 30–60 min): multi-target SIL parametrised per `release_manifest.yaml` (every committed rocket × both paths × envelope-grid cells), Path A vs Path B parity comparison, full integration. Tier 1 and Tier 2 block merge; Tier 3 reports to dashboard and does not block merge.

**Decision 13 — HAL leak surveillance, seven layers, three waves.**
Seven defensive layers protect `gnc-core` from platform leakage. Wave 1 (P0, weeks 1–3): L1 forbidden-includes static check; L2 host build of `gnc-core` in CI; L3 PR-review checklist. Wave 2 (P3–P4, weeks 5–8): L5 lines-of-code metric dashboard; L6 HAL-interface coverage; L7 parity test in Tier 3 SIL. Wave 3 (at acceptance gates): L4 architectural review at each platform acceptance gate and at each per-rocket onboarding gate; timing owned by PM. A `// HAL_LEAK_OVERRIDE: justification` comment may suppress a finding; overrides are tracked as issues in the ticketing system and reviewed monthly.

**Decision 14 — Saturation feedback strategy.**
The mixer applies Strategy B (uniform demand reduction) by default: when any commanded fin deflection exceeds the more restrictive of rocket-level and actuator-level limits, all fin commands are scaled proportionally so the largest is at the limit. PID anti-windup is integrator-freeze on saturation per axis. The user can also select two further options for testing and over-actuated airframes:

- *Redistribute* — for over-actuated airframes, shift load to non-saturated fins.
- *Demand reduction at upstream* — autopilot lowers upstream pitch/yaw demand by the saturation percentage (alternative to Strategy B). 

A sustained-saturation watchdog increments a counter each cycle the saturation flag is set and resets when clear. Both `> 5 % of cruise samples` and `continuous block > 100 ms` thresholds are exposed as user-configurable abort triggers; the operator chooses which (or both) are active per mission. Saturation flags are written to log columns 102 and 103.

**Decision 15 — Rocket-agnostic onboarding.**
The system has no hard-coded rocket list and recommends no specific onboarding order. Any rocket whose template passes C1–C25 can be imported, simulated, tuned and flown — in any order the team chooses. Reference templates that ship with the repository (e.g. `BA`, used for unit testing and golden-log validation) are illustrative test assets, not architectural anchors; their presence in the codebase does not constrain which rockets the platform supports. Which rockets to onboard for a given release is an operational decision owned by PM and the engineering team and is materialised in `release_manifest.yaml`.

**Decision 16 — Multi-stage architecture.**
Templates declare `num_stages` (open-ended; 1, 2, 3, …) and a `stages[]` array. Per-stage configuration covers physics (mass, inertia, CG), geometry, aerodynamics (per-stage CSVs), propulsion (per-stage thrust curve where applicable; an unpowered coast stage is an explicit option), `controller_type` (enum), `controller_ref` (controller-library entry), `fin_config` or `tvc_config`, `seeker_capable`, optional sensors and, for non-terminal stages, a separation block (`trigger`, `offset`, `timeout`, `arming`, `nail_count`, `nail_pyro_events`). Controller-type registry (seven types): `fins`, `tvc`, `hybrid`, `cold_gas`, `aerospike`, `roll_canards`, `none`. All seven controller types ship from day 1 with functional implementations: `fins`, `tvc`, `hybrid`, `cold_gas`, `roll_canards`, `none` are full implementations; `aerospike` ships as a registered fail-closed stub (`gnc-core/actuator/AerospikeActuatorStub.h`) and a mission that selects `controller_type: aerospike` with `implementation_status: stub` is rejected at validator C19. Separation-trigger registry: all five values — `burnout`, `time`, `altitude`, `velocity`, `event` — ship from day 1. Estimator approach is mission-file selectable from day 1: `single_filter`, `sequential`, `imm`. The IMM mode set is **derived from the template** (per stage `i`: `BOOST_Si` if the stage is powered, `COAST_Si`, `SEP_i_to_i+1` for non-terminal stages, plus a single `TERMINAL` mode on the last stage); see `gnc-core/estimation/IMMModeSet.h` and §4.1. Per-stage `IEstimator`, `IMixer`, `IController` interfaces in `gnc-core` allow polymorphic implementations per type.

**Decision 17 — Optional GPS and telemetry radio.**
GPS and telemetry radio are declared in the mission file via `optional_devices.gps.{present, sensor_id}` and `optional_devices.radio.{present}`. Default is `present: true` for both. `auto_shape` autopilot mode requires GPS; `fixed_pitch` and `passive_ballistic` work without. In-flight GPS loss has ESKF run IMU-only with growing covariance; if mode was `auto_shape`, autopilot falls back to `fixed_pitch` with last-known-good reference and alerts the operator. Radio-absent missions FAIL validation unless `flight_termination_system.present: true` is declared. GPS-absent missions FAIL validation unless `safety_zone.type` is `vlos_or_tethered`.

---

## How to Read This Document

Every section is a unit a reader can implement. Three-part structure: factual content, schemas/algorithms, and concrete handoffs to the implementer.

**Symbols used.**

- `→` — flow / handoff between subsystems.
- `±` — bounded tolerance or range.
- `[REQ]` — required field in YAML schemas.
- `[OPT]` — optional field in YAML schemas.
- `[DEF=…]` — default value.

**Team-role abbreviations.**

| Code | Discipline | Primary responsibility |
|------|------------|------------------------|
| PM | Project Manager | Coordination, scheduling, budget |
| SA | Systems Architect | Overall architecture, integration |
| AE | Aerospace Engineer | Aerodynamics, performance, DATCOM |
| CE | Control Systems Engineer | PID/LQR/MPC, tuning, gain scheduling |
| NE | Navigation Engineer | EKF/MHE/IMM, sensor fusion |
| BE | Backend Engineer | Simulation, APIs, databases |
| FE | Frontend Engineer | UI, Three.js, user experience |
| EE | Embedded Engineer | STM32, firmware, real-time |
| ME | Mobile Engineer | Android NativeActivity, JNI |
| HW | Hardware Engineer | CAN, PL2303, power, schematics |
| QA | Quality & Test Engineer | HIL/SIL, testing, verification |
| SE | Safety Engineer | Safety, launch sequence, abort |
| DO | DevOps Engineer | CI/CD, deployment, monitoring |

**Phase map.**

```
Phase 0  Vision, objectives, success criteria
   |
Phase 1  Overall system architecture
   |
Phase 2  Data infrastructure (template + parser + libraries)
   |
Phase 3  Physics engine (simulation engine)
   |
Phase 4  Estimation and navigation (ESKF + optional MHE + IMM)
   |
Phase 5  Control system and fin allocation
   |
Phase 5b Optional seeker subsystem
   |
Phase 6  User interface and experience
   |
Phase 7  Hardware and communications
   |
Phase 8  SIL — software in the loop
   |
Phase 9  HIL — hardware in the loop
   |
Phase 10 Firmware flashing and deployment
   |
Phase 11 Pre-launch procedures
   |
Phase 12 Launch and operations
   |
Phase 13 Post-flight analysis
```

---

## Phase 0 — Vision, Objectives, and Success Criteria

### 0.1 Project Summary

The system is a unified GNC platform that is rocket-agnostic and multi-stage capable by design. Any rocket whose template satisfies clauses C1–C25 of the Template Validation Contract (see Onboarding Procedure §A.1) is imported, simulated, tuned, tested and flown without source-code changes. Multi-stage architecture supports arbitrary stage counts with per-stage controller types, guidance / autopilot capability, separation triggers and user-configurable actuator and separation-nail counts. Both flight-computer paths (Path A on Snapdragon 845 + STM32L431; Path B on STM32H743 / STM32H753 + FreeRTOS) are first-class and are built in parallel from day 1; the operator picks per mission in screen S5. Which rockets to onboard for a given release — and in what order — is an operational decision per Decision 15 and is materialised in `release_manifest.yaml`. Reference templates that ship in-repo (`BA`, etc.) are illustrative test assets, not architectural anchors.

### 0.2 Final Deliverables

| Product | Description | Owners |
|---------|-------------|--------|
| Web Platform (GCS) | Browser-based ground control station (React + TypeScript + Tailwind + Redux Toolkit + WebSocket) shared across paths | FE + BE |
| Mission File Editor (S5) | Multi-stage GCS mission editor (per-stage mode selector; estimator approach selector) generating YAML | FE + BE |
| Actuator Library Editor (S5b) | GCS editor for `actuator_library.yaml` (multiple model types) | FE + BE |
| Controller Library Editor (S5c) | GCS editor for `controller_library.yaml` (gain sets per controller type) | FE + BE |
| Stage Status Screen (S16) | Live multi-stage telemetry, transition log, saturation flags | FE + BE |
| Template Editing API | REST API for programmatic template editing alongside the GUI | BE |
| `gnc-core` (HAL shared library) | Pure C++17 algorithms + `IEstimator` / `IMixer` / `IController` / HAL interfaces | CE + NE + BE |
| Path A — Android Application | `gnc-android` wrapper on Snapdragon 845; JNI bridge to `gnc-core` | ME + EE + NE + CE |
| Path A — STM32L431 Peripheral Firmware | Telemetry radio, FIRE GPIO, USB-CDC, watchdog (no flight code) | EE |
| Path B — STM32H743 / STM32H753 Flight Firmware | `gnc-stm32` wrapper on FreeRTOS; runs the flight loop and peripherals | EE + CE + NE |
| Path B — Seeker Co-processor App | Linux app on Jetson Nano (day-1 capability) | ME + EE + CE |
| 6-DOF Simulation Engine | C++ multi-stage simulator with second-order actuator model and dual-fidelity engine selection | BE + AE |
| Control Algorithm Library | All listed algorithms implemented (§5.2) and selectable per stage | CE |
| State Estimation Library | ESKF (canonical), optional MHE (IPOPT/acados), `single_filter` / `sequential` / `imm` approaches | NE |
| Data Parser | Multi-stage template, mission file, actuator library, controller library, hardware mapping; supports any provided aerodynamic data shape | BE + AE |
| Rocket Onboarding Pipeline | Validation + qualification for any new rocket against C1–C25 | AE + BE + QA |
| Hardware Architecture | Both paths: CANOpen, USB, Ethernet, power distribution | HW + EE |
| Two HIL Benches | Path A bench + Path B bench; built in parallel; in-house | HW + QA |
| Test Documentation | Multi-target SIL harness (`N committed rockets × 2 paths × ≥ 8 cases per rocket`, parametrised per `release_manifest.yaml`; minimum `M=8` per rocket derived from envelope) + dual-bench HIL + per-stage scenarios + path-aware pre-flight checklists | QA + SE |
| Dual-Toolchain CI/CD (Tiered) | 3-tier pipeline (T1 < 5 min, T2 < 15 min, T3 nightly) in a single CI with parallel jobs | DO |
| Code Documentation Package | READMEs per module, architecture docs, auto-generated API docs (Doxygen / KDoc / JSDoc) | SA + each discipline + DO |
| User Manual | Operator-facing guide: getting started, onboarding, missions, pre-launch, troubleshooting | FE + QA + PM |

### 0.3 Quantitative Success Criteria

#### 0.3.1 Platform success metrics (both paths)

| Metric | Target | Minimum acceptable | Measured from |
|--------|--------|--------------------|---------------|
| Position estimation accuracy | < 2 m RMS | < 5 m | ESKF vs reference GPS on either path |
| Attitude estimation accuracy | < 0.5° | < 1.5° | Euler angles |
| Control cycle time (Path A) | < 10 ms | < 20 ms | IMU read to servo command at 100 Hz |
| Control cycle time (Path B) | < 5 ms | < 10 ms | IMU read to servo command at 200 Hz |
| UI response time | < 30 ms | < 50 ms | TLM to display |
| Telemetry update rate | 50 Hz | 20 Hz | Frames / s |
| Impact accuracy (CEP) | < 5 m | < 15 m | Circular error probable |
| Test coverage | > 80 % | > 60 % | Code coverage of `gnc-core` |
| Launch reliability | > 95 % | > 85 % | Successful launches / total per path |
| MHE loop time (Path A, when enabled) | < 50 ms | < 100 ms | Snapdragon 845, `N=10`, 10 Hz |
| MHE loop time (Path B, when enabled) | < 100 ms | < 200 ms | STM32H7xx, `N=5`, 5 Hz |
| Path A thermal headroom | T_cpu < 70 °C | T_cpu < 85 °C | Sustained flight-profile load on Snapdragon |
| Path B thermal headroom | T_cpu < 60 °C | T_cpu < 85 °C | Sustained flight-profile load on M7 (passive cooling) |
| BA template onboarding time | < 1 hour | < 4 hours | Template import → valid simulation run on both paths |
| Dual-path parity (golden-log match) | ≥ 90 % samples in tolerance | ≥ 75 % | per-rocket golden logs (one set per committed rocket), Appendix C tolerances, both paths |
| Logging completeness | 101 / 101 columns populated, configurable per mission | 95 / 101 | No placeholder zeros for autopilot, guidance, phase, attitude error, moment cmd, fin deflections |

The 101-column completeness target is a quality goal, not a hard gate; per-mission `logging_profile` is set in the mission file (`FULL` default). Platform flights run multiple flights per path per committed rocket to validate repeatability.

#### 0.3.2 Per-rocket onboarding criteria (applies to every rocket added to the platform)

- Template imports cleanly: all C1–C25 clauses pass.
- SIL run completes within Appendix C tolerances on at least one path.
- CEP within rocket-specific specification.
- No new `gnc-core` code required; HAL extensions allowed; algorithms unchanged.
- Onboarding workflow ownership: SA + AE share responsibility as co-pilots with different focuses (SA owns the architectural fit; AE owns the aerodynamic correctness). The acceptance gate is end-to-end workflow inside the system.

#### 0.3.3 Per-rocket validation artefacts

For every rocket onboarded to the platform, the following artefacts must exist before the rocket is added to `release_manifest.yaml`:

- **Golden log set** under `rockets/<id>/golden/` covering at least the 8 envelope cells generated by `envelope_grid(rocket.envelope)` (the same generator used in §8.3.2). Each golden log is a 103-column HDF5 produced by the high-fidelity simulator.
- **Per-rocket Appendix C tolerances** under `rockets/<id>/tolerances.yaml` — derived statistically from the rocket's golden runs using the same method as the BA reference (§Appendix C). Tolerances apply per-channel; deviations from the BA-derived defaults must be justified in the file's header comment.
- **Per-rocket scenario file** under `rockets/<id>/scenarios.yaml` — selects the generic categories from §8.3.3 that apply to the rocket and populates rocket-specific parameters (e.g. fin index for "servo failure mid-flight").
- **Per-rocket onboarding report** under `rockets/<id>/onboarding_report.md` — output of step 7 of the onboarding workflow (§A.2), signed by SA + AE.

The set is mandatory; CI fails if a rocket appears in `release_manifest.yaml` without all four artefacts present.

### 0.4 Project Boundaries (Out-of-Scope)

- Rocket motor and propellant design (pre-supplied thrust curves consumed).
- Warhead design (black-box provided).
- Long-range weather systems (existing APIs).
- Vision-based navigation tuning beyond the seeker integration contract (§5b).
- Deep learning for guidance.
- Parachute recovery system design.
- Flight-computer redundancy on either path (single device per path is an accepted SPOF — see Risk Register).
- Public disclosure of flight results.

---

## Phase 1 — Overall System Architecture

### 1.0 Dual-Path Architecture

Path A and Path B are first-class. The choice is per mission via a single mission-file field (`flight_computer_path`). Templates are path-agnostic; the same rocket flies on either hardware. Both hardware bases are owned and used operationally. All capabilities listed in Decisions 5, 10 and 16 ship from day 1; see §1.0.5.

#### 1.0.1 The two paths

| Aspect | Path A — Snapdragon 845 | Path B — STM32H743 / STM32H753 |
|--------|--------------------------|-------------------------------|
| Flight computer | Qualcomm Snapdragon 845 Android | STM32H743 (primary) or STM32H753 (alternate) Cortex-M7 @ 480 MHz |
| Peripheral controller | STM32L431CCT6 for radio + pyro + aux I/O (USB-CDC); STM32F405RGT6 @ 168 MHz as external-IMU SPI-to-UART bridge (optional, present only when external IMU is fitted; see §3.9.6) | None — flight computer handles peripherals |
| IMU | Snapdragon built-in (baseline); optional external Analog Devices ADIS16488 via STM32F405 SPI-to-UART bridge — auto-detected via PROD_ID, fused if present (Decision 11) | Integrated on STM32H7xx board; no external option |
| Default loop rate | 100 Hz (50–200 Hz) | 200 Hz (100–500 Hz) |
| MHE feasibility (when enabled) | `N=10`, 10 Hz default | `N=5`, 5 Hz default |
| Seeker host (when enabled) | Snapdragon (same chip) | Jetson Nano co-processor |
| Seeker inference acceleration | Adreno 630 GPU default; CPU and Hexagon offload selectable | Co-processor GPU |
| UI / GCS link | Ethernet (USB-C to Ethernet adapter on Snapdragon) | Ethernet (built-in MAC on STM32H7xx) |
| Toolchain | Android NDK + Gradle + JNI + Kotlin/C++ | arm-none-eabi-gcc + STM32CubeIDE / PlatformIO + FreeRTOS |
| Single point of failure | Snapdragon (mitigated) | STM32H7xx (mitigated) |
| Power envelope | ~9 W sustained (passive cooling enclosure) | < 1 W typical (passive) |

#### 1.0.2 Code organisation — Hardware Abstraction Layer

```
gnc-core/                       (PURE C++17 — no platform calls)
  estimation/                   ESKF, MHE, IMM, sequential, single_filter
  control/                      PID + AW, PID + GS, LQR, LQG, H-infinity,
                                Sliding Mode, Backstepping, MPC linear,
                                MPC nonlinear, MRAC, L1 adaptive
  guidance/                     Waypoint, trajectory, terminal-homing
                                (pure / true / augmented PN)
  mixer/                        Allocation algorithms per controller type:
                                FinMixer, TVCMixer, HybridMixer,
                                RollCanardMixer, ColdGasMixer,
                                AerospikeMixer, NoMixer
  template/                     Multi-stage parser + C1–C25 validator
  actuator/                     SecondOrderActuator, FirstOrderActuator,
                                IdealActuator, ElectromechanicalActuator
  log/                          103-column writer; logging profiles
                                FULL / FLIGHT / MINIMAL
  hal/                          Virtual interfaces ONLY:
    IImu.h    IGps.h    ICan.h
    IPyro.h   IRadio.h  IClock.h
    IThermal.h IFinDriver.h ISeeker.h
  test/                         GoogleTest unit tests (host CI)

gnc-android/                    (PATH A wrapper — Android Kotlin + JNI)
  app/MainActivity.kt
  app/UsbHelper.kt
  jni/jni-bridge.cpp
  hal-impl/
    AndroidImu.cpp     (built-in IMU; auto-detect external IMU; fuse if present)
    AndroidGps.cpp
    AndroidCan.cpp     (USB-CAN through STM32L431 or direct adapter)
    AndroidPyro.cpp    (commands STM32L431 over CDC)
    AndroidRadio.cpp   (commands STM32L431 telemetry over CDC)
    AndroidClock.cpp   (CLOCK_MONOTONIC_RAW)
    AndroidThermal.cpp (/sys/class/thermal/* readers)
    AndroidFinDriver.cpp
    AndroidSeeker.cpp  (CarTracking4 fork; YOLOv8 on Adreno 630;
                        CPU and Hexagon offload selectable)

gnc-stm32/                      (PATH B wrapper — FreeRTOS on STM32H743 / H753)
  src/main.c
  src/freertos_tasks.c
  hal-impl/
    Stm32Imu.cpp       (integrated IMU; SPI / I2C drivers)
    Stm32Gps.cpp       (UART)
    Stm32Can.cpp       (FDCAN)
    Stm32Pyro.cpp      (GPIO with safe-state default)
    Stm32Radio.cpp     (UART)
    Stm32Clock.cpp     (DWT cycle counter or HAL_GetTick)
    Stm32Thermal.cpp   (internal temp sensor)
    Stm32FinDriver.cpp
    Stm32Seeker.cpp    (UART/CAN bridge to Jetson Nano)
```

The HAL discipline forbids platform headers in `gnc-core`. CI fails when `gnc-core` links against `<jni.h>`, `<android/*>`, `<stm32*>` or any RTOS header.

#### 1.0.3 Mission file — selection at setup time

`mission/<mission_id>.yaml` declares the path plus all mission-specific parameters. The mission validator runs at lock time (see §2.7). A mission that fails validation cannot enter pre-launch. The pre-launch sequence verifies that the actual hardware matches the declared path; mismatch fails S01.

#### 1.0.4 What each path inherits and what differs

Identical on both paths: every algorithm in `gnc-core`; the 103-column flight-log schema; the Template Validation Contract; the BA reference template; the mission file schema; the actuator library; the controller library; the hardware mapping; the GCS UI; the Ethernet TCP-5900 protocol; SIL test harness; HIL bench layout; pre-flight checklist; the validation tolerances in Appendix C.

Path-specific (encapsulated in HAL implementations): IMU access, CAN driver, pyro path, telemetry-radio host, seeker host, thread / scheduler model.

#### 1.0.5 System capability — all features ship from day 1

| Scope | Day-1 contents | Acceptance gate |
|-------|----------------|-----------------|
| Unified system | `gnc-core` with all 12 control algorithms; all 7 controller types (`fins`, `tvc`, `hybrid`, `cold_gas`, `aerospike`-stub, `roll_canards`, `none`); all 5 autopilot modes; all 5 separation triggers; all 3 estimator approaches (IMM mode set derived from each template); optional seeker (off by default per stage); both path wrappers (`gnc-android`, `gnc-stm32`); GCS UI; HAL for both paths; multi-stage architecture (any `num_stages`); CI on both paths from day 1 | Every committed rocket in `release_manifest.yaml` passes C1–C25; every committed rocket × both paths × the SIL scenario set within Appendix C tolerances; ≥ 1 successful flight per path on at least one committed rocket; dual-path parity ≥ 90 % per rocket; logging completeness ≥ per-mission `logging_completeness_target`; no memory leaks under Valgrind / AddressSanitizer; no regression vs golden logs |

Missions that enable the seeker on Path A must run the §3.9.2 thermal checklist per device per mission.

### 1.1 High-Level Architectural View — five-layer stack

```
+==============================================================+
|  Layer 5: User Interface (Web GCS + React Native companion)   |
|  React + TypeScript + Tailwind + Redux Toolkit + Three.js     |
|  WebSocket telemetry; Arabic + English (RTL from day 1);      |
|  Docker deployment; Launch Control = kiosk mode               |
+===========================|==================================+
                            | REST + WebSocket + TCP (5900)
                            | over ETHERNET (USB-C adapter on
                            | Snapdragon; built-in MAC on STM32H7xx)
+===========================|==================================+
|  Layer 4: Backend Services (on-premises only)                  |
|  C++ simulation engine + REST API + DB adapter + CAD-to-GLB    |
|  conversion server + Template Editing API + DB                  |
+===========================|==================================+
                            | gRPC + IPC (ground only)
+===========================|==================================+
|  Layer 3: Flight Computer (Path A: Snapdragon | Path B: STM32) |
|  Runs the entire flight loop:                                  |
|   - Estimation: ESKF + optional MHE + (sequential | IMM)        |
|   - Guidance, control, mixer, actuator dynamics                 |
|   - CAN / FDCAN servo bus                                       |
|   - Pyro and radio commands (Path B native; Path A via L431)    |
+===========================|==================================+
                            | USB / FDCAN / GPIO / UART
+===========================|==================================+
|  Layer 2: Peripheral I/O (Path A only — STM32L431)             |
|  Telemetry radio, FIRE GPIO, auxiliary I/O, watchdog, safe mode|
|  On Path B this layer is absorbed into Layer 3                 |
+===========================|==================================+
                            | CAN (500 kbps default), UART
+===========================|==================================+
|  Layer 1: Hardware                                             |
|  XQPOWER servos + RTK / SBAS GPS + IMU + LoRa radio + battery  |
+==============================================================+
```

A Cloud layer is not added. All backend services are hosted on-premises (Decision 17, Phase 1.1 Q6).

### 1.2 Adopted Design Principles

| Principle | Practical effect |
|-----------|------------------|
| Template-driven (primary) | Each rocket is fully defined by a template; no per-rocket source code. Any C1–C25 template imports. |
| Fail-safe defaults | Every function returns a safe state on error. |
| Separation of concerns | Each layer owns one responsibility. Independent dev / test per layer. |
| Graceful degradation | MHE fails → ESKF continues. ESKF diverges → legacy EKF. All on the chosen flight computer. |
| Observable by design | Every CAN / USB / UART message is logged. Every internal state is exposed for diagnostics. |
| No hidden state | Telemetry exposes every variable consumed by the UI. |
| Two-key safety | Launch requires password + physical key + ground-station OK + countdown confirmation. |

### 1.3 Reuse of Existing Code

| Existing file | Status | Change |
|---------------|--------|--------|
| `EKF.cpp` (6-state) | Kept as legacy fallback inside `gnc-core` | New `ESKF.cpp` 15-state is canonical primary on both paths |
| `FUSION.cpp` | Redesigned as fusion arbitrator | Integrates EKF + ESKF + optional MHE + sequential / IMM |
| `GUIDANCE.cpp` | Reference for physics validation only | Rewritten under the mode-based autopilot |
| `PILOT.cpp` | Reference for physics validation only | Rewritten to support multi-stage and per-stage controllers |
| `CTRL.cpp` | Runs on chosen flight computer; outputs to CAN | Direct CAN to XQPOWER servos |
| `NAV.cpp` + `NAVIG.cpp` | Kept | No change |
| `GPS.cpp` (KCA protocol) | Kept | No change |
| `TELEMETR.cpp` (MisPlot) | Frame builder kept | New blocks 15–19; saturation flags 102/103 always included |
| `MCTU.cpp` (TCP 5900) | Kept | Now over Ethernet to GCS |
| `can_android.cpp` | Primary servo path on Path A | Better 8–12 servo support |
| Matrix library (`MAT_*`) | Kept | No change |
| STM32 firmware | Path A peripheral controller; Path B flight computer | New on Path B; relabelled and tightened on Path A |
| STM32F405 firmware (external-IMU SPI-to-UART bridge) | Path A optional, when external IMU is fitted | 100 Hz schedule, 17 B UART frame to Android — see §3.9.6 and §7.3.6 |
| Rudder 7-byte frame driver | Alternate non-CANOpen servo path | Used when `hardware_mapping.servo_protocol = rudder_7b` — see §7.3.10 |
| New on flight computer | `MHE.cpp` + `IMM.cpp` + `ESKF.cpp` + `Sequential.cpp` | Built fresh in `gnc-core` |

### 1.4 Data Flow Diagram

```
+---------+  IMU @ rate     +----------+    Control cmd   +--------+
| Sensors |---------------->| Flight   |----------------->| Servos |
|         |  GPS @ 5 Hz     | Computer |   (CAN / FDCAN)  |        |
|         |---------------->| (gnc-core|                  |        |
+---------+                 |  + HAL)  |                  +--------+
                            +----+-----+
                                 | TLM (MisPlot 77 bytes @ 50 Hz,
                                 |  saturation flags always included)
                                 v
                          +----------+
                          | LoRa     |  default 418 MHz, operator-editable
                          | 418 MHz  |
                          +-----+----+
                                | RF
                                v
                          +----------+         +----------+
                          | GCS (Web)|<------->|Simulation|
                          | + React  |  replay |Engine    |
                          | + Backend|         | (C++)    |
                          +----------+         +----------+
                                ^
                                | Configuration
                                v
                          +----------+
                          | Template | + Mission file + Actuator lib
                          | Database |  + Controller lib + HW mapping
                          +----------+
```

### 1.5 Ground Tool — Native + C++ Stub Fallback Loader

The ground tool (Web GCS backend + Path A Android app + the Path B host build of `gnc-stm32` running in a desktop simulator) must run on any developer or bench machine even when no flight hardware is attached. v5.4 adopts a **single C++ HAL stub** (folded into `gnc-core`, not a separate `libclose` product — see Drop-table item 4 in the close-integration plan) so the same binary that flies a rocket also boots on a laptop with zero peripherals.

#### 1.5.1 Loader contract

At process start, the HAL factory in `gnc-core/hal/HalFactory.cpp` resolves each interface (`IImu`, `IGps`, `ICan`, `IPyro`, `IRadio`, `IClock`, `IThermal`, `IFinDriver`, `ISeeker`) in this order:

1. **Native implementation** — the platform-specific class registered by the active wrapper (`gnc-android` for Path A, `gnc-stm32` for Path B). Selected when the underlying device probe succeeds (USB enumeration on Path A; bus presence on Path B).
2. **C++ stub fallback** — `gnc-core/hal/stub/Stub<Interface>.cpp` returns benign, replay-able data and accepts every command without side effect. Selected when the native probe fails *and* `mission.flight_computer_path` is unset, or when the build target is `gnc-ground-tool` (the desktop GCS executable).
3. **Hard fail** — if neither the native nor the stub is available (impossible for a correctly-built binary), the process aborts before entering pre-launch.

The loader path is not user-selectable in flight: any binary tagged `flight_build = true` (set by the firmware-signing pipeline, §10) refuses to fall back to the stub and exits with a fatal error if the native probe fails. This guarantees a flight binary cannot silently launch against the stub.

#### 1.5.2 Stub behaviour summary

| Interface | Stub behaviour |
|-----------|-----------------|
| `IImu` | Emits a zero-angular-rate, 1 g vertical accel sample at the loop rate; bias drift = 0 |
| `IGps` | Emits the launch-pad fix from `mission.launch_site` with `fix_quality = NO_FIX` and `dop = 99` |
| `ICan` | Echoes every TX frame back as a successful ACK after one cycle; no servo motion |
| `IPyro` | Logs `ARM` / `FIRE` events; never asserts any GPIO |
| `IRadio` | Drops every TX frame; counts them for telemetry replay |
| `IClock` | Wall-clock monotonic time (host OS) |
| `IThermal` | Returns the host CPU temperature when available, else 25 °C constant |
| `IFinDriver` | Records commanded deflections to the in-memory log; never drives a servo |
| `ISeeker` | Returns `IDLE` mode (`0xBF`); see §7.3.12 mode table |

#### 1.5.3 Build and packaging

Three build targets are produced from the same source tree:

- `gnc-flight` — flight binary, `flight_build = true`, native HAL only. Path A and Path B variants share the source.
- `gnc-bench` — bench binary, native HAL preferred, stub fallback enabled. Used by §11.4 functional tests when partial hardware is attached.
- `gnc-ground-tool` — pure desktop binary, stub HAL only, statically linked. Ships with the Web GCS backend and with the Path A Android app's `BENCH_TEST` state (§6.4.7). Has no flight authority and is rejected by the launch state machine.

#### 1.5.4 Why this is folded into `gnc-core` (not a separate product)

The close-integration plan's Drop-table item 4 forbids a standalone `libclose` library. The stub HAL therefore lives under `gnc-core/hal/stub/` and is built as part of `gnc-core`. The HAL leak surveillance discipline (Decision 13, seven layers, three waves) treats the stub like any other HAL implementation: stub headers may not leak into algorithm code, and the L1 forbidden-include check rejects any `gnc-core/control` or `gnc-core/estimation` translation unit that includes a stub header directly.

---

### 1.6 Peripheral Command Protocol (Android ↔ STM32L431)

The peripheral command set is configurable in the GCS; the operator selects which messages are active per mission. The full message set is below; the GUI exposes each as a checkbox under S5 → Peripheral Protocol, and each enabled message has its own cadence. All messages travel over USB-CDC (Path A) at 921600 bps with byte-level COBS framing and CRC-16/CCITT-FALSE.

| ID | Name | Direction | Default | Cadence | Payload |
|----|------|-----------|---------|---------|---------|
| 0x10 | `HEARTBEAT` | Android → STM32 | enabled | 5 Hz | `{seq:uint16, ts_ms:uint32, mode:uint8}` |
| 0x11 | `STATUS_POLL` | Android → STM32 | enabled | 1 Hz | empty |
| 0x12 | `STATUS_REPORT` | STM32 → Android | enabled | reply to 0x11 | `{fw_ver:8B, t_cpu_C:int8, link_s:uint16, watchdog_state:uint8}` |
| 0x20 | `ARM_PYRO` | Android → STM32 | enabled | event | `{channel:uint8, key:uint32}` |
| 0x21 | `DISARM_PYRO` | Android → STM32 | enabled | event | `{channel:uint8}` |
| 0x22 | `FIRE_PYRO` | Android → STM32 | enabled | event | `{channel:uint8, token:uint32}` |
| 0x23 | `PYRO_STATE` | STM32 → Android | enabled | 5 Hz | `{ch_mask:uint8, armed_mask:uint8}` |
| 0x30 | `RADIO_TX_START` | Android → STM32 | enabled | event | `{freq_khz:uint32, tx_power_dbm:int8}` |
| 0x31 | `RADIO_TX_STOP` | Android → STM32 | enabled | event | empty |
| 0x32 | `RADIO_FRAME` | Android → STM32 | enabled | 50 Hz | MisPlot 77-byte frame |
| 0x40 | `AUX_IO_SET` | Android → STM32 | enabled | event | `{pin:uint8, value:uint8}` |
| 0x41 | `AUX_IO_GET` | Android → STM32 | optional | event | `{pin:uint8}` |
| 0x50 | `WATCHDOG_KICK` | Android → STM32 | enabled | 5 Hz | empty |
| 0x51 | `LINK_LOST_REPORT` | STM32 → Android | enabled | event | `{last_seen_ms:uint32}` |
| 0x60 | `EXT_IMU_PROBE` | Android → STM32 | optional | once | empty |
| 0x61 | `EXT_IMU_PRESENT` | STM32 → Android | optional | reply | `{present:uint8, model:8B}` |
| 0x70 | `RESET_REQUEST` | Android → STM32 | optional | event | `{reason:uint8}` |

When an enabled message is missed for more than its cadence × 3, the STM32 enters safe mode (see §7.10).

### 1.7 Backend Services Hosting and Security

All backend services run on-premises. No cloud. Hosting layout:

- A single mission server (Linux, x86_64, ECC RAM) running `gnc-backend` Docker images.
- Optional secondary server for hot stand-by; no automated failover.
- Local-only LAN; no exposure to public internet.
- TLS 1.3 for every cross-host link inside the LAN (mTLS for service-to-service, regular TLS for browser → backend).
- Authentication: local Identity Provider (Keycloak or equivalent); LDAP optional. RBAC roles: `viewer`, `engineer`, `operator`, `admin`.
- Audit log to PostgreSQL; retention 5 years; on-premises only.
- Secrets: Hashicorp Vault local instance; STM32 firmware-signing keys held in an offline HSM.
- Backups: nightly snapshot to a separate on-premises NAS; multiple copies retained indefinitely; no off-site cloud copy.

### 1.8 Integration Testing Topology (Docker Compose)

A single `docker-compose.yml` brings up every backend service so that integration tests can run against the same topology used in production. Services:

- `gnc-backend` — REST API + simulation engine front-end + Template Editing API.
- `gnc-frontend` — React UI.
- `mctu-bridge` — TCP 5900 bridge between flight computer and GCS.
- `cad-converter` — dedicated CAD-to-GLB conversion server (FreeCAD-based).
- `postgres` — primary database.
- `timescaledb` — time-series telemetry storage.
- `keycloak` — IdP.
- `prometheus` + `grafana` — telemetry dashboards.

Phase 8 SIL runs the same compose file with the simulation engine wired into the backend in place of a real flight computer. Phase 9 HIL replaces only `mctu-bridge` with the real bench host.

### 1.9 Loop-Rate Configuration and Lock

The operator sets the loop rate in S5 (Mission Configuration) at mission setup. Defaults are path-aware (Path A 100 Hz, Path B 200 Hz). On entering the pre-launch sequence (Phase 11 step S11), the rate is frozen. Any post-lock attempt to change it is rejected with a visible error and an audit-log entry. The rate appears in S05 of the pre-flight checklist and is included in every transmitted frame and every flight log row.

---

## Phase 2 — Data Infrastructure (Template & Parser)

### 2.1 Analysis of Actual Formats

| Format | Source | Original tool | Complexity |
|--------|--------|---------------|------------|
| `rocket_properties.txt` | All four | Manually entered | Low (key-value) |
| `for005.dat` | ES_273, GH, SA | Missile DATCOM input | Medium (Fortran namelists) |
| `AERO.COEFF.DAT` | SA stage 1 | Missile DATCOM output | High (block tables) |
| `Aero_Coef.xlsx` | BA | ANSYS + manual processing | Medium (English column names — all data is English) |
| `CA off / CA on.xlsx` | ES_273, GH, SA | Manual post-DATCOM | Medium |
| `damping_coeffs.csv` | BA | DATCOM + processing | Low (`Cmq` / `Cnq` for BA only; other rockets do not provide `Cnr` / `Clp` data — see §2.4) |
| `fin_loads.csv` | BA | Hinge moment calculation | Low |
| `ca_3d_coeffs_*.csv` | BA | Reynolds scan | Variable-dimensional (Re × Mach × α) |
| `cp_location.csv` | SA stage 1 | DATCOM extract | Not consumed at runtime; CP is computed from `CN` / `CM` (see §3.4) |
| `thrust_curve.csv` | BA, ES_273, SA st1 | Static test | Low (~14 K points; auto-decimated) |
| `thrust_*.xlsx` | GH stage 1 / 2 | Static test | Low |
| `*.SLDPRT` / `*.STEP` | All rockets | SolidWorks | High (CAD; converted to GLB by `cad-converter`) |

All customer data is delivered in English. The parser does not need an Arabic-column path.

### 2.2 Unified Template Schema

The full machine-parseable schema lives in `schemas/rocket_template.schema.yaml`. The runtime template file is `rockets/<id>/rocket_properties.yaml`. Worked-out excerpt for a single-stage rocket:

```yaml
version: "1.0"

meta:
  id: "BA"
  display_name: "BA Canard"
  type: "single_stage_canard"           # single_stage | multi_stage
  cad_model: "models/BA.glb"
  source_folder: "rockets/BA/"
  version: "1.0"
  created: "2026-04-22"
  notes: "Canard inversion required"

num_stages: 1                            # decisive multi-stage flag

stages:
  - id: "stage_1"
    name: "Main stage"
    is_terminal: true
    has_warhead: true

    physical:
      mass_dry_kg: 286.245
      propellant_mass_kg: 285.515
      cg_dry_body_m:   [2.5547, 0.00003, 0.00120]
      cg_full_body_m:  [2.9269, 0.000015, 0.0005]
      inertia_dry_kgm2:  [4.0458855, 2660.188996, 2660.21817478]
      inertia_full_kgm2: [6.8567, 1302.698, 1305.725]

    geometry:
      ref_diameter_m: 0.273
      ref_length_m:   5.453
      ref_area_m2:    0.05853
      nozzle_exit_area_m2: 0.05515

    aerodynamic_data:
      mach_range:     [0.3, 0.5, 0.8, 1.2, 2.0, 3.0, 4.0, 5.0]
      alpha_range:    [-20, -16, -12, -8, -4, -2, 0, 2, 4, 8, 12, 16, 20]
      delta_range:    [0, 4, 8, 12, 20]
      reynolds_range: [1.0e5, 5.0e5, 1.0e6, 3.0e6, 5.0e6, 7.0e6, 1.0e7]
      coefficient_files:
        CN:        "data/BA_stage1_CN.h5"
        CM:        "data/BA_stage1_CM.h5"
        CA_on:     "data/BA_stage1_CA_on.h5"
        CA_off:    "data/BA_stage1_CA_off.h5"
        damping:   "data/BA_stage1_damping.h5"
        fin_loads: "data/BA_stage1_fin_loads.h5"

    propulsion:
      thrust_curve_file: "data/BA_stage1_thrust.h5"
      burn_time_s: 4.25
      total_impulse_Ns: 1.2e6
      isp_s: 215
      thrust_multiplier: 1.0

    aerodynamics:
      CA_multiplier: 0.9                 # BA reference uses 0.9

    operational_envelope:
      mach_min: 0.3
      mach_max: 5.0
      alpha_max_abs: 20
      delta_max_abs: 20

    controller_type: "fins"              # fins | tvc | hybrid | cold_gas |
                                         # aerospike | roll_canards | none
    controller_ref: "BA_pid_gainsched"   # entry in controller_library.yaml
    autopilot:
      enabled: true
      capable_modes: ["auto_shape", "fixed_pitch", "passive_ballistic"]

    fin_config:
      sets:
        - id: "finset_1"
          placement: "canard"            # canard | mid | tail
          orientation: "x"               # plus | x
          count: 4
          chord: [0.200, 0.03]
          sspan: [0.1395, 0.3365]
          xle:   [1.93654]
          phif:  [45, 135, 225, 315]
          max_deflection_deg: 20
          sign_convention: [1, 1, -1, -1]
          actuator_ref: "default_4020"   # entry in actuator_library.yaml
          # Optional per-fin override:
          # per_fin_actuator_ref: ["default_4020", "default_4020", "default_4020", "XQ-4020"]

    seeker_capable: false

estimation:
  approach: "single_filter"              # single_filter | sequential | imm
  imm:
    transition_probabilities_source: "manual"   # manual | learned
    transition_probabilities: null              # filled when manual

hardware_mapping_file: "rockets/BA/hardware_mapping.yaml"
```

### 2.3 Data Parser Flow

```
User selects rocket folder
          |
          v
+---------------------+
| File Type Detector  |
+---------|-----------+
          v
+---------------------+
| Format-Specific     |   parseRocketProperties / parseDatcomInput /
|   Parsers           |   parseDatcomOutput / parseAeroXLSX /
|                     |   parseThrustCSV / parseThrustXLSX
+---------|-----------+
          v
+---------------------+
| Variable-Dim        |   Accepts (Mach × α), (Mach × α × Re),
|  Interpolator       |   (Mach × α × δ), (Mach × α × δ × Re)
|  Builder            |   without assuming data shape (Phase 3 Q5)
+---------|-----------+
          v
+---------------------+
| Data Validator      |   Completeness, physical consistency,
|                     |   symmetry, Mach coverage, NaN / Inf
+---------|-----------+
          v
+---------------------+
| HDF5 Writer         |   data/{rocket}_{stage}_{coefficient}.h5
+---------|-----------+
          v
+---------------------+
| Template Generator  |   Emits rocket_template.yaml + envelope
+---------|-----------+
          v
+---------------------+
| Database Registrar  |
+---------------------+
```

Storage decision: HDF5 for aerodynamic and thrust data; PostgreSQL + TimescaleDB for telemetry, events and analysis metadata. Parquet is not used.

### 2.4 Rocket-Specific Requirements

| Rocket | Special challenge | Handling |
|--------|-------------------|----------|
| BA | English column names; large 14,383-point thrust curve | Decimate to ~1,000 points with cubic spline preserving total impulse to ±0.1 % |
| ES_273 | Sparse data | Variable-dimensional interpolator with explicit out-of-range warnings |
| GH stage 1 | Two `FINSET`s (8 fins) | Parser yields `fin_config.sets` of length 2 |
| GH stage 2 | α to 140°; Mach to 15 | Extended atmosphere model (NRLMSISE-00 above 80 km); declared α range covered by the supplied aero tables; values outside the declared range fall back to Newtonian impact theory (`CN(α) = CN_max · sin²(α) · cos(α)`) per §3.3; validator emits WARN when the rocket envelope extends beyond the declared α table. |
| SA stage 1 | Three `FINSET`s | Parser yields `fin_config.sets` of length 3 |
| SA stage 2 | `Iyy ≠ Izz`; **unpowered coast stage — no thrust curve, no engine starter** | Multi-stage architecture still applies (separation event, independent aero and mass); `propulsion` block is omitted; `controller_type` may be `none` or `fins` per template |
| BA `Cnr` / `Clp` | Available | Used as-is |
| Other rockets | `Cnr` / `Clp` data not available | Damping derivatives default to zero; warning emitted at import |

### 2.5 Automatic Validation

Validation runs at import. Each check has a verdict (PASS, WARN, FAIL):

The variable-dim coefficient registry accepts any coefficient name declared in `coefficient_files`. The following Magnus-effect coefficients are recognised and consumed when present (default 0 if not declared): `Cy_p` (side-force coefficient due to roll rate), `Cn_p` (yaw-coupling coefficient due to roll rate), `Cm_p` (pitch-coupling coefficient due to roll rate). Roll-stabilised airframes that do not declare these coefficients run with zero Magnus contribution.

| Check | Condition | On failure |
|-------|-----------|------------|
| Static stability | CP behind CG at every operating point (or canard-active) | FAIL |
| Mach coverage | Aerodynamic tables cover declared envelope | FAIL |
| Mass positivity | All masses > 0 | FAIL |
| Inertia positivity | All diagonal inertias > 0 | FAIL |
| Thrust integrity | ∫T dt within ±5 % of declared total impulse | FAIL |
| Alpha range consistency | Alpha range consistent across files | WARN |
| Delta sign convention | `DELTA1 = [d, d, -d, -d]` | FAIL if inconsistent |
| CG shift | Full CG forward of dry CG (or explicitly tail-heavy) | WARN |
| Symmetric inertia | `Iyy ≈ Izz` for axisymmetric bodies; asymmetry must be declared | WARN |
| Numeric sanity | No NaN / Inf | FAIL |
| Damping derivative availability | `Cnr` / `Clp` either present or explicitly zero | WARN if missing |
| Reachability | Mission target inside template envelope (template-derived bounds) — only when GUI/operator does not override | INFO |

The reachability check is informational; the operator can enter any range without rejection.

### 2.6 Parameter Editor Interface (AG Grid + Handsontable)

The S4 editor uses both AG Grid (for paginated, sortable, validated tables — used for parameter categories with > 100 rows such as thrust curves and atmosphere tables) and Handsontable (for interactive spreadsheet-style edits — used for aerodynamic-coefficient blocks). Capabilities:

- Editable table per parameter category (physical, geometric, aerodynamic, propulsion).
- Graphical thrust-curve editor (click-and-drag on points).
- Live CP vs CG display with stability colour bands.
- 2D body-shape editor (`X`, `R` arrays from `AXIBOD`).
- YAML and JSON import / export.
- Modification history with undo / redo and time-stamped audit trail.
- Visual diff between original and modified templates.
- Multiple named configurations per rocket (`BA_windy`, `BA_standard`).

### 2.7 Mission File Schema

The full schema lives in `schemas/mission_file.schema.yaml`. Mission files live under `mission/<mission_id>.yaml`.

#### 2.7.1 Location and Naming

Mission IDs are user-chosen and unique within the project. Recommended pattern: `<rocket>_<target_km>km_<date>.yaml` (e.g. `BA_100km_2026_05_01.yaml`). Mission files are version-controlled inside the same on-premises Git repository as templates; the audit trail is the project's primary record of every flight's configuration.

#### 2.7.2 Schema (worked example)

```yaml
# === REQUIRED FIELDS ===

flight_computer_path: A          # A | B

mission:
  rocket_id: "BA"
  target_ground_range_m: 100000
  cep_target_m: 15

# === OPTIONAL FIELDS ===

mission:
  guidance_reference_pitch_deg: 65   # used by autopilot_mode = fixed_pitch
  stages:
    - stage_id: "stage_1"
      autopilot_mode: "auto_shape"   # auto_shape | fixed_pitch | passive_ballistic |
                                     # waypoint | terminal_homing
      autopilot_params: {}
      abort_policy:
        alpha_max_deg: 25
        rate_max_deg_s: 1000
        estimator_divergence: 100
        link_loss_timeout_s: 5
        recurring_saturation:
          enabled: true
          mode: "both"               # cruise_percent | continuous_block | both
          cruise_percent_threshold: 0.05
          continuous_block_ms: 100

loop_rate_hz: 100                # Path A: 50–200; Path B: 100–500

estimator:
  approach: "single_filter"      # single_filter | sequential | imm

mhe:
  enabled: false
  horizon: 10                    # Path A: 5–15; Path B: 3–7
  rate_hz: 10                    # Path A: 5–20; Path B: 2–10
  budget_overrun_mode: "skip"    # skip | reduce_horizon | reduce_trust

seeker:
  enabled: false
  mode: "strapdown"              # strapdown | gimbaled
  target_class: "vehicle"
  loss_of_lock_policy: "revert_trajectory"   # revert_trajectory (default) |
                                             # continue_PN | abort | operator_prompt
  camera_id: "builtin"
  fov_deg: [45.0, 30.0]          # [horizontal, vertical]
  mount_isolation: "rigid"       # rigid | rubber | gel | gimbal_2axis
  los_rate_method: "savitzky_golay"          # savitzky_golay | first_order |
                                             # state_observer
  pn_variant: "true"             # pure | true | augmented
  pn_gain_N: 4.0
  inference_target: "gpu"        # gpu | cpu | hexagon

optional_devices:
  gps:
    present: true
    sensor_id: "u-blox-ZED-F9P"
    fix_quality_required: "RTK_OR_SBAS"
  radio:
    present: true
    band: "LoRa-418MHz"
    tx_power_dbm: 14
  warhead_fuse: false
  engine_starter_1: false
  engine_starter_2: false
  separating_nail_1: false
  separating_nail_2: false
  jamble: false
  external_imu:
    present: false              # Path A only — declared AND auto-detected
  flight_termination_system:
    present: false              # required true if radio.present is false

logging_profile: "FULL"          # FULL (101 cols) | FLIGHT (53) | MINIMAL (18)
logging_completeness_target: 1.0 # quality goal, configurable per mission

safety_zone:
  type: "polygon"                # polygon | circle | vlos_or_tethered
  vertices:
    - [16.450, 44.110]
    - [16.460, 44.115]
    - [17.580, 44.120]
  abort_on_breach: true

video_recording:
  drone: { enabled: true,  use_if_available: true }
  fixed: { enabled: true,  use_if_available: true }
```

#### 2.7.3 Validation Rules

Mission validator runs at lock time. It enforces:

- `flight_computer_path ∈ {A, B}`.
- `mission.target_ground_range_m > 0`.
- `seeker.enabled = true` requires the chosen template's stage with `seeker_capable = true`.
- Path B + `seeker.enabled = true` requires a Jetson Nano registered against the bench.
- All `optional_devices.*.present = true` must match physical CAN node IDs in `hardware_mapping.yaml`.
- `safety_zone.vertices` form a valid (non-self-intersecting) polygon.
- `mhe.horizon` and `mhe.rate_hz` inside the path-supported ranges.
- `loop_rate_hz` inside the path-supported range.
- Per-mode required fields: `auto_shape` requires `optional_devices.gps.present = true`; `fixed_pitch` requires `mission.guidance_reference_pitch_deg`; `passive_ballistic` ignores both.
- `optional_devices.radio.present = false` requires `optional_devices.flight_termination_system.present = true`.
- `optional_devices.gps.present = false` requires `safety_zone.type = vlos_or_tethered`.
- Cross-stage actuator and controller `ref` keys resolve in their respective libraries.

A failed validation does not enter pre-launch.

#### 2.7.4 Default Behaviour

When `mission.guidance_reference_pitch_deg` is omitted (default), `auto_shape` autopilot computes the optimal trajectory shape from `target_ground_range_m` alone. When present, `fixed_pitch` honours it as a power-user override. The original simulator's "launch angle" parameter is interpreted under v5.2 as `guidance_reference_pitch_deg`, an explicit autopilot reference, not an initial-condition pitch.

#### 2.7.5 Versioning and Storage

Mission files are version-controlled in Git alongside templates. Every flight log records the SHA-256 checksum of the mission file resolved at lock time. Mission files cannot be modified after lock; a new mission file must be created with a new ID for any change.

#### 2.7.6 Editor — GUI + YAML

S5 in the GCS provides a guided GUI editor that emits the YAML. Power users can edit the YAML directly. The GUI re-imports the YAML on save and re-runs the validator. The GUI generates and the YAML is the source of truth.

### 2.8 Actuator Library Schema

#### 2.8.1 Rationale

A library decouples actuator definitions from rocket templates. The same actuator on different rockets is defined once. Different actuators on the same rocket are referenced per fin. New actuator types do not touch any rocket template.

#### 2.8.2 Location and Naming

Single project-level file `actuator_library.yaml` at the project root. The full schema is in `schemas/actuator_library.schema.yaml`.

#### 2.8.3 Schema with multiple model types

Four `model_type` values are supported: `second_order_with_delay`, `first_order`, `ideal`, `electromechanical`. Worked example:

```yaml
actuators:
  default_4020:
    description: "Default 4020-class servo (BA reference baseline)"
    model_type: "second_order_with_delay"
    wn_rad_s: 2739.0
    zeta: 0.0208
    delay_s: 0.008
    rate_max_deg_s: 75.0
    delta_max_deg: 15.0
    delta_min_deg: -15.0
    deadband_deg: 0.0
    backlash_deg: 0.0
    config_type: "X"

  XQ-4020:
    description: "XQPOWER XQ-4020 (production candidate)"
    model_type: "second_order_with_delay"
    wn_rad_s: 2618.0
    zeta: 0.7
    delay_s: 0.005
    rate_max_deg_s: 428.0
    delta_max_deg: 30.0
    delta_min_deg: -30.0
    deadband_deg: 0.1
    backlash_deg: 0.2
    config_type: "X"

  fast_first_order:
    description: "First-order approximation for early tuning"
    model_type: "first_order"
    tau_s: 0.01
    rate_max_deg_s: 300.0
    delta_max_deg: 25.0
    delta_min_deg: -25.0

  ideal_servo:
    description: "Zero-dynamics ideal servo for analytical tests"
    model_type: "ideal"
    rate_max_deg_s: 100000.0
    delta_max_deg: 25.0
    delta_min_deg: -25.0

  brushless_em:
    description: "Electromechanical (BLDC + gearbox) with hinge-moment loading"
    model_type: "electromechanical"
    motor:
      kt_Nm_per_A: 0.087
      ke_Vs_per_rad: 0.087
      R_ohm: 1.2
      L_H: 1.5e-3
      J_motor_kgm2: 4.5e-6
    gearbox:
      ratio: 80.0
      efficiency: 0.85
    rate_max_deg_s: 250.0
    delta_max_deg: 20.0
    delta_min_deg: -20.0
    hinge_moment_curve_csv: "data/hinge_moment.csv"   # Phase 3.7 Q4 fidelity option
```

#### 2.8.4 The two limits

Templates declare rocket-level `delta_max_deg` and `delta_dot_max_deg_s`. Library entries declare actuator-level `delta_max_deg`, `delta_min_deg` and `rate_max_deg_s`. The mixer enforces `min(rocket, actuator)` at the boundary before dynamics integrate.

#### 2.8.5 Saturation Reporting

Every loop iteration writes columns 102 and 103 (uint8 bitmask, bit `i` = fin `i+1`). Up to 12 fins are supported via uint16 widening when `num_fins > 8`. Both columns are 0 in normal operation and are always included in transmitted MisPlot frames.

#### 2.8.6 Datasheet Ingestion Guide (lives at the Actuators tab)

The S5b Actuators tab embeds the datasheet conversion guide. Conversion rules:

- **Bandwidth → ωₙ.** `ωₙ = 2π · f_-3dB`, where `f_-3dB` is the −3 dB closed-loop bandwidth from the datasheet.
- **Step response time → (ωₙ, ζ).** From rise time `t_r` and peak overshoot `Mp`, compute `ζ = -ln(Mp) / sqrt(π² + ln²(Mp))` and `ωₙ = (π - acos(ζ)) / (t_r · sqrt(1 - ζ²))`.
- **Slew rate → `rate_max_deg_s`.** Use `(60° / t_60°)`.
- **Pure delay → `delay_s`.** Take the datasheet's `transport delay` or oscilloscope-measured command-to-motion-start delay.
- **Deadband → `deadband_deg`.** Manufacturer-stated dead zone or measured value.
- **Backlash → `backlash_deg`.** Mechanical backlash measured with a dial indicator.

The guide is reachable from S5b directly and is also published in `docs/actuator_datasheet_ingestion.md`.

#### 2.8.7 Library Versioning

Every flight log records the SHA-256 checksum of the resolved actuator-library entry per fin. Mission files also record the resolved actuator parameters at lock time (snapshot). Library file revisions are tracked in Git; the resolved snapshot inside the mission file is what flew.

### 2.9 Template Editing API

A REST API exposes programmatic template editing alongside the S4 GUI. The API lives under `/api/v1/templates`. Endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/templates` | Import a new template folder (multipart form). Returns `template_id` and validation report. |
| `GET` | `/api/v1/templates` | List templates with filters (`type`, `status`). |
| `GET` | `/api/v1/templates/{id}` | Read full template (YAML). |
| `PATCH` | `/api/v1/templates/{id}` | Apply a JSON-Patch (RFC 6902) document. Re-runs validator. |
| `PUT` | `/api/v1/templates/{id}` | Replace template contents. Re-runs validator. |
| `DELETE` | `/api/v1/templates/{id}` | Delete (soft delete; archived). |
| `POST` | `/api/v1/templates/{id}/validate` | Re-run C1–C25 validator. Returns full clause-by-clause report. |
| `POST` | `/api/v1/templates/{id}/duplicate` | Duplicate with new ID. |
| `GET` | `/api/v1/templates/{id}/history` | Audit history (every change, who, when). |
| `GET` | `/api/v1/actuator-library` | Read full library. |
| `PATCH` | `/api/v1/actuator-library` | Patch library (JSON-Patch). |
| `GET` | `/api/v1/controller-library` | Read full controller library. |
| `PATCH` | `/api/v1/controller-library` | Patch controller library. |

Authentication: bearer JWT issued by Keycloak. Authorisation: `engineer` and above for `PATCH` / `PUT` / `POST`; `viewer` for `GET`. All write endpoints write the audit trail.

---

## Rocket Onboarding Procedure

The rocket is a configuration artefact, not source code. This procedure is the acceptance gate: a rocket flies only after every step here has passed. The 1-hour onboarding success criterion (Phase 0.3) is measured from receiving a valid rocket data package to producing a passing simulation run on at least one path.

The procedure is path-agnostic. Path selection is a mission-level decision; the same onboarded template flies on either path.

### A.1 Template Validation Contract (C1–C25)

The validator runs at import and produces PASS / WARN / FAIL per clause. PASS or WARN templates progress; FAIL blocks. WARN templates require explicit operator override, which is logged and signed off by SA.

| Clause | Requirement | Failure verdict |
|--------|-------------|-----------------|
| C1 — Schema | Template YAML conforms to the published schema (all required keys present, correct types). | FAIL |
| C2 — Positive mass | All dry and full masses > 0; full > dry per stage. | FAIL |
| C3 — Positive inertias | All diagonal inertias > 0 per stage. | FAIL |
| C4 — Mass-CG consistency | Full CG forward of dry CG, or template explicitly marks tail-heavy propellant with explanation. | WARN |
| C5 — Inertia sanity | `Iyy ≈ Izz` for axisymmetric bodies; asymmetry must be declared explicitly. | WARN |
| C6 — Aero coverage | CA / CN / CM tables cover the declared envelope per stage with no holes. | FAIL |
| C7 — Static stability | CP aft of CG at every operating point per stage, or explicitly marked canard-active. | FAIL |
| C8 — Thrust integrity | For each powered stage, thrust curve present and `∫T dt` matches declared total impulse to ±5 %. Unpowered coast stages omit the propulsion block (Phase 2 Q2). | FAIL |
| C9 — Fin limits | `delta_max_deg` and `delta_dot_max_deg_s` declared per finset; control authority sufficient at every operating point. | WARN |
| C10 — Numeric sanity | No NaN / Inf; aerodynamic coefficient signs follow declared conventions. | FAIL |
| C11 — Hardware mapping | `hardware_mapping_file` resolves; servo node IDs assigned and unique; counts match fin counts. | FAIL |
| C12 — Reference frames | All geometry in a single declared frame; transformations documented. | FAIL |
| C13 — Seeker config | Per stage, `seeker_capable` declared. If `mission.seeker.enabled = true`, every required seeker field resolves (`mode`, `camera_id`, `target_class`, `tracker_model`, `terminal_handoff_altitude`, `loss_of_lock_policy`, `pn_variant`, `pn_gain_N`, `fov_deg`, `mount_isolation`, `los_rate_method`, `inference_target`). | FAIL |
| C14 — Actuator references | Every fin slot resolves to a valid actuator-library entry with all required model-type fields. Min/max deflection in the actuator entry is at least as wide as rocket-level limits, OR rocket-level limits are explicitly more restrictive. | FAIL |
| C15 — Stage count | `num_stages ≥ 1`; `len(stages) == num_stages`. | FAIL |
| C16 — Stage indices monotonic | Stage IDs in `stages[]` are unique; logical order is monotonic. | FAIL |
| C17 — Separation completeness | Each non-terminal stage declares a complete separation block (`trigger`, `offset`, `timeout`, `arming`, `nail_count`, `nail_pyro_events`). | FAIL |
| C18 — Timing reachable | Separation timeouts and arming windows are physically reachable from the previous stage's burn-time and trajectory envelope. | FAIL |
| C19 — Controller-type implementation | `controller_type` is one of the registry values whose implementation is registered. All seven types ship with day-1 implementations; `aerospike` ships as a registered stub (`gnc-core/actuator/AerospikeActuatorStub.h`) and a mission file that selects `controller_type: aerospike` is rejected with FAIL at validator-time as long as the stub's `implementation_status` field is `stub`. | FAIL |
| C20 — Mass continuity | Per stage, full mass equals dry mass plus declared propellant mass; total rocket mass at separation matches sum of remaining stages. AE owns the math. | FAIL |
| C21 — Hardware mapping resolves per stage | Per-stage CAN node IDs and pyro events resolve to entries in `hardware_mapping.yaml`. | FAIL |
| C22 — Controller `ref` resolves | Every per-stage `controller_ref` resolves to a valid entry in `controller_library.yaml` with all required gain fields. | FAIL |
| C23 — Sensor declaration | Per stage, declared optional sensors (e.g. external IMU) match `optional_devices` declared in the mission file at lock time. | FAIL |
| C24 — Abort policy | Abort policy is declared per stage. Soft-fail at onboarding (WARN if missing); hard-fail at flight if absent. SE owns the policy matrix. | WARN at onboarding / FAIL at flight |
| C25 — CAN bandwidth | Per the chosen `loop_rate_hz`, computed CAN bus utilisation < 70 % including telemetry headroom. EE owns the calculation. | FAIL |

### A.2 Onboarding Workflow

```
Rocket Data Package (customer or internal team)
    │
    ▼
Step 1: Format Detection
    Parser scans the supplied folder; identifies DATCOM, CSV, XLSX, CAD.
    Reports what is present and what is missing.   Time budget: 5 min
    │
    ▼
Step 2: Template Generation
    Parser produces draft rocket_template.yaml + unified HDF5 aero databases.
                                                  Time budget: 10 min
    │
    ▼
Step 3: Validation Contract (C1–C25)
    All clauses checked. Report lists PASS / WARN / FAIL per clause.
    FAIL = template cannot proceed.               Time budget: 1 min
    │
    ▼
Step 4: Smoke-Test Simulation
    Nominal vertical launch, no wind, runs to apogee, verifies the
    simulator does not diverge.                   Time budget: 5 min
    │
    ▼
Step 5: Baseline Monte Carlo
    User-selected run count (default 100; configurable).
    CEP must be finite (no NaN, no explosion).
    Gain scheduling exercised across envelope.    Time budget: variable
    │
    ▼
    If MC FAILS: iterate on gain scheduling and re-run.
    The onboarding loop is iterative, not a one-shot fail.
    │
    ▼
Step 6: Hardware Mapping Check
    Servo node IDs, count, CAN bus budget, pyro count, GPIO assignments,
    TLM payload layout.                            Time budget: 5 min
    │
    ▼
Step 7: Onboarding Report
    PASS: rocket ready for tuning phase.
    WARN: operator acknowledgement required (SA sign-off).
    FAIL: rocket NOT ready; report issues.        Time budget: 4 min
```

Total budget: ~50 min for nominal package; 1-hour success criterion stands when Monte Carlo run count is at the default. Operator can choose larger MC counts (e.g. 500); time budget scales accordingly.

### A.3 Onboarding Roles

SA and AE share end-to-end ownership as co-pilots: SA owns architectural and integration fit; AE owns aerodynamic and physical correctness. Per step:

| Step | Responsible | Accountable | Artefact |
|------|-------------|-------------|----------|
| 1 Format detection | BE | BE | Format manifest with missings report |
| 2 Template generation | BE + AE | AE | `rocket_template.yaml` + HDF5 files |
| 3 Validation | Automated | QA | Clause-by-clause report |
| 4 Smoke simulation | Automated | QA | Smoke-test log + trajectory plot |
| 5 Baseline Monte Carlo | Automated | QA | MC report + CEP statistics |
| 6 Hardware mapping | HW + EE | HW | Hardware binding table |
| 7 Onboarding report | QA | SA + AE | Signed onboarding report |

### A.4 Reference Test Fixtures (illustrative)

The rockets below are illustrative test fixtures that ship with the repository for unit-testing, golden-log validation and onboarding workflow exercise. They are **not** an architectural commitment: the committed-rockets set for any release is defined operationally per `release_manifest.yaml` (Decision 15). A new rocket whose envelope falls outside the fixtures' combined coverage must still pass C1–C25 and produce its own per-rocket validation artefacts (§0.3.3) — no `gnc-core/template/` source-code changes are required.

| Fixture | Coverage | Known issues |
|---------|----------|--------------|
| ES_273 | Single-stage tail-fin baseline, X-config | None — simplest case |
| BA | Canard controls, sign-inversion, single-stage | `Iyy_full < Iyy_dry` (template flagged; AE owns correction) |
| GH | Two-stage, 8 fins stage 1 (two FINSETs), Mach to 15, α to 140° | Stage 2 `Ixx` anomaly (template flagged); extended atmosphere; α > 30° handled by Newtonian fallback per §3.3 |
| SA | Two-stage, multi-stage with **unpowered coast stage 2**, three FINSETs stage 1, `Iyy ≠ Izz` | Stage 2 thrust curve absent by design; multi-stage architecture still applies |
| `_synth/synth_tvc` | Synthetic TVC fixture for SIL only (Audit C4) | SIL-only; not flown |
| `_synth/synth_coldgas` | Synthetic cold-gas fixture for SIL only (Audit C4) | SIL-only; not flown |
| `_synth/synth_hybrid` | Synthetic hybrid fixture for SIL only (Audit C4) | SIL-only; not flown |

### A.5 Missing Data Reporting and Golden Dataset Format

#### Missing-data reporting

Step 1 emits a structured `missings_report.json`:

```json
{
  "rocket_id": "SA",
  "package_received": "2026-04-22T10:30:00Z",
  "missings": [
    {
      "key": "stages[1].propulsion.thrust_curve_file",
      "severity": "info",
      "reason": "Stage 2 declared as unpowered coast stage; no thrust curve required."
    },
    {
      "key": "stages[0].aerodynamics.coefficient_files.damping",
      "severity": "warn",
      "reason": "Cnr / Clp data not provided; damping derivatives default to zero."
    }
  ],
  "blocking": [],
  "non_blocking": [ "..." ]
}
```

Customers see this report immediately. The system reports missings; it does not silently fill them.

#### Golden Dataset Format and Shape — Design (recommendation)

The golden-log artefact is the canonical dataset against which any simulator output (SIL, in-flight, HIL replay) is validated. v5.2 defines the format for all rocket configurations. The correct reference logs will be supplied later; until then, the BA logs in Appendix C are used as-is for envelope-shape validation only.

**File layout per rocket configuration.**

```
rockets/<rocket_id>/golden/
  manifest.yaml                  # checksums, generator version, config
  config_<config_id>.yaml        # mission parameters that produced each log
  logs/<config_id>.h5            # primary HDF5 dataset (canonical)
  logs/<config_id>.csv           # CSV mirror (informational)
  events/<config_id>.json        # timestamped events (separation, abort, lock)
  metadata.json                  # rocket type, num_stages, motor presence
```

`manifest.yaml` records the SHA-256 checksum of every log, the generator engine version, the integrator settings, the atmosphere model and the seed for any stochastic elements.

**HDF5 layout (canonical).**

```
/dataset                       (compound dataset, 103 columns, NROWS rows)
/dataset/columns               (attribute: array of column names per Appendix B)
/dataset/units                 (attribute: array of units)
/dataset/sampling_rate_hz      (attribute: integer; logging rate)
/events                        (compound dataset; ts_ns, type, payload_json)
/metadata                      (group)
  /metadata/rocket_id          (string)
  /metadata/num_stages         (int)
  /metadata/configuration      (string: single_stage |
                                multi_stage_with_powered_upper_stage |
                                multi_stage_with_unpowered_upper_stage |
                                other)
  /metadata/generator_version  (string)
  /metadata/sha256             (string)
  /metadata/seed               (int64)
/snapshots                     (group; resolved configs at lock time)
  /snapshots/template          (string: full YAML)
  /snapshots/mission           (string: full YAML)
  /snapshots/actuator_library  (string: full YAML)
  /snapshots/controller_library(string: full YAML)
  /snapshots/hardware_mapping  (string: full YAML)
```

**Configuration coverage.** Per rocket type, the following minimum-viable goldens are produced:

| Configuration | Minimum-viable dataset |
|---------------|-----------------------|
| Single-stage (e.g. BA, ES_273) | 5 ground-range targets covering 25, 50, 80, 124, 150 km and 3 launch-pitch variations (45°, 75°, 85°) at 100 km — 8 logs total. |
| Multi-stage with powered upper stage (e.g. GH) | 4 ground-range targets at 200, 400, 800, 1500 km plus 2 separation-trigger variations (`burnout`, `time`) — 6 logs total. |
| Multi-stage with unpowered upper stage (e.g. SA) | 3 ground-range targets at 100, 200, 350 km plus 1 separation-altitude variation — 4 logs total. |
| Other configurations | At least 3 distinct mission profiles spanning the rocket's declared envelope, plus 1 envelope-edge case. |

**Indexing.** Logs are indexed by `(rocket_id, config_id, generator_version)`. Multiple generator versions can coexist; the active version is declared in `manifest.yaml`. Old goldens are retained for regression.

**Storage.** Goldens live in object storage (on-premises MinIO) addressed by SHA-256 checksum. The Git repository pins the active checksum per rocket per version; the simulator looks up the storage URL by checksum at validation time.

### A.6 Hardware Extension Point

Adding more actuators adds more CAN nodes with the same node-counting convention. Servo node IDs follow a fixed pattern:

```
0x25 + (stage_index × 12) + fin_index
```

This means stage 1 fins occupy `0x25 .. 0x30` (12 IDs reserved per stage). New rockets with > 12 fins per stage require explicit extension to the addressing scheme; AE + EE jointly own the extension. The mapping is declared in `hardware_mapping.yaml` per template — see `schemas/hardware_mapping.schema.yaml`.

### A.7 Onboarding Report Archival and Re-onboarding Policy

Reports are stored in a secure on-premises folder (`/srv/gnc/onboarding/`) versioned as `<rocket_name>_<YYYYMMDD>_v<n>` (e.g. `BA_20260422_v1.pdf`). Access requires `engineer` role or above. Reports are never deleted.

A rocket re-onboards on any change to the template that affects clauses C1–C25 — i.e. any aerodynamic, mass, inertia, propulsion, fin-configuration, controller-library, or hardware-mapping change. A new report is produced; the previous version remains archived.

### A.8 Delta-Onboarding (Internal Iterations)

The onboarding procedure applies to internal iterations as well. The delta-onboarding workflow runs the same pipeline but skips Step 1 (format detection) when the rocket folder is unchanged in structure. A `delta_report.json` highlights which clauses' verdicts changed between versions.

---

## Phase 3 — Physics Engine — Simulation Engine

Everything else (control, tuning, UIs, HIL) depends on the physics engine's accuracy and speed. The engine is C++ (no Python hybrid). Two engines coexist (Phase 3 Q8): a high-fidelity engine for accurate runs and a low-fidelity fast engine for quick tuning. The user chooses in the GUI per simulation.

### 3.0 Reference Frames

All physics in §3.1–§3.9 use the four frames below. Templates declare geometry in body frame; the simulator applies the appropriate rotations.

| Frame | Origin | Axes | Used for |
|-------|--------|------|----------|
| Body (`b`) | Vehicle CG | `x` forward, `y` right wing, `z` down | Forces, moments, IMU readings, fin / TVC commands, geometry in template |
| North-East-Down (NED, `n`) | Launch site (or instantaneous projection) | `x` north, `y` east, `z` down | Local navigation, waypoint definitions, GCS overlay, mission target coordinates |
| Earth-Centred Earth-Fixed (ECEF, `e`) | Earth centre | rotates with Earth | GPS fix output, long-range trajectory propagation |
| Earth-Centred Inertial (ECI, `i`) | Earth centre | inertial (J2000) | High-fidelity gravity (J2/J3/J4), Coriolis frame definition |

Rotation matrices used:
- `R_b_n = quat2rot(q_b_n)` — body ↔ NED (the canonical attitude quaternion `q` in §3.1.3 is `q_b_n`).
- `R_n_e = R_z(λ) · R_y(-π/2 - φ)` — NED ↔ ECEF, where `(φ, λ)` are launch-site latitude / longitude.
- `R_e_i = R_z(Ω_earth · t)` — ECEF ↔ ECI.

Convention: every quantity in `gnc-core` carries a frame suffix (`r_n`, `v_n`, `q_b_n`, `b_a_b`, `b_g_b`, `omega_b_b`, etc.). C12 enforces that templates declare geometry in a single named frame; the parser converts as needed.

### 3.1 Fundamental Equations of Motion

The state vector is propagated in the inertial frame (§3.0). Mass `m(t) = m_dry + m_propellant(t)` and inertia `I(t) = I_dry + I_propellant(t)` are interpolated from per-stage `mass_curve` and `inertia_curve` tables; templates may provide either, both or neither (constant inertia is the default). Atmospheric density `ρ(h)` is treated as a stochastic input with ±5–10 % anomaly vs ISA selectable at Monte Carlo time (`mission.replay.atmosphere_seed`). Sensor latency is modelled per channel: IMU < 1 ms (effectively zero), GPS `optional_devices.gps.latency_ms` (default 100). Quaternion drift control (§3.1.3) renormalises every step. Reference frames per §3.0.

#### 3.1.1 Translational motion

```math
m(t)\, \dot{\mathbf{V}} = \mathbf{F}_\text{aero} + \mathbf{F}_\text{thrust} + \mathbf{F}_\text{gravity} + \mathbf{F}_\text{coriolis}
```

```
m(t) = m_dry + m_propellant(t)

F_aero:
  F_drag    = -q · S_ref · CA(M, α, Re) · v̂_rel
  F_normal  =  q · S_ref · CN(M, α, δ) · n̂
  F_side    =  q · S_ref · CY(M, β, δ) · ê_side
  q         = ½ · ρ(h) · |v_rel|²

F_thrust  =  T(t) · û_body  +  (P_e − P_a) · A_e · û_body

F_gravity =  m(t) · g_earth(r)        # includes J2 / J3 / J4

F_coriolis = −2 · m · Ω_earth × v
```

##### 3.1.1.1 Launch-rail phase

When the template declares `launch_rail.{length_m, mu_friction}`, the simulator runs a constrained launch-rail phase before free flight. While on the rail:

```
constraint:        position normal to rail = 0; velocity normal to rail = 0
F_normal_rail =    aerodynamic side force + thrust misalignment + asymmetric mass moment / lever arm
F_friction =       -mu_friction · |F_normal_rail| · v̂_along_rail
condition_to_exit: position_along_rail >= launch_rail.length_m
```

At rail exit, the rocket inherits initial angular rates from CG-offset × normal force on the rail (the *tip-off* moment). Templates that omit `launch_rail` skip this phase and start in free flight at zero angular rate.

#### 3.1.2 Rotational motion (full asymmetric form)

```math
\mathbf{I}(t)\, \dot{\boldsymbol{\omega}} + \boldsymbol{\omega} \times (\mathbf{I}(t)\, \boldsymbol{\omega}) = \mathbf{M}_\text{aero} + \mathbf{M}_\text{thrust} + \mathbf{M}_\text{control}
```

```
I_xx · dp/dt + (I_zz − I_yy) · q · r + I_yz·(q² − r²) + ... = M_x   # Roll
I_yy · dq/dt + (I_xx − I_zz) · p · r + ...                  = M_y   # Pitch
I_zz · dr/dt + (I_yy − I_xx) · p · q + ...                  = M_z   # Yaw

# Aerodynamic moments
M_aero_x = q · S_ref · L_ref · Cll(M, α, δ)
M_aero_y = q · S_ref · L_ref · CM(M, α, δ)
M_aero_z = q · S_ref · L_ref · CLN(M, β, δ)

# Damping moments
M_damp_y = q · S_ref · L_ref² / (2 · V) · Cmq(M, α) · q
M_damp_z = q · S_ref · L_ref² / (2 · V) · Cnr(M, α) · r       # 0 if not provided
M_damp_x = q · S_ref · L_ref² / (2 · V) · Clp(M, α) · p       # 0 if not provided

# Jet damping (variable-mass moment) — gated by propulsion.jet_damping_enabled (default true for any powered stage)
M_jet_damp = -m_dot · (r_nozzle_cm × omega) × r_nozzle_cm
   where m_dot           = -dm/dt (propellant mass-flow rate, > 0 during burn)
         r_nozzle_cm     = vector from CG to nozzle exit (body frame)
         omega           = body angular rate vector
M_jet_damp is added to M_aero in the rotational EOM during burn; zero in coast.
```

For any rocket whose template declares `Iyy ≠ Izz`, the cross-product term `(Izz − Iyy) · q · r` is non-zero and is integrated.

#### 3.1.3 Attitude representation

Quaternions avoid gimbal lock and integrate cleanly with ESKF.

```
q̇ = ½ · Ω(ω) · q

Ω(ω) = | 0   −ωx  −ωy  −ωz |
       | ωx   0    ωz  −ωy |
       | ωy  −ωz   0    ωx |
       | ωz   ωy  −ωx   0  |

R_b_n = quat2rot(q)

# Euler extraction (display only)
roll  = atan2(2(wx + yz), 1 − 2(x² + y²))
pitch = asin (2(wy − xz))
yaw   = atan2(2(wz + xy), 1 − 2(y² + z²))

# Numerical hygiene — renormalise every integration step
q ← q / ‖q‖
```

### 3.2 Numerical Integration with Dual-Fidelity Engine Selection

| Method | Accuracy | Stability | Compute load | Use |
|--------|----------|-----------|--------------|-----|
| Euler (forward) | Poor | Weak | Lowest | Quick tests |
| RK4 fixed-step | Good | Good | Medium | High-fidelity engine default |
| RK45 adaptive | High | Excellent | High | Stiff systems / Monte Carlo |
| Dormand-Prince | High | Excellent | High | Monte Carlo |
| Adams-Bashforth-Moulton | High | Good for smooth | Medium | Long stable flights |

Aerodynamic interpolation uses **linear** (Phase 3 Q2). The variable-dimensional interpolator accepts any provided shape — `Mach × α`, `Mach × α × Re`, `Mach × α × δ`, `Mach × α × δ × Re` — without assuming data shape (Phase 3 Q5).

#### Dual-fidelity engines (Phase 3 Q8)

| Engine | Integrator | Time step | Atmosphere | Aero interpolation | Use case |
|--------|------------|-----------|------------|--------------------|----------|
| `high_fidelity` | RK45 / RK4 | 0.1–1 ms | Per template (ISA / Extended / NRLMSISE-00) | Variable-dim linear | Acceptance, golden generation, post-flight |
| `low_fidelity_fast` | RK4 | 5–10 ms | ISA only | 2D `Mach × α` only | Quick tuning loops |

The user chooses in GUI S6 (Simulation Runner) per simulation. The Monte Carlo Runner (S11) selects per scenario; the user sets the engine choice as part of each MC scenario.

#### 3.2.1 Performance Requirements

| Metric | Real-time (HIL) | Accelerated (Monte Carlo) | Post-flight analysis |
|--------|-----------------|----------------------------|----------------------|
| Time step | 1–5 ms | 0.1–1 ms | 0.01–0.1 ms |
| Simulation ratio | 1 : 1 | 10–100 × | Unlimited |
| Control cycle time | < 20 ms | n/a | n/a |
| Concurrent simulations | 1 | 8–32 | Variable |
| Integration method | RK4 | RK4 / RK45 | RK45 adaptive |
| CPU consumption | 15–20 % | 80–95 % | Unlimited |

Monte Carlo run count per rocket is a user option (Phase 3 Q7) set in S11. Default 1,000.

### 3.3 Atmosphere Models

| Model | Altitude range | Accuracy | Use |
|-------|----------------|----------|-----|
| ISA | 0–47 km | Good | Subsonic / supersonic flights inside the troposphere–stratosphere envelope |
| ISA Extended | 47–86 km | Medium | High-altitude flights (mesosphere) |
| NRLMSISE-00 | 80–1,000 km | High | Hypersonic / exo-atmospheric flights |
| US Std 1976 | 0–86 km | Standard ref | Verification |

Wind models (Power-law and logarithmic) and turbulence models (Dryden and Von Karman) are implemented and selectable per simulation. Intensity bands per MIL-HDBK-1797: light 1.5 m/s, moderate 3.0 m/s, severe 6.0 m/s, extreme 9.0 m/s.

**Newtonian high-α fallback.** When `α` exceeds the declared `alpha_range` of the supplied aero tables, the variable-dim interpolator falls back to Newtonian impact theory: `CN(α) = CN_max · sin²(α) · cos(α)`, `CA(α) = CA_max · sin³(α)`, with the constants `CN_max` / `CA_max` taken from the table boundary. The validator emits **WARN** when the rocket's declared `alpha_max_abs` exceeds the table's `alpha_range`. Hypersonic flights (e.g. fixtures at Mach > 8 with α ≤ 30°) use the supplied tables directly.

**Atmospheric density variance.** Monte Carlo runs perturb `ρ(h)` by a per-altitude Gaussian (`σ = 5 % at 0 km` linearly increasing to `σ = 10 % at 80 km`) seeded from `mission.replay.atmosphere_seed`. The high-fidelity engine consumes the perturbation; the low-fidelity engine ignores it.

**GPS latency and GPS-denied flight.** The GPS measurement carries a latency `optional_devices.gps.latency_ms` (default 100 ms); ESKF compensates via the existing measurement-time-of-validity logic at update time. During GPS outage, the position covariance grows as `σ_pos(t) ≈ σ_acc · t² / 2 · √(N_imu_samples)`; the autopilot falls back to `fixed_pitch` per Decision 17 and the GCS displays a position-uncertainty cone.

### 3.4 Supported Failure Scenarios

| Scenario | Injection | Timing | Expected response |
|----------|-----------|--------|-------------------|
| Fin stuck | Freeze `δᵢ` at value | Scheduled / random | Mixer redistribution |
| Fin loss | Zero out fin `CN`, `CM` | Scheduled | IMM mode switch (faulty) when IMM active |
| Thrust loss | `T(t) → 0` | Scheduled | Glide + abort |
| Thrust oscillation | `T(t) ± ΔT` | Random | Compensated by controller |
| CG shift | `cg_x → cg_x + Δ` | Scheduled | Gain re-tuning |
| IMU bias | `b_a`, `b_g → injected` | Continuous | EKF/ESKF compensates |
| IMU noise | `σ² → 10·σ²` | Continuous | Filter retuning |
| GPS outage | `z_gps = null` | Scheduled | Dead reckoning |
| GPS spoofing | `z_gps = z_gps + attack` | Scheduled | MHE rejects outliers |
| Comm loss (TLM) | UART/USB error | Random | Local logging continues |
| Battery drop | `V_battery → V_battery × f` | Gradual | Failsafe + abort |

The engine supports hot fault injection (no restart):

```cpp
sim.injectFault("FIN_1_STUCK", at_time=5.2, params={"angle_deg": 5.0});
```

### 3.5 Simulation Engine Architecture (C++)

```
+---------------------------------------------------------+
|              Simulation Engine Architecture              |
+---------------------------------------------------------+
|                                                          |
|  +----------+   +----------+   +----------+              |
|  | Physics  |   | Atmo     |   | Fault    |              |
|  | Solver   |-->| Model    |-->| Injector |              |
|  | (6-DOF)  |   |          |   |          |              |
|  +-----+----+   +----------+   +----------+              |
|        |                                                  |
|        v                                                  |
|  +----------+   +----------+   +----------+              |
|  | Aero     |   | Thrust   |   | Mass     |              |
|  | Database |<--| Curve    |-->| Tracker  |              |
|  | (HDF5)   |   | (HDF5)   |   |          |              |
|  +----------+   +----------+   +----------+              |
|                                                          |
|  +-----------------------------------------------+      |
|  | State Propagator (RK4 / RK45)                  |      |
|  | Inputs: state, commands, wind, faults          |      |
|  | Output: next state @ dt                        |      |
|  +-------------------|---------------------------+      |
|                      |                                  |
|                      v                                  |
|  +-----------------------------------------------+      |
|  | Sensor Simulator                               |      |
|  | IMU with bias / noise / drift                  |      |
|  | GPS with rate / lag / occasional loss          |      |
|  | Magnetometer                                    |      |
|  +-------------------|---------------------------+      |
|                      |                                  |
|                      v                                  |
|  +-----------------------------------------------+      |
|  | Output Stream                                  |      |
|  | State vector, MisPlot frames, force/moment     |      |
|  | breakdown, performance metrics                 |      |
|  +-----------------------------------------------+      |
+---------------------------------------------------------+
```

CP is computed in real time from `CN` / `CM` rather than loaded from `cp_location.csv` (Phase 3 Q4).

### 3.6 Application Programming Interface

```cpp
#include <gnc-core/sim/Simulator.h>
#include <gnc-core/sim/RocketTemplate.h>
#include <gnc-core/sim/Environment.h>

auto tmpl = gnc::sim::RocketTemplate::load("rockets/BA/template.yaml");
auto env = gnc::sim::Environment{
    .atmosphere   = "ISA",
    .wind_profile = "dryden_moderate",
    .launch_site  = {33.620, 44.370, 50.0},
};

gnc::sim::Simulator sim{tmpl, env, /*engine=*/"high_fidelity",
                        /*integrator=*/"RK4", /*dt_s=*/0.001,
                        /*max_time_s=*/120.0};

sim.set_initial_conditions({.elevation_deg = 45.0,
                            .azimuth_deg   = 0.0,
                            .roll_rate_rad_s = 0.0});

sim.add_observer("telemetry_logger", /*rate_hz=*/50);
sim.add_observer("state_logger",     /*rate_hz=*/1000);

sim.schedule_fault({.t_s = 10.0, .name = "FIN_1_STUCK", .angle_deg = 5.0});

auto result = sim.run();
```

### 3.7 Actuator Model — Second-Order with Delay

#### 3.7.1 Mathematical Model

```math
\ddot{x} + 2\zeta\omega_n\dot{x} + \omega_n^2 x = \omega_n^2 \cdot u(t - \tau)
```

Discrete form (Euler, `dt` = simulation timestep):

```
ẋ[k+1] = ẋ[k] + dt · ( ωn² · u(t − τ) − 2 · ζ · ωn · ẋ[k] − ωn² · x[k] )
ẋ[k+1] = clip(ẋ[k+1], −rate_max, +rate_max)
x[k+1] = x[k] + dt · ẋ[k+1]
x[k+1] = clip(x[k+1], delta_min, delta_max)

# Pure time delay (shift register)
delayed_cmd = u[k − N_delay]
N_delay     = round(τ / dt)
```

#### 3.7.2 Limit Enforcement at the Boundary

Per loop cycle, the mixer enforces `min(rocket, actuator)` BEFORE the dynamics integrate. The full enforcement order is in §5.7.1.

#### 3.7.3 Default Parameters

`default_4020` matches the original `actuator2.py` for backward compatibility (`ωn = 2739`, `ζ = 0.0208`, `delay = 8 ms`, `rate_max = 75 °/s`, `delta = ±15°`). Production missions reference `XQ-4020` (`ωn = 2618`, `ζ = 0.7`, `delay = 5 ms`, `rate_max = 428 °/s`, `delta = ±30°`).

#### 3.7.4 Configuration Interfaces (gnc-core API)

```cpp
namespace gnc::actuator {

// One Config per concrete actuator type. Common limits live here; type-specific
// fields live in the concrete subclass's own struct (TVCConfig, ColdGasConfig, ...).
struct Config {
    double wn_rad_s         = 0.0;
    double zeta             = 0.0;
    double delay_s          = 0.0;
    double rate_max_rad_s   = 0.0;
    double delta_max_rad    = 0.0;
    double delta_min_rad    = 0.0;
    double deadband_rad     = 0.0;
    double backlash_rad     = 0.0;
};

// Multi-axis actuator interface. Concrete subclasses declare their axis count
// via axisCount(); callers pass exactly that many commands and read exactly
// that many states. step() is sample-tick-driven with dt fixed at the loop rate.
class IActuator {
public:
    virtual ~IActuator() = default;

    // axisCount(): 1 for FinActuator and RollCanardActuator; 2 for TVCActuator
    // (pitch and yaw); N for ColdGasThruster (one per thruster); N for
    // PulseActuator. HybridActuator returns the sum of its composed members.
    virtual std::size_t axisCount() const = 0;

    // Advance one tick. commands[i] is the demand for axis i (rad for continuous
    // actuators, dimensionless [0,1] for pulse / cold-gas). The returned span has
    // axisCount() elements and is valid until the next call to step() or reset().
    virtual std::span<const double> step(std::span<const double> commands) = 0;

    // Saturation flags per axis. A length-axisCount() span is returned.
    virtual std::span<const bool>  wasRateLimited()     const = 0;
    virtual std::span<const bool>  wasPositionLimited() const = 0;

    virtual void reset() = 0;
};

// Concrete actuator classes (one header per type, all under gnc-core/actuator/):
class FinActuator              : public IActuator { /* second_order_with_delay; 1-DOF */ };
class RollCanardActuator       : public IActuator { /* first_order;             1-DOF */ };
class TVCActuator              : public IActuator { /* second_order_with_delay; 2-DOF (pitch, yaw); cross-axis coupling */ };
class ColdGasThruster          : public IActuator { /* discrete pulse; pulse_min_us / pulse_max_us; recharge_time_s */ };
class HybridActuator           : public IActuator { /* composes two IActuators per stages[i].controller_type=hybrid */ };
class PulseActuator            : public IActuator { /* PWM-driven discrete actuator; generic */ };
class AerospikeActuatorStub    : public IActuator { /* fail-closed stub; refuses to step(); validator-rejected at C19 */ };

}  // namespace gnc::actuator
```

#### 3.7.5 Actuator Model Types

The actuator library supports the following `model_type` values, each backed by an `IActuator` subclass (§3.7.4):

| `model_type` | Subclass | Axes | Used by |
|--------------|----------|------|---------|
| `second_order_with_delay` | `FinActuator`, `TVCActuator` | 1 (fin) / 2 (TVC) | `controller_type: fins`, `tvc` |
| `first_order` | `RollCanardActuator` | 1 | `controller_type: roll_canards` |
| `ideal` | `FinActuator` (ideal mode) | 1 | Smoke tests |
| `electromechanical` | `FinActuator` (EM mode) | 1 | High-fidelity hinge-moment runs |
| `tvc_2dof` | `TVCActuator` | 2 (pitch, yaw) | `controller_type: tvc` |
| `cold_gas_pulse` | `ColdGasThruster` | N (one per thruster) | `controller_type: cold_gas` |
| `pulse_actuator` | `PulseActuator` | N | Generic PWM-driven discrete actuator |
| `hybrid` | `HybridActuator` | sum of composed members | `controller_type: hybrid` (composes two named actuator entries) |

Templates select via `actuator_library.yaml` `model_type` field; the simulator instantiates the matching `IActuator` subclass. Hinge-moment loading is a property of the EM mode of `FinActuator`. The `aerospike` controller type uses `AerospikeActuatorStub` (fail-closed; validator rejects at C19 while `implementation_status: stub`).

#### 3.7.6 Multi-axis and discrete actuator notes

**TVC.** The `TVCActuator` integrates the same second-order-with-delay model as `FinActuator` per axis, plus an optional cross-axis coupling matrix `[c_pp, c_py; c_yp, c_yy]` declared in `actuator_library.yaml: cross_coupling`. Default coupling is identity (no cross-talk).

**Cold gas.** The `ColdGasThruster` is discrete-pulse: it accepts a normalised demand in `[0, 1]` per thruster, schedules a pulse of `pulse_min_us …  pulse_max_us` per loop cycle proportional to demand, and is unavailable for `recharge_time_s` after each pulse. Demand below the minimum-pulse threshold is dropped (no pulse).

**Hybrid.** The `HybridActuator` composes two named entries from `actuator_library.yaml` (e.g. `default_4020` + `tvc_default`) and routes each command axis to the appropriate sub-actuator per the controller's allocation matrix. The composition is declared via `composition_refs: [<entry_a>, <entry_b>]`.

**Slosh (forward-compatibility).** When `propulsion.slosh_enabled: true` is declared in the template, the simulator instantiates a slosh dynamic model and adds the slosh-induced lateral force / moment at the CG offset. None of the currently shipped fixtures has `slosh_enabled: true`; the schema accepts the field for forward-compatibility with liquid-propellant rockets.

**Pulse.** `PulseActuator` is a generic PWM-driven discrete actuator (e.g. `cold_gas_pulse` is a specialised case). Demand is `[0, 1]`; the actuator emits a fixed-amplitude pulse per cycle proportional to demand, subject to `pulse_min_us` / `pulse_max_us`. Used for cold-gas, attitude-thrusters, separation pyros (when actively modulated).

### 3.8 Reference Validation Suite (Analytic + Ballistic)

Engine validation runs the following reference cases as automated regression tests in Tier 3 SIL:

| Case | Description | Expected accuracy |
|------|-------------|-------------------|
| 1 — Vacuum point-mass ballistic | Single point-mass, no atmosphere, no thrust, gravity-only; analytic parabola | Position error < 0.1 m at 100 s |
| 2 — ISA point-mass with quadratic drag | Constant `Cd`, ISA atmosphere, no thrust; analytic-exponential decay | Velocity error < 0.5 % |
| 3 — Vacuum boost-coast | Ideal rocket equation; Δv from `Isp · g0 · ln(m0/mf)` | Δv error < 0.1 % |
| 4 — Quaternion long integration | Constant body rate `[1, 0.5, −0.3]` rad/s for 60 s; analytic quaternion solution | Quaternion-norm drift < 1 e-6 |
| 5 — Asymmetric inertia free precession | Torque-free Euler with `Iyy ≠ Izz`; analytic solution exists for body axes | Body-rate match < 0.5 % over 30 s |
| 6 — Single-stage powered reference | Single-stage template with full thrust curve, target inside its envelope (BA fixture used for unit tests) | Within per-rocket Appendix C tolerances |
| 7 — Multi-stage with unpowered coast upper | Multi-stage template; one non-terminal stage powered, terminal stage `propulsion` block omitted (SA fixture used for unit tests) | Stage transition match within per-rocket Appendix C tolerances |
| 8 — Multi-stage with powered upper | Multi-stage template; both stages have thrust curves (GH fixture used for unit tests) | Stage transition match within per-rocket Appendix C tolerances |
| 9 — Variable-dim Reynolds interpolator | BA aero with full `Mach × α × Re` table | Coefficient interpolation error < 0.1 % vs ground truth |
| 10 — Saturation flag correctness | 85° launch profile that saturates fins | Columns 102/103 set exactly when fin output is at limit |

Cases 1–5 are analytic (closed-form ground truth); 6–10 are ballistic (against golden logs).

### 3.9 Flight Computer Performance Budget

#### 3.9.1 Path A — Snapdragon 845 (Samsung Galaxy Note 9 reference)

Reference device: Samsung Galaxy Note 9 (Phase 3.9 Q2). Path A flight enclosure uses passive cooling (Phase 3.9 Q6).

| Attribute | Value | Relevance |
|-----------|-------|-----------|
| CPU | 4 × Kryo 385 Gold (Cortex-A75) @ 2.8 GHz + 4 × Kryo 385 Silver (Cortex-A55) @ 1.8 GHz | big.LITTLE — pin flight loop to Gold cores |
| GPU | Adreno 630 | YOLOv8 inference when seeker enabled (default) |
| DSP | Hexagon 685 (HVX vector DSP) | Selectable seeker offload (CPU and GPU also selectable) |
| NPU | NPU offload not used | Seeker uses GPU / CPU / Hexagon per mission setting |
| Process | 10 nm (Samsung 10LPP) | Mature node; characterised thermal behaviour |
| TDP | ~9 W sustained | Cooling envelope is the binding constraint |
| GeekBench 5 | Single ~500, Multi ~2,000 | Headroom for ESKF + MHE + IMM at 100 Hz without seeker |

#### 3.9.2 Thermal Risk Analysis + Validation Checklist

The thermal envelope is the binding constraint. The pre-flight thermal-validation checklist (run on every flight device, every mission, owned by ME):

1. Device powered on for ≥ 10 min before take-off.
2. Background apps disabled; airplane mode + Wi-Fi off; only the GCS app foreground.
3. Flight-loop threads pinned to Gold performance cores via `sched_setaffinity` AND `sched_setattr` with `SCHED_FIFO` priority 80.
4. Burn-in: run the full mission profile (estimator + control + planned seeker rate) for 10 minutes; verify peak `T_cpu < 70 °C`.
5. Thermal monitoring channel `T_cpu` recorded at 1 Hz throughout the burn-in.
6. T_cpu telemetry channel verified end-to-end (Snapdragon → STM32L431 → radio → GCS).
7. Threshold response: at 75 °C the GCS displays a warning; at 85 °C the response is **reduce loop rate** (Path A Q4) — flight loop steps down by one supported tier (200 → 150 → 100 → 50 Hz). MHE remains active. The flight does not abort on thermal alone.
8. Active cooling is **not** used; the flight enclosure is passive only.
9. Hexagon 685 offload is not engaged for our purposes (Phase 3.9 Q5); the option remains in `mission.seeker.inference_target` for selectability.
10. Per-device validation is repeated when the device is replaced; the device serial number is recorded against the burn-in result.

#### 3.9.3 Loop-Rate Configuration (Path A)

Without seeker:

| Rate | Total budget / cycle | MHE feasibility | Thermal | Use |
|------|---------------------|-----------------|---------|-----|
| 50 Hz | 20 ms | Comfortable | Low | Low-acceleration, debugging |
| 100 Hz | 10 ms | Feasible | Medium | Default — validated for every committed rocket |
| 150 Hz | 6.7 ms | Tight (separate thread) | High | High-dynamics, validated per rocket |
| 200 Hz | 5 ms | Not feasible without offloading MHE | Very high | Specialty R&D only |

The 100 Hz default is empirically confirmed by the existing peripheral stack: the STM32F405 external-IMU bridge schedules at `HAL_Delay(10)` (= 100 Hz tick), produces one 17-byte UART frame per cycle for 1.7 kB/s aggregate UART load (well within the 38400 bps line rate — see §7.3.6), and the Android flight loop matches that cadence. Higher loop rates (150 / 200 Hz) are validated per device against the §3.9.2 thermal checklist and the §7.6 CAN bandwidth note.

#### 3.9.4 Loop-Rate + Seeker Feasibility

| Main loop | Seeker rate | MHE feasibility | Thermal | Notes |
|-----------|-------------|-----------------|---------|-------|
| 50 Hz | 15 Hz | Comfortable | Medium | Safe baseline for first seeker-enabled flight |
| 50 Hz | 30 Hz | Comfortable | High | Strapdown only |
| 100 Hz | 15 Hz | Feasible | High | Most rockets; reduce seeker outside terminal phase |
| 100 Hz | 30 Hz | Tight | Very high | Marginal; per-device thermal validation required |
| 150 Hz | 30 Hz | Difficult | Critical | Requires per-device thermal validation; throttling expected |
| 200 Hz | any | Not recommended | Critical | Only without seeker enabled |

#### 3.9.5 Path B — STM32H743 / STM32H753 Performance Budget

| Attribute | Value | Relevance |
|-----------|-------|-----------|
| CPU | Cortex-M7 @ 480 MHz, single + double FPU | Comfortable for ESKF + control + mixer at 200–500 Hz |
| Cache | L1 16 KB I + 16 KB D | Critical for deterministic timing |
| Flash / RAM | Up to 2 MB / 1 MB | Adequate for flight code; not for ML models |
| NPU / DSP | Not present | Seeker on Jetson Nano co-processor |
| IMU | Integrated on board | No external option |
| Power | < 1 W typical | Low thermal load; no active cooling |
| Toolchain | arm-none-eabi-gcc + STM32CubeMX + FreeRTOS | RTOS-based; deterministic |

Loop-rate target is user-configurable (Phase 3.9 Q9) inside 100–500 Hz. MHE on Cortex-M7 is user-selectable (Phase 3.9 Q10) — supported configurations: dropped (ESKF only), reduced (`N=5`, 5 Hz), or any user-set values within the path range; the system tests effects of all three (Phase 4 Q9).

STM32H743 is the primary variant; STM32H753 is the accepted alternate. The same FreeRTOS firmware runs on both; differences are at the HAL level only and are read from `hardware_mapping.yaml` field `flight_computer.variant`.

#### 3.9.5b Path B Flash / RAM Budget

`gnc-stm32` must fit comfortably inside the STM32H743's 2 MB Flash / 1 MB RAM. The day-1 budget is:

| Module | Flash (KB) | RAM (KB) | Notes |
|--------|------------|----------|-------|
| FreeRTOS kernel + drivers | 80 | 16 | Stack pools sized per task |
| `gnc-core` algorithms (estimation + control + mixer) | 320 | 64 | Includes ESKF, IMM mode set, all 12 controllers, all 7 actuators |
| Aero / thrust HDF5 in flash (per-mission) | 600 | 16 | Lazy-load by stage; one stage in RAM at a time |
| Mission file + template parsed structures | 60 | 32 | Locked at boot |
| HAL + peripheral drivers (CAN, UART, SPI, GPIO) | 120 | 24 | |
| Logging buffers + telemetry framers | 40 | 256 | Ring buffers for the 103-column flight log |
| MHE solver (acados) when enabled | 200 | 96 | Off by default |
| Reserve | 220 | 256 | Headroom; CI gate at 80 % occupation |
| **Total budgeted** | **1,640** | **760** | Inside 2,048 / 1,024 KB on H743 |
| **CI gate** | < 1,638 (80 %) | < 819 (80 %) | Tier 2 fails the build if exceeded |

The `arm-none-eabi-objdump` step in Tier 2 emits the per-section size; CI fails if `.text + .rodata + .data + .bss` exceeds 80 % of the variant's Flash / RAM. Templates that push the runtime beyond budget must reduce `coefficient_files` resolution or split per-stage into separate flash segments.

#### 3.9.6 External IMU Interface (Path A Optional)

When `hardware_mapping.flight_computer.external_imu_sku` is set, an Analog Devices ADIS16488 is wired to an STM32F405RGT6 @ 168 MHz, which bridges SPI to UART for the Android flight computer. The bridge runs no GNC code: it samples the sensor, packs a fixed-shape frame, and transmits at 100 Hz. Auto-detect by `PROD_ID` and the verification rule in Decision 11 decide whether the channel is fused.

| Parameter | Value |
|-----------|-------|
| Sensor part | Analog Devices ADIS16488 |
| Bridge MCU | STM32F405RGT6 @ 168 MHz |
| SPI link | SPI1 master, Mode 3 (CPOL = HIGH, CPHA = 2-Edge), 16-bit words, soft NSS, ~10.5 Mbit/s (APB2 / 8) |
| Pinout | PA5 SCK, PA6 MISO, PA7 MOSI, PA4 NSS (active-low) |
| Channels read per cycle | 7 — gyro X / Y / Z, accel X / Y / Z, alternating `PROD_ID` / `TEMP_OUT` |
| Scaling | accel 0.8 mg/LSB × 9.80665; gyro 0.02 °/s/LSB |
| Identification | Register `0x7E` returns `0x4068` — used by the Decision 11 auto-detect rule |
| Schedule | `HAL_Delay(10)` → 100 Hz pinned; USART1 + DMA2_Stream7 Ch4 emits one UART frame per cycle |
| UART carrier | 38400 bps 8N1 — USB-UART chip CH9102X (preferred) or FTDI FT232R (see §7.3.4) |

Pipelined SPI read sequence:

```c
spi_read(0x8000);                       // select page 0
spi_read(regs[0]);                      // kick the first register
for (i = 0; i < 6; ++i) {
    out[i] = spi_read(regs[i + 1]);     // pipelined reads
}
out[6] = spi_read(0x0000);              // dummy to clock out the last register
```

The 17-byte UART frame produced each cycle is defined in §7.3.6. The auto-detect step cooperates with Decision 11: presence is asserted by reading `PROD_ID` via the bridge and matching `0x4068`; absence is asserted by either no enumeration of the `EXT_IMU` USB role or a `PROD_ID` mismatch.

---

## Phase 4 — Estimation & Navigation — ESKF + Optional MHE + IMM

ESKF is the canonical primary estimator on both paths. MHE is opt-in. IMM activates only when `template.estimation.approach = imm`.

### 4.1 Architectural View

```
+----------------------------------------------------------+
|  Multi-Layer Estimation Architecture                      |
+----------------------------------------------------------+
|  Every layer below runs on the chosen flight computer.   |
|                                                           |
|  Layer 0: Legacy EKF 6-state (fallback inside gnc-core)  |
|  +--------------------------------------------+           |
|  | State: [r, v, φ, θ, φ̇, θ̇]                  |           |
|  | Local fallback if ESKF diverges             |           |
|  +--------------------------------------------+           |
|                       |                                   |
|                       v                                   |
|  Layer 1: ESKF 15-state (CANONICAL PRIMARY)               |
|  +--------------------------------------------+           |
|  | State: [r, v, q, b_a, b_g]                  |           |
|  | Always running on either path               |           |
|  +--------------------------------------------+           |
|                       |                                   |
|                       v                                   |
|  Layer 2: MHE 17-state (OPTIONAL refinement)             |
|  +--------------------------------------------+           |
|  | mission.mhe.enabled controls activation     |           |
|  | When ON, MHE output supersedes ESKF         |           |
|  | When OFF (default), ESKF is used            |           |
|  | Path A: N=10, 10 Hz default; Path B: N=5,5  |           |
|  | Solver: IPOPT (simulation), acados (flight) |           |
|  +--------------------------------------------+           |
|                       |                                   |
|                       v                                   |
|  Layer 3 (only when template.estimation.approach=imm)    |
|  +--------------------------------------------+           |
|  | Mode set: derived from template per         |           |
|  | gnc-core/estimation/IMMModeSet.h            |           |
|  | Per stage i: BOOST_Si if powered;           |           |
|  | COAST_Si always; SEP_i_to_i+1 if non-       |           |
|  | terminal; one TERMINAL on the last stage    |           |
|  | Transition probabilities: manual OR learned |           |
|  +--------------------------------------------+           |
|                                                           |
|  Fallback chain (when any layer fails):                   |
|    [MHE] + ESKF  →  ESKF only  →  Legacy EKF             |
|      →  Complementary  →  Dead Reckoning                  |
|  Same chain on both paths.                                |
+----------------------------------------------------------+
```

α and β are computed geometrically from the best-estimator state output (Phase 4 Q6).

#### 4.1.1 IMM mode-set derivation (template-driven)

The IMM filter's mode set is generated from the rocket template at filter-init, not hard-coded. For a template with `num_stages = N`:

```
modes = []
for i in 0 .. N-1:
    if stages[i].propulsion is present:
        modes.append("BOOST_S{i+1}")            # powered phase
    modes.append("COAST_S{i+1}")                # coast phase always present
    if not stages[i].is_terminal:
        modes.append("SEP_{i+1}_to_{i+2}")      # separation event
modes.append("TERMINAL")                        # one terminal mode for the last stage
```

Mode-transition probability matrix dimension is `len(modes) × len(modes)`. When `template.estimation.imm.transition_probabilities_source: manual`, the matrix is supplied explicitly; when `learned`, the matrix is initialised from a uniform diagonal-dominant prior and refined online.

`gnc-core/estimation/IMMModeSet.h` provides:

```cpp
namespace gnc::estimation {

struct IMMModeSet {
    std::vector<std::string> modes;
    Eigen::MatrixXd          transition_probabilities;  // len(modes) x len(modes)
};

IMMModeSet generate(const RocketTemplate&);
}  // namespace gnc::estimation
```

Examples:

- BA (single-stage powered): `["BOOST_S1", "COAST_S1", "TERMINAL"]` (3 modes).
- SA (two-stage, S2 unpowered coast): `["BOOST_S1", "COAST_S1", "SEP_1_to_2", "COAST_S2", "TERMINAL"]` (5 modes).
- GH (two-stage, both powered): `["BOOST_S1", "COAST_S1", "SEP_1_to_2", "BOOST_S2", "COAST_S2", "TERMINAL"]` (6 modes).

### 4.2 ESKF 15-state

#### 4.2.1 State Vector

```
x_nominal = [ r_n(3), v_n(3), q_b_n(4), b_a(3), b_g(3) ]   ∈ ℝ¹⁶

dx        = [ dr(3), dv(3), dθ(3), db_a(3), db_g(3) ]      ∈ ℝ¹⁵

x_true = x_nominal ⊕ dx
   r_true   = r_nominal + dr
   v_true   = v_nominal + dv
   q_true   = q_nominal ⊗ Exp(dθ/2)
   b_a_true = b_a_nominal + db_a
   b_g_true = b_g_nominal + db_g
```

#### 4.2.2 Prediction Step (every IMU sample)

```python
def predict(imu, dt):
    a_b = imu.accel - b_a_nominal
    w_b = imu.gyro  - b_g_nominal

    q_new = integrate_quaternion_rk4(q_nominal, w_b, dt)
    R_b_n = quat_to_rot(q_nominal)
    a_n   = R_b_n @ a_b + g_n               # g_n = [0, 0, -9.80665]
    v_new = v_nominal + a_n * dt
    r_new = r_nominal + v_nominal * dt + 0.5 * a_n * dt**2
    update_nominal(r_new, v_new, q_new)

    F = compute_error_state_jacobian(a_b, w_b, R_b_n, dt)
    G = compute_noise_jacobian(R_b_n, dt)
    P = F @ P @ F.T + G @ Q_imu @ G.T
```

#### 4.2.3 GPS Update (every 200 ms)

```python
def update_gps(z):
    H = [I3, 0, 0, 0, 0]
    y = z.pos_enu - r_nominal
    S = H @ P @ H.T + R_gps
    K = P @ H.T @ inv(S)
    dx = K @ y

    r_nominal += dx[0:3]
    v_nominal += dx[3:6]
    dtheta     = dx[6:9]
    q_nominal  = q_nominal ⊗ Exp(dtheta/2)
    q_nominal  = normalize(q_nominal)
    b_a_nominal += dx[9:12]
    b_g_nominal += dx[12:15]

    I_KH = I - K @ H
    P    = I_KH @ P @ I_KH.T + K @ R_gps @ K.T   # Joseph form
```

### 4.3 MHE 17-state (Solvers: IPOPT for simulation, acados for flight)

```
minimise     J(x_{k-N} … x_k, w_{k-N} … w_{k-1})
  x, w

J = ‖x_{k-N} − x̄_{k-N}‖²_{P⁻¹}                          # arrival cost
   + Σ_{i=k-N..k-1} ‖w_i‖²_{Q⁻¹}                          # process noise
   + Σ_{i=k-N..k}   ‖z_i − h(x_i)‖²_{R⁻¹}                # measurement residual

subject to:
  x_{i+1} = f(x_i, u_i) + w_i                              # 6-DOF dynamics
  h(x_i)[2] ≥ 0                                            # altitude ≥ 0
  ‖v_i‖    ≤ V_max(Mach_envelope)
  m_i      ≥ m_dry
  |α_i|    ≤ α_stall
  |β_i|    ≤ β_max
  δ_min ≤ δ_i ≤ δ_max
  ‖q_norm − 1‖ ≤ ε
```

The arrival cost's `P⁻¹` is the inverse of the ESKF's state covariance matrix at the same instant (Phase 4 Q4).

`IPOPT` is used inside the simulator via CasADi (Python and C++ harnesses). `acados` is used on the flight computer for SQP-fast solves at flight rates. The two paths share the same MHE formulation; only the solver differs.

#### MHE thread placement

On Path A, MHE runs on a separate thread with a lockless queue, lower priority than the 100 Hz flight loop. On Path B, MHE runs as a lower-priority FreeRTOS task (priority 5; flight loop at priority 9).

### 4.4 IMM for Multi-Stage Rockets

IMM activates when `template.estimation.approach = imm` and `num_stages > 1`. Six modes:

| Mode | Description | Dynamics | Parameters |
|------|-------------|----------|------------|
| B1: Boost Stage 1 | First motor burning | Thrust + Aero + decreasing mass | Stage 1 template |
| C1: Coast Stage 1 | Stage 1 after burnout | Aero + Ballistic | Stage 1 dry |
| SEP | Separation transient | Mixed, discontinuous | Transition model |
| B2: Boost Stage 2 | Stage 2 ignition | Thrust + Aero + decreasing mass | Stage 2 template |
| C2: Coast Stage 2 | Stage 2 after burnout (or unpowered upper stage's coast) | Aero + Ballistic | Stage 2 dry |
| T: Terminal | Terminal phase | Ballistic + Gravity | Dry mass only |

#### 4.4.1 Markov Transition Matrix

The transition matrix is either declared per template (`estimation.imm.transition_probabilities_source = manual`, with explicit values) OR learned from past flight data (`source = learned`). Both are supported (Phase 4 Q5). When `learned`, the system fits the matrix from the rocket's flight database after at least 3 flights and stores it as a versioned snapshot inside the template.

Default manual matrix:

```
π[i→j]    B1     C1     SEP    B2     C2     T
B1     [ 0.98   0.02   0.00   0.00   0.00   0.00 ]
C1     [ 0.00   0.94   0.06   0.00   0.00   0.00 ]
SEP    [ 0.00   0.00   0.40   0.60   0.00   0.00 ]
B2     [ 0.00   0.00   0.00   0.95   0.05   0.00 ]
C2     [ 0.00   0.00   0.00   0.00   0.88   0.12 ]
T      [ 0.00   0.00   0.00   0.00   0.00   1.00 ]
```

For unpowered upper-stage configurations (e.g. SA), the `B2` mode is omitted and `SEP → C2` directly.

#### 4.4.2 IMM Algorithm (four-step cycle)

```python
# Step 1 — Mixing
for j in range(N_MODES):
    c_j = sum(π[i][j] * μ[i] for i in range(N_MODES))
    x0_j = sum(π[i][j] * μ[i] / c_j * x[i] for i in range(N_MODES))
    P0_j = sum(π[i][j] * μ[i] / c_j *
               (P[i] + outer(x[i] - x0_j, x[i] - x0_j))
               for i in range(N_MODES))
    filters[j].set_state(x0_j, P0_j)

# Step 2 — Mode-conditioned filtering
for j in range(N_MODES):
    filters[j].predict(imu, dt)
    λ[j] = filters[j].update_and_get_likelihood(z)

# Step 3 — Mode probability update
for j in range(N_MODES):
    c_j = sum(π[i][j] * μ_prev[i] for i in range(N_MODES))
    μ[j] = λ[j] * c_j
μ = μ / sum(μ)

# Step 4 — Combined estimate
x_final = sum(μ[j] * x[j] for j in range(N_MODES))
P_final = sum(μ[j] * (P[j] + outer(x[j] - x_final, x[j] - x_final))
              for j in range(N_MODES))

current_mode = argmax(μ)
```

### 4.5 Fusion Arbitrator

```cpp
namespace gnc::estimation {

class FusionArbitrator {
public:
    State fuse(const Mission& mission, const Template& tmpl) {
        // ESKF always primary
        State x_eskf = eskf_.get_state();

        // IMM only when configured for it
        State x_primary = (tmpl.estimation.approach == "imm" && tmpl.num_stages > 1)
            ? imm_.get_combined_estimate()
            : x_eskf;

        // MHE refinement (opt-in)
        if (mission.mhe.enabled && mhe_ready_ && mhe_.converged()) {
            State x_mhe = mhe_.get_state();
            double w_mhe = compute_mhe_trust();
            return blend(x_primary, x_mhe, w_mhe);
        }
        return x_primary;
    }

    void inject_mhe_correction() {
        if (!mhe_.converged()) return;
        if (now() - last_inject_ < 1s) return;

        State x_mhe   = mhe_.get_state();
        Cov   P_mhe   = mhe_.get_covariance();

        eskf_.set_state(x_mhe);
        eskf_.set_covariance(P_mhe);

        if (use_imm_) {
            int active = imm_.get_most_likely_mode();
            imm_.get_filter(active).set_state(x_mhe);
        }
        last_inject_ = now();
    }
};

}  // namespace gnc::estimation
```

### 4.6 Multi-Level Fallback

| Level | Used layer | When reached | Performance |
|-------|------------|--------------|-------------|
| 0 (ideal) | ESKF + MHE + IMM (all enabled) | Multi-stage, MHE on, all converged | Highest accuracy |
| 1 | ESKF + MHE (no IMM) | Single-stage with MHE on | High |
| 2 | ESKF + IMM (no MHE) | Multi-stage; MHE off / timed-out | High |
| 3 (default) | ESKF only | Single-stage, MHE off | Good |
| 4 | EKF 6-state (legacy) | ESKF diverges | Basic |
| 5 | Complementary filter | All Kalman filters fail | Minimum |
| 6 (emergency) | Dead reckoning via IMU | No GPS, no feedback | Rapid degradation |

Fallback testing in SIL injects filter divergence (Phase 4 Q7). Each level has its own SIL test in Tier 3.

### 4.7 Tuning Workflow (Manual + Bayesian Auto-Tune)

Both manual and Bayesian auto-tune are supported (Phase 4 Q1).

- **Manual.** Q and R matrices set per template via `template.estimation.eskf.{Q, R}` and `template.estimation.mhe.{Q, R}`. The S8 Control Design Lab provides a tuning grid.
- **Bayesian auto-tune.** `gnc-tools/bayesian_eskf_autotune.py` runs against a configured Monte Carlo set; objective minimises position RMS subject to attitude RMS bound; budget is 100 evaluations by default; output is a tuned `Q`, `R` written back to the template after engineer review.

### 4.8 MHE Budget Overrun Handling (Three User-Selectable Modes)

When MHE solve time exceeds the per-cycle budget (e.g. 150 ms at 100 Hz on Path A; 250 ms at 5 Hz on Path B), the system switches to the operator-selected mode (Phase 4 Q9). All three modes are supported as options for testing effects per mission:

| Mode | Behaviour |
|------|-----------|
| `skip` | The current MHE cycle is skipped; ESKF carries the state until next MHE solve. |
| `reduce_horizon` | Horizon is halved for the next 10 cycles, then restored. |
| `reduce_trust` | MHE blending weight reduced by 50 % for the next 10 cycles, then restored. |

Selection is per mission via `mission.mhe.budget_overrun_mode`.

---

## Phase 5 — Control System & Fin Allocation

### 5.1 Hierarchical Control Structure

```
+-------------------------------------------------------+
|  Outer Loop: Guidance (5–20 Hz)                        |
|  Input:  target position, current state                 |
|  Output: desired pitch / yaw angles                     |
+--------------------|----------------------------------+
                     v
+-------------------------------------------------------+
|  Middle Loop: Attitude Control (50–100 Hz)             |
|  Input:  desired attitude, current attitude             |
|  Output: desired angular rates                          |
+--------------------|----------------------------------+
                     v
+-------------------------------------------------------+
|  Inner Loop: Rate Control (100–500 Hz)                 |
|  Input:  desired rates, measured rates                  |
|  Output: u_pitch, u_yaw, u_roll                        |
+--------------------|----------------------------------+
                     v
+-------------------------------------------------------+
|  Control Mixer (Allocation)                            |
|  Input:  u_pitch, u_yaw, u_roll                        |
|  Output: δ_1, δ_2, ..., δ_n                            |
+--------------------|----------------------------------+
                     v
+-------------------------------------------------------+
|  CAN Driver -> XQPOWER Servos                          |
+-------------------------------------------------------+
```

The mixer enforces actuator limits at the boundary every cycle and writes saturation flags to log columns 102–103. Saturation events feed back to the autopilot on the next cycle (§5.7).

### 5.2 Control Algorithm Library (All Algorithms)

The library ships every algorithm below. Per-rocket, per-flight-phase selection is via `controller_library.yaml` referenced from `template.stages[].controller_ref`. The mission file does not redeclare which algorithm to use; the template is the source of truth (Phase 5 Q1).

| Algorithm | Type | Parameters | Notes |
|-----------|------|------------|-------|
| `pid` | Classical | `Kp`, `Ki`, `Kd` | Baseline |
| `pid_anti_windup` | Classical+ | `Kp`, `Ki`, `Kd`, `Kaw` | Integrator clamp / back-calculation |
| `pid_gain_scheduling` | Classical+ | `Kp(M, h)`, `Ki(M, h)`, `Kd(M, h)` | See §5.4 |
| `lqr` | Optimal | `Q`, `R` | State feedback |
| `lqg` | Optimal+ | `Q`, `R`, `Q_n`, `R_n` | LQR + Kalman observer |
| `h_infinity` | Robust | `γ` | Mixed-sensitivity synthesis |
| `sliding_mode` | Nonlinear | `λ`, `η` | Boundary-layer chattering control |
| `backstepping` | Nonlinear | `k_i` per cascade | Multi-loop cascade |
| `mpc_linear` | Predictive | horizon, weights | Linear constraints, QP solver |
| `mpc_nonlinear` | Predictive | full NLP | CasADi + IPOPT (sim) / acados (flight) |
| `mrac` | Adaptive | `Γ`, `θ` | Model-reference adaptive |
| `l1_adaptive` | Adaptive+ | `Γ`, `L1` structure | L1 adaptive control |

`controller_library.yaml` declares one or more named entries per controller type with its full parameter set. See `schemas/controller_library.schema.yaml` for the schema. Templates may also declare gain-schedule tables per stage per flight phase. PID anti-windup uses integrator-freeze on saturation (Decision 14).

Existing `PILOT.cpp` and `GUIDANCE.cpp` are reference for physics validation only; v5.2 algorithms are rewritten in `gnc-core/control/` (Phase 5 Q5).

### 5.3 Control Mixer / Allocation

#### 5.3.1 General case

```
[δ_1, δ_2, ..., δ_n]ᵀ = M_mix · [u_pitch, u_yaw, u_roll]ᵀ

# n = number of fins (or actuator channels for non-fin types)
# Standard rocket (4 fins):    M_mix is 4 × 3
# GH stage 1 (8 fins):          M_mix is 8 × 3 (over-actuated)
# SA stage 1 (12 fins):         M_mix is 12 × 3 (super over-actuated)
```

#### 5.3.2 Allocation Algorithms per Controller Type (Phase 5 Q3)

Each controller type has its own allocation algorithm declared in `gnc-core/mixer/`:

| Controller type | Allocation algorithm | Justification |
|-----------------|-----------------------|---------------|
| `fins` | Pseudo-inverse for square cases; Weighted Least Squares (`δ = W⁻¹ Bᵀ (B W⁻¹ Bᵀ)⁻¹ u`) for over-actuated cases | Handles 4-fin to 12-fin from a single algorithm class; weights tunable per finset; closed-form solution |
| `tvc` | Direct map + saturation projection | TVC has a one-to-one map from `[u_pitch, u_yaw]` to gimbal angles; saturation handled by projecting onto the achievable set |
| `hybrid` (fins + TVC) | Blended Weighted Least Squares with priority weights | Fins and TVC have different bandwidths and authorities; priority weights expose the trade-off; same WLS solver as `fins` extended over the joint actuator vector |
| `roll_canards` | Dedicated roll-only mixer | Roll canards only contribute to roll moment; mapping is `δ_canard = K_roll · u_roll`; pitch / yaw axes ignored |
| `cold_gas` | On-off bang-bang with pulse-width modulation allocation | Cold-gas thrusters are binary; PWM duty cycle approximates analogue moment via timed pulses; per-thruster scheduler runs ahead of the flight loop |
| `aerospike` | Continuous TVC with thrust-vectoring jacobian | Aerospike supports continuous gimbal; allocation is a thrust-vectoring jacobian linearised about current operating point; saturation projection identical to TVC |

All seven mixers ship from day 1: `FinMixer` (Pseudo-inverse / Weighted LS), `NoMixer`, `TVCMixer`, `HybridMixer`, `RollCanardMixer`, `ColdGasMixer`, and `AerospikeMixer`. The aerospike implementation is the fail-closed stub described under Decision 16 / clause C19; the rest are full implementations. All mixers implement `IMixer`:

```cpp
namespace gnc::mixer {

class IMixer {
public:
    struct Result {
        Eigen::VectorXd delta_cmd;       // raw demand from the algorithm
        Eigen::VectorXd delta_clipped;   // after rocket+actuator boundary
        std::uint16_t   rate_limited_mask;    // bit i = fin (i+1)
        std::uint16_t   pos_limited_mask;
    };
    virtual ~IMixer() = default;
    virtual Result allocate(const Eigen::Vector3d& u_pyr,
                            const ActuatorState& acts,
                            const RocketLimits& rocket) = 0;
};

class FinMixer        : public IMixer { /* … */ };
class TVCMixer        : public IMixer { /* … */ };
class HybridMixer     : public IMixer { /* … */ };
class RollCanardMixer : public IMixer { /* … */ };
class ColdGasMixer    : public IMixer { /* … */ };
class AerospikeMixer  : public IMixer { /* … */ };
class NoMixer         : public IMixer { /* … */ };

}  // namespace gnc::mixer
```

Worked-out matrices for the reference test fixtures (Appendix A.4) are illustrative:

```
# BA (canard, 4 fins, X-config) — sign inverted because canards
# produce moment opposite to their force
M_BA = -1 * [ +sin45  +sin45  +1
              +sin45  -sin45  +1
              -sin45  -sin45  +1
              -sin45  +sin45  +1 ]

# ES_273 (tail, 4 fins, X-config)
M_ES273 = [ +sin45  +sin45  +1
            +sin45  -sin45  +1
            -sin45  -sin45  +1
            -sin45  +sin45  +1 ]

# GH stage 1 (8 fins = 2 FINSETs × 4): FINSET1 30 %, FINSET2 70 %
# Both contribute equally to roll. Weights derived from
# d Cm / d δ per FINSET.

# SA stage 1 (12 fins = 3 FINSETs × 4): heavily over-actuated.
# Solved with Weighted LS using diag([w_1, …, w_12]).
```

### 5.4 Gain Scheduling (Linear Interior, Cubic at Boundaries)

Inside the operating envelope, gain scheduling uses linear interpolation between operating points. At the envelope boundary, cubic interpolation is used to avoid discontinuities in the gain derivative. This is the linear-with-cubic-boundaries scheme from Phase 5 Q2.

Operating points are declared per stage in `controller_library.yaml`:

```yaml
controllers:
  BA_pid_gainsched:
    type: pid_gain_scheduling
    operating_points:
      - { mach: 0.3,  altitude_m: 0,     Kp: 1.5,  Ki: 0.10, Kd: 0.20 }
      - { mach: 0.8,  altitude_m: 1000,  Kp: 1.4,  Ki: 0.08, Kd: 0.22 }
      - { mach: 2.0,  altitude_m: 5000,  Kp: 1.2,  Ki: 0.06, Kd: 0.25 }
      - { mach: 4.0,  altitude_m: 10000, Kp: 1.0,  Ki: 0.04, Kd: 0.28 }
      - { mach: 5.0,  altitude_m: 15000, Kp: 0.9,  Ki: 0.03, Kd: 0.30 }
```

The interpolator (`gnc-core/control/GainScheduler.h`) reads the operating-point set, picks the surrounding cell at runtime, applies linear interpolation if all corners are inside the envelope, and applies cubic blending on the four cells touching the envelope edge.

### 5.5 Auto-Tuning

| Algorithm | Speed | Quality | Use case |
|-----------|-------|---------|----------|
| Genetic Algorithm | Slow | High (global) | Multi-parameter tuning |
| Particle Swarm (PSO) | Medium | High | Default case |
| Bayesian Optimisation | Fast | High | Few-evaluation budget |
| CMA-ES | Medium | Very high | Large continuous space |
| Grid Search | Slow | Reference | Comparison only |
| Gradient-based (L-BFGS) | Fast | Local | Refinement after GA / PSO |

Auto-tuning cost function is editable per rocket in S8:

```
J = w_1 · t_settling
  + w_2 · OS%
  + w_3 · (1 / GainMargin)
  + w_4 · IAE
  + w_5 · ∫ u² dt
  + w_6 · peak_u
  + w_7 · noise_sensitivity
```

Verification tests for a new control design are user-decided per rocket (Phase 5 Q4); the system supports step response, frequency response, Bode / Nyquist / root locus and disturbance rejection out of the box.

### 5.6 Servo Load Check

Pre-flight, expected hinge torque per servo is computed from the planned trajectory and compared against the servo's maximum continuous torque with an 80 % safety margin. Any servo whose required torque exceeds the limit produces a pre-launch FAIL:

```python
def preflight_servo_load_check(profile, template):
    SAFETY_MARGIN = 0.80
    for fin_id in range(n_fins):
        max_load = 0.0
        for t in profile.time_array:
            mach   = profile.mach[t]
            alpha  = profile.alpha[t]
            delta  = profile.delta[fin_id][t]
            h      = profile.altitude[t]
            v      = profile.velocity[t]
            rho    = atmosphere_density(h)
            q_dyn  = 0.5 * rho * v**2
            Ch     = template.interp_hinge(mach, alpha, delta)
            hinge  = Ch * q_dyn * S_ref * L_ref
            torque = abs(hinge / gear_ratio)
            max_load = max(max_load, torque)

        capacity = get_servo(fin_id).max_torque * SAFETY_MARGIN
        if max_load > capacity:
            raise PreflightError(
                f"Servo {fin_id}: {max_load:.1f} N·m > {capacity:.1f} N·m")
```

### 5.7 Actuator Limit Enforcement at the Mixer Boundary

#### 5.7.1 Enforcement order (per loop cycle)

```
1. Mixer computes δ_cmd[1..N] from desired moments
   [δ_cmd_1, ..., δ_cmd_N]ᵀ = M_mix · [u_pitch, u_yaw, u_roll]ᵀ

2. Apply rocket-level position clip
   δ_cmd_i ← clip(δ_cmd_i, rocket.delta_min, rocket.delta_max)

3. Apply actuator-level position clip
   δ_cmd_i ← clip(δ_cmd_i, actuator.delta_min, actuator.delta_max)

4. Pass through the actuator instance (any of the four model types)
   δ_actual_i, δ̇_actual_i = actuator_i.step(δ_cmd_i, dt)
   rate_limited_i ← actuator_i.wasRateLimited()
   pos_limited_i  ← actuator_i.wasPositionLimited()

5. Pack saturation flags
   fin_rate_limited_flag   = Σ rate_limited_i << (i-1)
   fin_position_limited_flag = Σ pos_limited_i << (i-1)

6. Write δ_actual_i to flight log columns 57–64 (101-column schema)
   Write fin_rate_limited_flag to column 102
   Write fin_position_limited_flag to column 103

7. Next loop — feedback to mixer:
   if any saturation flag set on previous cycle:
       Strategy B (default): scale all fin demands by k = lim/max so largest is at limit
       OR Strategy "redistribute" (over-actuated airframes)
       OR Strategy "demand reduction at upstream"
       (selection per mission)
```

#### 5.7.2 Saturation Feedback Strategy

| Strategy | Description | Use case |
|----------|-------------|----------|
| Uniform scale-down (Strategy B; default) | All fin commands scaled by same factor < 1 until none saturated. Preserves moment direction; loses moment magnitude. | Default |
| Redistribute | For 8 / 12-fin rockets: shift load to non-saturated fins. Maintains moment magnitude. | Over-actuated airframes |
| Demand reduction at upstream | Autopilot lowers upstream pitch / yaw demand by the saturation percentage. | User-selectable per mission |

Selection is per mission via `mission.stages[].abort_policy.saturation_strategy`. PID anti-windup uses integrator-freeze on saturation per axis (Decision 14).

#### 5.7.3 Saturation watchdog

A sustained-saturation watchdog increments a counter each cycle the saturation flag is set; resets when clear. Threshold is 50 cycles (= 0.5 s at 100 Hz; tunable on HIL bench). When threshold exceeded, the system asserts an abort signal. The watchdog runs alongside the configurable `recurring_saturation` abort criteria (Phase 5 Q10):

| Criterion | Default |
|-----------|---------|
| `cruise_percent_threshold` | 0.05 (= 5 % of cruise samples) |
| `continuous_block_ms` | 100 ms continuous saturation |
| `mode` | `cruise_percent`, `continuous_block`, or `both` (any one breach triggers) |

The user chooses the mode per mission (Phase 5 Q10). All fields are editable in the mission file under `mission.stages[i].abort_policy.recurring_saturation`.

### 5.8 Saturation Feedback Strategy Summary (defaults vs options)

Default is uniform scale-down (Strategy B). The user may select redistribute or demand-reduction at any time via mission-file fields; the same code paths exist in `gnc-core/mixer/`.

### 5.9 Servo Failure Detection

Detected by combining three signals (Phase 5 Q6):

| Signal | Threshold | Action |
|--------|-----------|--------|
| Current spike | > 2 × nominal continuous current for > 50 ms | Mark fin failed |
| No response | Position feedback unchanged > 200 ms after non-zero command (delta > 0.5°) | Mark fin failed |
| Position error | `|cmd − measured|` > 5° for > 100 ms | Mark fin failed |
| Low-voltage auto-report | Auto-report CAN frame on `0x380 + NodeID`, payload `[0x0A, 0x02, ...]` (~70 % rated voltage) | Mark fin failed; abort per `mission.abort_policy.servo_undervoltage` |
| Servo temperature | Periodic SDO read of index `0x5600` @ 1 Hz | Warn > 70 °C; mark fin failed > 85 °C |

Low-voltage auto-reports require the Low-voltage en command (§7.3.2) to be issued at boot; the temperature read uses the Read current + temperature command (same table).

Once marked failed, the mixer redistributes (over-actuated airframes) or commands a soft-fail back to the autopilot (single-actuator-per-axis airframes), which signals abort per the per-mission abort policy.

---

## Phase 5b — Optional Seeker Subsystem

The seeker is optional and configurable per mission. Each rocket template declares per-stage `seeker_capable`. When `mission.seeker.enabled = false` (the default), the seeker module is not instantiated and the rest of the flight loop has no knowledge of it.

### 5b.1 Role in the GNC Stack

The seeker is a sensor, not a controller. It produces three outputs that feed Guidance:

| Output | Units | Rate | Use |
|--------|-------|------|-----|
| LOS angle σ (azimuth, elevation) | rad | 30 Hz | Input to PN guidance law |
| LOS rate σ̇ (azimuth, elevation) | rad/s | 30 Hz | Dominant term: `a_cmd ∝ N · V_c · σ̇` |
| Target-lock flag + quality | bool, 0..1 | 30 Hz | Gate on terminal-homing engagement |

#### 5b.1.1 Data flow when `seeker.enabled = true`

```
+--------+ camera @ 30 Hz +----------+
| Camera |--------------->| Seeker   |
+--------+                | Module   |
                          |          |   σ, σ̇, lock, q
+--------+ attitude q     |          |---------------------> +-----------+
| ESKF   |--------------->|          |                       | Guidance  |
+--------+                +----------+                       | (PN if    |
                                                              |  lock=true)|
                                                              +-----+-----+
                                                                    |  acc cmd
                                                                    v
                                                              +-----------+
                                                              | Control + |
                                                              | Mixer     |
                                                              +-----------+
```

When `seeker.enabled = false`, the camera and seeker module are not instantiated; ESKF state feeds Guidance (waypoint / trajectory) directly.

### 5b.2 Strapdown and Gimbaled Modes (User-Selectable)

Both modes are supported (Phase 5b Q2). Selection in `mission.seeker.mode`:

| Aspect | `strapdown` | `gimbaled` |
|--------|------------|------------|
| Camera mount | Fixed to airframe | 2-axis gimbal (pitch + yaw servos) |
| FOV pointing | Whole rocket points at target | Gimbal points camera; rocket free in attitude |
| Hardware | Camera + mount only | Camera + 2 servos + gimbal mechanism |
| CAN nodes | None additional | +2 servo nodes (e.g. `0x2D`, `0x2E`) per the same `0x25 + 12·stage + idx` rule |
| Control demand | Autopilot must steer to keep target in FOV | Gimbal tracks target; rocket attitude can lag |
| Typical FOV | 30°–45° horizontal | 20°–30° (narrower, higher resolution) |
| Loss-of-lock risk | High | Lower |
| Best for | High-Mach straight-line | Terminal manoeuvring, crossing targets |

### 5b.3 Starting Codebase (CarTracking4 — merged into OC Engine repo)

CarTracking4 is forked and merged into the main repository as the seeker module (Phase 5b Q3). Concrete component reuse:

| Component | Reuse plan |
|-----------|------------|
| `MainActivity.kt` | UI pieces kept; flight-mode entry refactored |
| `CameraHelper.kt` | Reused for built-in and external USB cameras |
| `YoloDetector.kt` | TFLite YOLOv8 inference; pre-flight model selection |
| `OverlayView.kt` | Bounding-box + reticle overlay |
| `ScreenCaptureService.kt` | Kept for testing; not used in flight |
| `SerialHelper.kt` | Retargeted to STM32 peripheral bus |
| `Yolo-v8-Detection.tflite` | Default detector model; template can override |
| `TR_P3b.tflite` | Default tracker (SiamFC-class); template can override |
| `labels*.txt` | COCO labels; template declares `target_class` by name |

**Detector / tracker model build chain.** The detector model `yolov8n.tflite` is produced by exporting the upstream YOLOv8n PyTorch checkpoint through `torch → ONNX → TFLite`, then INT8-quantising against a fixed 20-image representative dataset (`calibration_image_sample_data_20x128x128x3_float32.npy`, shape 20 × 128 × 128 × 3 float32). The tracker `TR_P3b.tflite` (~14 MB) is exported separately. Build scripts and the calibration dataset live next to the CarTracking4 reuse code under `gnc-android/seeker/tools/`; build outputs land in `gnc-android/seeker/models/` and are referenced from `mission.seeker.detector_model` / `mission.seeker.tracker_model`.

Additions on top of CarTracking4:

- LOS computation from pixel coordinates using camera intrinsics (pinhole model).
- Camera → body frame transform from template extrinsics.
- For `gimbaled` mode: body → inertial transform using gimbal angles.
- LOS-rate computation (selectable algorithm — see §5b.7).
- Target-lock confidence combining detector score, tracker consistency, frame-to-frame smoothness.
- Loss-of-lock handling with `K`-frame hysteresis.

### 5b.4 Integration Contract (`ISeeker`)

`gnc-core/hal/ISeeker.h` is the stable contract used by both paths:

```cpp
namespace gnc::seeker {

struct SeekerOutput {
    // LOS frame: NED (inertial). Strapdown writes directly; gimbaled converts
    // camera-frame LOS via gimbal angles + body attitude (q_b_n) from ESKF.
    double sigma_az_n;      // LOS angle, azimuth in NED   [rad]
    double sigma_el_n;      // LOS angle, elevation in NED [rad]
    double sigma_dot_az_n;  // LOS rate, azimuth in NED    [rad/s]
    double sigma_dot_el_n;  // LOS rate, elevation in NED  [rad/s]
    double quality;         // 0..1
    bool   lock;
    std::uint64_t t_ns;     // monotonic timestamp (CLOCK_MONOTONIC, ns)
};

struct SeekerConfig {
    std::string mode;                   // "strapdown" | "gimbaled"
    std::string camera_id;              // "builtin" | "usb:VID:PID" | "csi:0"
    std::string detector_model;
    std::string tracker_model;
    std::string target_class;
    std::array<double, 2> fov_deg;      // [horizontal, vertical]
    std::string mount_isolation;        // rigid|rubber|gel|gimbal_2axis
    std::string los_rate_method;        // savitzky_golay|first_order|state_observer
    std::string pn_variant;             // pure|true|augmented
    double      pn_gain_N;
    double      terminal_handoff_altitude_m;
    std::string loss_of_lock_policy;
    std::string inference_target;       // gpu|cpu|hexagon (Path A only)
    std::array<double, 9> camera_to_body_R;
    std::array<double, 4> intrinsics;   // [fx, fy, cx, cy]
};

class ISeeker {
public:
    virtual ~ISeeker() = default;
    virtual std::optional<SeekerOutput> poll() = 0;
    virtual void update_attitude(const Quaternion& q_body_to_inertial) = 0;
    virtual void stop() = 0;
};

}  // namespace gnc::seeker
```

The guidance-side glue:

```cpp
auto so = (seeker && seeker->poll().has_value()) ? *seeker->poll() : SeekerOutput{};

GuidanceMode mode = decide_mode(eskf_state, so, mission_config);
// Returns WAYPOINT, TRAJECTORY, TERMINAL_HOMING, or LOSS_OF_LOCK.
// TERMINAL_HOMING requires:
//   seeker enabled in template AND
//   so.lock == true AND
//   so.quality > threshold AND
//   for >= K consecutive frames AND
//   altitude < terminal_handoff_altitude_m

switch (mode) {
case WAYPOINT:        acc_cmd = waypoint_guidance(eskf_state); break;
case TRAJECTORY:      acc_cmd = trajectory_guidance(eskf_state); break;
case TERMINAL_HOMING: acc_cmd = proportional_nav(so, eskf_state, pn_variant, N); break;
case LOSS_OF_LOCK:    acc_cmd = handle_loss(loss_policy, eskf_state); break;
}
```

### 5b.5 Thermal and Performance Impact

Adding the seeker to an already-loaded flight computer is a meaningful change. The combined load (flight loop + estimator + seeker) approaches the Snapdragon 845 sustained thermal ceiling within 30–60 s on Path A. Mitigations are listed in §3.9.2 and the loop-rate / seeker-rate feasibility table in §3.9.4.

On Path B, the seeker runs on a separate Jetson Nano co-processor (Decision 5; Phase 5b Q9), and the STM32H7xx flight computer is unaffected by the seeker's thermal load.

### 5b.6 Hardware and Camera Options (All Supported)

The system supports the camera options below; the operator selects per mission via `mission.seeker.camera_id` plus FOV bounds and mount isolation (Phase 5b Q5):

| Option | When |
|--------|------|
| Built-in tablet camera | Bring-up, strapdown, short-range targets |
| External USB camera + fixed optics | Medium-range strapdown |
| External USB camera on 2-axis gimbal | Terminal manoeuvring, crossing, long engagement |
| Thermal IR camera | Night / low-light (template provides matched detector model) |
| CSI camera (Path B Jetson) | High-bandwidth on co-processor |

`fov_deg` and `mount_isolation` are user-set per mission. Camera-to-body extrinsic calibration (rotation matrix) is part of the rocket template; the calibration procedure uses a checkerboard captured with `CameraHelper.kt`.

### 5b.7 LOS Rate Extraction (All Three Methods Supported)

The system supports three methods (Phase 5b Q6); the operator selects per mission via `mission.seeker.los_rate_method`:

| Method | Description |
|--------|-------------|
| `savitzky_golay` | Polynomial smoothing differentiator; window 7–11 frames; order 3 |
| `first_order` | First-order numerical derivative with low-pass filter (cut-off configurable) |
| `state_observer` | LOS rate estimated by a state observer over LOS angle |

Implementations live in `gnc-core/seeker/los_rate/`. Noise floor is validated per HIL camera (Phase 5b Q6).

### 5b.8 Loss-of-Lock Policy (Default `revert_trajectory`)

The system-wide default is `revert_trajectory` (safest; Phase 5b Q7). Templates and missions can override:

| Policy | Behaviour |
|--------|-----------|
| `revert_trajectory` (default) | Switch back to trajectory guidance using last-known target position as waypoint |
| `continue_PN` | Continue with last valid LOS rate for up to `T_continue_PN_s` (default 1.0); then revert |
| `abort` | Abort the flight per Phase 12 abort procedure |
| `operator_prompt` | Notify GCS, continue on trajectory, wait for operator command |

The `K`-frame hysteresis applied to lock acquisition / loss is `K_lock_frames = 5` (configurable per mission).

### 5b.9 Proportional Navigation Variants (All Supported)

All three PN variants are supported (Phase 5b Q4); operator selects per mission via `mission.seeker.pn_variant`:

| Variant | Acceleration command |
|---------|----------------------|
| `pure` | `a_cmd = N · V_m · σ̇` (uses missile speed) |
| `true` | `a_cmd = N · V_c · σ̇` (uses closing speed) |
| `augmented` | `a_cmd = N · V_c · σ̇ + 0.5 · N · a_target_perp` (adds estimated target acceleration) |

`pn_gain_N` is template-configurable (Phase 5b Q4); typical range 3–5.

### 5b.10 Path A Inference Acceleration (GPU Default; CPU and Hexagon Selectable)

Default is GPU on Adreno 630. Operator selects per mission via `mission.seeker.inference_target`:

| Target | Notes |
|--------|-------|
| `gpu` (default) | Adreno 630; sustained 25–40 ms / frame for YOLOv8n INT8 @ 640 × 640 |
| `cpu` | Cortex-A75 fallback; 50–80 ms / frame |
| `hexagon` | Hexagon 685 HVX vector DSP; reserved for matrix ops and FFT-style offload; selected explicitly when validated for the chosen detector model |

Per-device sustained inference rate is measured in the burn-in (Phase 5b Q8) and recorded against the device serial number.

### 5b.11 Path B Co-processor — Jetson Nano

Path B uses Jetson Nano (Phase 5b Q9 / Phase 1 Q4) as the seeker co-processor. The CarTracking4 fork runs on Linux on the Jetson; LOS angles and rates are sent to STM32H7xx over UART (default 921600 bps) or CAN (selectable). Power, weight and integration are accepted at the Jetson Nano's specifications.

### 5b.12 Test Strategy

Three test stages:

- **SIL with photorealistic imagery (Phase 5b Q10).** The simulation engine produces frames using a 3D engine (Unity or Unreal); the seeker module ingests them as if they were real. Validates detector behaviour under simulated range, aspect, motion blur; tracker stability; LOS-rate accuracy vs analytic ground truth; guidance-law behaviour; loss-of-lock policy.
- **HIL with real camera, simulated world.** The flight tablet runs the seeker against a large screen / projector showing simulated imagery driven by the HIL host. Validates end-to-end pipeline on real hardware, thermal behaviour, USB / camera frame-rate stability, timing alignment.
- **Ground field trial.** Real target on the launch range, non-firing rocket on a pan-tilt fixture; record LOS angles and verify against survey measurements.

The platform commits to supporting the seeker as an option from day 1; seeker-enabled validation flights are not part of platform acceptance (Phase 5b Q11). The operational team selects which committed rockets fly with seeker per release.

---

## Phase 6 — User Interface and Experience

### 6.1 UI Design Philosophy

| Principle | Practical effect |
|-----------|------------------|
| Progressive disclosure | Show only what the user needs now; details on request |
| Dark mode default | Reduce eye strain in nighttime launch sessions |
| Unified colour coding | Red = danger; yellow = warning; green = safe; blue = info |
| Single source of truth | Each value displayed once, from one source |
| Responsive layout | Works on 1024+ screens (desktop + tablet) |
| Keyboard shortcuts | Critical and rapid operations |
| Confirmation on destructive | Delete or launch = confirmation dialog + password |
| Undoable actions | Every modification undoable for 30 s |
| Offline-capable | UI works without internet (local GCS) |
| Auditable | Every critical action logged with timestamp and user |

### 6.2 Complete Screen List (S1–S22 + S13a, Path-Aware)

| # | Screen | Purpose | Priority |
|---|--------|---------|----------|
| S1 | Login & User Management | Secure login, RBAC, role management | P0 |
| S2 | Home Dashboard | Overall view, statistics, recent flights | P0 |
| S3 | Rocket Library | Rocket list + import new template | P0 |
| S4 | Rocket Details Editor | View / edit rocket template (path-agnostic) | P0 |
| S5 | Mission Configuration | Rocket picker enumerated dynamically from `release_manifest.yaml`; path picker (A / B); per-stage autopilot modes (all five from day 1) and per-stage scenario list populated dynamically from `rockets/<id>/template.yaml` and `rockets/<id>/scenarios.yaml`; target ground range; produces `mission/<id>.yaml` | P0 |
| S5b | Actuator Library Editor | Manage `actuator_library.yaml` entries; per-actuator dynamics and limits; datasheet ingestion guide | P0 |
| S5c | Controller Library Editor | Manage `controller_library.yaml` gain sets per controller type | P0 |
| S6 | Simulation Runner | Run simulation; engine choice (`high_fidelity` / `low_fidelity_fast`); fault injection | P0 |
| S7 | 3D Telemetry Viewer | Live 3D display | P0 |
| S8 | Control Design Lab | Design and tune controllers; Bode / Nyquist / root locus | P0 |
| S9 | Gain Schedule Editor | Operating-point grid editor | P0 |
| S10 | Stability Analysis | Stability margins, robustness | P1 |
| S11 | Monte Carlo Runner | Statistical analysis; engine choice per scenario; user-set run count | P1 |
| S12 | Fault Injection Lab | Test failure scenarios | P1 |
| S13 | Hardware Health Monitor | Live hardware status, path-aware; per-port TX/RX bytes/s; 5 s rescan ticker | P0 |
| S13a | Routing Manager | USB role ↔ device-port mapping editor; manual VID:PID bypass; reads / writes `gnc_device_assignments.json`; raises YAML patches against `hardware_mapping.yaml` (close-integration plan Table 1 #4 / Table 3 #2) | P0 |
| S14 | Pre-Launch Checklist | Pre-launch verification (S01–S24, path-aware) | P0 |
| S15 | Launch Control Centre | Launch screen — kiosk mode | P0 |
| S16 | Live Flight Monitor | Live flight monitoring incl. saturation flags (cols 102, 103) and stage transitions | P0 |
| S17 | Post-Flight Analysis | Post-flight analysis incl. logging-completeness check | P1 |
| S18 | Flight Replay | Replay previous flight | P1 |
| S19 | Firmware Update Console | STM32 / Android update | P1 |
| S20 | System Settings | General settings | P2 |
| S21 | Logs & Audit Trail | Operation logs | P1 |
| S22 | Comparison Tool | Compare flights / designs | P2 |

### 6.3 Technology Stack

| Concern | Choice |
|---------|--------|
| Web framework | React with TypeScript |
| Styling | Tailwind CSS with custom components |
| State management | Redux Toolkit |
| Telemetry transport | WebSocket (bidirectional) |
| Charts | Recharts and uPlot for time series; Plotly.js for stability plots |
| 3D | Three.js (and React-Three-Fiber) |
| Tables | AG Grid (paginated, sortable) and Handsontable (spreadsheet-style) |
| Maps | Leaflet / MapLibre |
| Mobile companion | React Native |
| Localisation | Arabic + English with RTL from day 1 |
| CAD-to-GLB conversion | Dedicated conversion server (`cad-converter` Docker service) |
| Deployment | Docker containers; Nginx in front |
| Launch Control mode | Kiosk mode (full-screen, no OS chrome, controlled exit) |
| Icons | Lucide |
| Component primitives | shadcn/ui |
| Auth | Keycloak (mTLS) |
| Testing | Playwright (E2E) + Vitest (unit) |

### 6.4 Details of Critical Screens

#### 6.4.1 S3: Rocket Library

```
+-----------------------------------------------------------+
| Rocket Library                          [+ Import New]    |
+-----------------------------------------------------------+
| Search: [____________]  Filter: [All Types v]             |
+-----------------------------------------------------------+
|  +----------------+  +----------------+                   |
|  |     BA         |  |    ES_273      |                   |
|  |  [3D render]   |  |  [3D render]   |                   |
|  | Single / Canard|  | Single / Tail  |                   |
|  | Mass:   571 kg |  | Mass:   169 kg |                   |
|  | Length: 5.45 m |  | Length: 2.21 m |                   |
|  | Mach:  0.3-5.0 |  | Mach:  0.3-5.0 |                   |
|  | Status: OK     |  | Status: OK     |                   |
|  | [View] [Copy]  |  | [View] [Copy]  |                   |
|  +----------------+  +----------------+                   |
|  +----------------+  +----------------+                   |
|  |     GH         |  |     SA         |                   |
|  |  [3D render]   |  |  [3D render]   |                   |
|  | Two-stage      |  | Two-stage      |                   |
|  | Mass:  3050 kg |  | Mass:  1124 kg |                   |
|  | Length: 9.83 m |  | Length: 8.00 m |                   |
|  | Mach: 0.3-15.0 |  | Mach:  0.3-6.0 |                   |
|  | Status: OK     |  | INFO: stage 2  |                   |
|  | [View] [Copy]  |  |  unpowered     |                   |
|  +----------------+  | [View] [Copy]  |                   |
|                      +----------------+                   |
|  [ Recently Imported Templates: 3 ]                       |
|  [ Community / Shared Library ]                           |
+-----------------------------------------------------------+
```

CAD-to-GLB thumbnails are produced by `cad-converter`. Drag-and-drop upload via `react-dropzone`.

#### 6.4.2 S4: Rocket Details Editor

Tab layout: Physical | Geometry | Aero | Propulsion | Fins | Stages | Estimation | Mission Compatibility. Each tab uses AG Grid for paginated views and Handsontable for spreadsheet-style edits. Live validation runs C1–C25 on every edit.

#### 6.4.3 S6: Simulation Runner

Mission Setup, Environment, Integrator (engine choice: `high_fidelity` / `low_fidelity_fast`), Fault Injection (scheduled list), Live Progress (sim-time vs real-time, current state). Buttons: Start Simulation, Save Profile, Pause, Stop, View 3D, View Charts.

#### 6.4.4 S7: 3D Telemetry Viewer

Three.js scene with rocket GLB, trail, velocity vector, ground terrain, target marker, wind arrows, fin deflections. Camera modes: Follow / Free / Chase / Top / Side. Time-control bar with 1×–10× playback. Export 3D snapshot and record-as-video.

#### 6.4.5 S8: Control Design Lab

Algorithm selector for the 12 algorithms in §5.2 (per stage per phase). Gains sliders per operating point with auto-tune. Live plots: step response, Bode, Nyquist, root locus. Comparison A/B vs previous design.

#### 6.4.6 S15: Launch Control Centre (Kiosk Mode)

```
+--------------------------------------------------------------+
| LAUNCH CONTROL — BA                               [ABORT]    |
+--------------------------------------------------------------+
|  ==================== System Health =====================   |
|   * Battery Pack 1     8.4V    OK       (100%)              |
|   * Battery Pack 2     8.3V    OK       (98%)               |
|   * Telemetry          -42dBm  OK       (18 km range)       |
|   * GPS Fix            RTK     OK       (12 satellites)     |
|   * IMU                        OK       (biases in range)   |
|   * All Servos x 4             OK       (sweep passed)      |
|   * STM32 FW           v2.3.1  OK                           |
|   * Android App        v1.8.0  OK                           |
|   * CAN Bus            500k    OK       (0% error rate)     |
|   * Launch Rail        Level   OK                           |
|  =================== Mission Info =======================   |
|   Launch site:  33.620 N, 44.370 E, 50m                     |
|   Target:       33.700 N, 44.400 E                          |
|   Distance:     8,945 m                                     |
|   Elevation:    45 deg    Azimuth: 180 deg                  |
|   Weather:      Wind 4.2 m/s @ 270 deg — WITHIN LIMITS      |
|   T-minus:      --:--:--  (not started)                     |
|  ===================== Actions ==========================   |
|     [ Run System Check ]    (takes 30 seconds)              |
|     [ ARM ]  (Requires password + physical key)             |
|     [ LAUNCH ]  (After ARM, requires 2nd confirmation)      |
|  ==================== Event Log =========================   |
|   21:45:02  System check completed — all green              |
|   21:45:45  IMU recalibration successful                    |
|   21:46:10  Awaiting ARM command                            |
+--------------------------------------------------------------+
```

Strict rules: cannot press LAUNCH until system check passes (all green), ARM confirmation (password) accepted, physical key entry detected, audible / visual confirmation acknowledged. ABORT always available, single-press. Every action logged to the audit trail with timestamp.

#### 6.4.7 S13a: Routing Manager (USB Role ↔ Device-Port Mapping)

S13a is a new screen introduced in v5.4 to handle field-day adapter substitution without forcing a `hardware_mapping.yaml` edit (close-integration plan Table 1 #4 and Table 3 #2 / #5). The same screen ships in two parallel surfaces sharing one backend store:

- The **Web GCS** (React, Tailwind) opens S13a as a modal dialog from S13's status bar.
- The **Path A Android app** exposes the same dialog when the device is in `BENCH_TEST` state. The Path A app and the Web GCS read / write the *same* `gnc_device_assignments.json` document via the backend's REST API; this is the merged form of close-integration plan Table 3 row 5 ("Pre-launch tool deployment").

```
+--------------------------------------------------------------+
| Routing Manager                                       [Save] |
+--------------------------------------------------------------+
|  Detected USB devices                                        |
|   1.  VID 0x067B  PID 0x2303    PL2303-HXA   /dev/ttyUSB0    |
|       Suggested role:  GPS_TLM_PL2303          [accept]      |
|       Override role :  [ GPS_TLM_PL2303         v ]          |
|   2.  VID 0x1A86  PID 0x55D4    CH9102X      /dev/ttyUSB1    |
|       Suggested role:  EXT_IMU                  [accept]      |
|       Override role :  [ EXT_IMU                v ]          |
|   3.  VID 0x1A86  PID 0x7523    CH340 (CAN)  /dev/ttyUSB2    |
|       Suggested role:  CAN_CH340                [accept]      |
|       Override role :  [ CAN_CH340              v ]          |
|   4.  VID 0x10C4  PID 0xEA60    CP2102       /dev/ttyUSB3    |
|       Suggested role:  RUDDER_CP2102            [accept]      |
|       Override role :  [ — disabled —           v ]          |
|                                                              |
|  Manual VID:PID bypass                                       |
|   [ + add row ]   VID [____]  PID [____]  role [______ v ]   |
|                                                              |
|  Conflicts with hardware_mapping.yaml (canonical):           |
|     none                                                     |
|                                                              |
|  Operator acknowledgement:                                   |
|    [ x ] I accept liability for the routing above.            |
|    Operator ID:  [ alice ]    Reason:  [ adapter swap ]      |
|                                                              |
|  [ Save and stage YAML patch ]   [ Cancel ]                  |
+--------------------------------------------------------------+
```

Rules:

1. **Auto-scan first.** When S13a opens, the backend runs the same USB enumeration as §11.2.5 and pre-fills the *Suggested role* column from VID/PID lookup against `schemas/android_usb_roles.yaml`.
2. **Manual override is liability-tracked.** Any deviation from the canonical `hardware_mapping.yaml` requires the operator to enter their Operator ID and a free-text *Reason*. The override is recorded in the audit trail (§1.7) and surfaces as a diff patch on `hardware_mapping.yaml` for review before merge to Git — close-integration plan Drop-table item 6 (`force_shadow=True` without YAML reconciliation) is therefore not adopted.
3. **"Show ALL devices" is not silent.** Devices whose VID/PID is not registered in `schemas/android_usb_roles.yaml` are visible in the dialog only when the operator ticks the *Show unrecognised devices* expander; selecting one still requires Operator ID + Reason, satisfying close-integration plan Drop-table item 5.
4. **Save persists.** "Save" writes the resulting role map to `gnc_device_assignments.json` (§7.3.13) and stages a patch on `hardware_mapping.yaml` for the next code review.
5. **No flight authority.** S13a is disabled while the launch state machine is in `ARMED` or beyond; the dialog cannot be opened after T-3 min (§11.3 S22 enforces NO-GO if hotplug rescan reports a topology change after that gate).

### 6.5 Data Sources per Screen

| Screen | Sources | Update rate |
|--------|---------|-------------|
| S3 | Templates DB | On request + cache |
| S4 | DB + user input | Live form validation |
| S5 | User input + GPS + Weather API | On submit |
| S6 | Backend simulation engine (WebSocket) | Live during sim (10–50 Hz) |
| S7 | Telemetry stream (WebSocket) | 30–60 fps |
| S8 | Backend compute + user input | On tuning change |
| S10 | Backend compute | On demand |
| S13 | Flight computer → WebSocket → UI | 1 Hz health + 50 Hz telemetry; per-port TX/RX bytes/s @ 1 Hz; rescan ticker @ 0.2 Hz |
| S13a | Backend USB scanner + `gnc_device_assignments.json` (§7.3.13) | On open + hotplug push; manual save event |
| S14 | Hardware tests + user confirmation | On demand |
| S15 | Hardware direct + TCP MCTU | Real-time 50 Hz |
| S16 | TLM from rocket + GPS | Real-time 50 Hz |
| S17 | Flight logs + simulation | On demand |
| S18 | Saved flight data | Controlled playback |

### 6.6 Display Method by Data Type

| Data type | Visualisation | Technology |
|-----------|---------------|------------|
| Position + altitude + time | 3D trajectory line | Three.js Line |
| Time-series (TLM) | Dynamic line chart | Recharts / uPlot |
| Attitude (roll, pitch, yaw) | Gauges + artificial horizon | Custom SVG |
| Health indicators | Status pills (green / red) | Tailwind |
| Aerodynamic coefficients | Heatmap (Mach × α) | D3 |
| Comparison between designs | Dual-axis chart | Recharts |
| Bode / Nyquist / root locus | Specialised plots | Plotly.js |
| Maps and coordinates | 2D map | Leaflet / MapLibre |
| 3D camera | Interactive 3D scene | Three.js |
| Parameter tables | Editable grid | AG Grid |
| Spreadsheet edits | In-place spreadsheet | Handsontable |
| Monte Carlo results | Envelope plots | Custom D3 |
| Fault-injection timeline | Gantt-style timeline | vis-timeline |

### 6.7 UI Testing (Playwright + Vitest — Systematic per Screen)

Every screen has a Playwright suite that runs the screen's primary user flows end-to-end, plus Vitest unit tests for state slices and component logic. Suites are organised under `gnc-frontend/tests/playwright/<screen_id>/` and `gnc-frontend/tests/unit/<feature>/`. Tier 1 CI runs unit tests; Tier 3 nightly runs the Playwright suite against a deployed Docker stack.

---

## Phase 7 — Hardware and Communications Layer

### 7.1 Hardware Topology (Two Paths)

Both paths are operational. Selection is per mission via `mission.flight_computer_path`.

#### 7.1.1 Path A — Snapdragon 845 + STM32L431 Peripheral

```
+===============================================================+
|              Path A Hardware Topology                         |
+===============================================================+

     +------------------------------------+
     |   Snapdragon 845 Android Tablet    |  [PERMANENT]
     |   FLIGHT COMPUTER                   |
     |   - gnc-android wrapper             |
     |   - Default 100 Hz loop (locked)    |
     |   - ESKF + optional MHE             |
     |   - Built-in IMU (baseline)         |
     |   - Optional external IMU (auto-    |
     |     detected AND verified)          |
     |   - Optional seeker (CarTracking4)  |
     |   - USB-C to Ethernet adapter -> GCS|
     +---+-----------+-----------+--------+
         |           |           |
    USB-OTG     USB-OTG     USB-OTG
         v           v           v
    +--------+  +--------+  +----------+
    | u-blox |  | EXT-IMU|  | CAN      |
    | GPS    |  |(opt'l, |  | Adapter  |
    | UART   |  | both   |  | 500 kbps |
    +---+----+  | used)  |  | (USB-CAN)|
        |       +---+----+  +----+-----+
                                 |
                                 | CAN Bus (500 kbps)
       +--------+--------+--------+--------+--------+--------+--------+
       |        |        |        |        |        |        |        |
   +---v---+ +--v---+ +--v---+ +--v---+ +--v---+ +--v---+ +--v---+ +--v---+
   |Servo  | |Servo | |Servo | |Servo | |Engine| |Engine| |Sep.  | |War-  |
   |0x25   | |0x26  | |0x27  | |0x28  | |Start1| |Start2| |Nail  | |head  |
   |[PERM] | |[PERM]| |[PERM]| |[PERM]| |[OPT] | |[OPT] | |1,2   | |Fuse  |
   +-------+ +------+ +------+ +------+ +------+ +------+ |[OPT] | |[OPT] |
                                                          +------+ +------+

     +------------------------------------+
     |   STM32L431CCT6 (PERIPHERAL)        |  [PERMANENT]
     |   USB-CDC link to Android.          |
     |   - Telemetry radio manager (UART)  |
     |   - FIRE pyro GPIO                  |
     |   - PUI / aux I/O                   |
     |   - Watchdogs                       |
     |   - Safe-mode on link loss           |
     +-----------------+------------------+
                       | UART
                       v
                 +------------+
                 | LoRa Radio |   default 418 MHz, operator-editable
                 | (MisPlot)  |
                 +------------+

     +------------------------------------+
     |   Battery 28V + Power switch        |  [PERMANENT]
     +------------------------------------+
```

Path A enclosure uses **passive** thermal management. The Snapdragon's USB-C port is the GCS Ethernet uplink via a USB-C to Ethernet adapter (Phase 7 Q8).

#### 7.1.2 Path B — STM32H743 / STM32H753 with Integrated IMU

```
+===============================================================+
|              Path B Hardware Topology                         |
+===============================================================+

     +------------------------------------+
     |   STM32H743 / H753 Flight Computer  |  [PERMANENT]
     |   FreeRTOS                          |
     |   - gnc-stm32 wrapper               |
     |   - Default 200 Hz loop (locked)    |
     |   - ESKF + optional MHE             |
     |   - Integrated IMU                  |
     |   - Telemetry radio (LoRa via UART) |
     |   - FIRE pyro GPIO                  |
     |   - Ethernet -> GCS (built-in MAC)  |
     +---+-----------+-----------+--------+
         |           |           |
       UART       SPI/I2C       FDCAN
         v           v           v
    +--------+  +--------+  +----------+
    | u-blox |  | (IMU on|  | FDCAN    |
    | GPS    |  | board) |  | 500 kbps |
    +--------+  +--------+  +----+-----+
                                 |
                                 | CAN Bus
       +--------+--------+--------+--------+--------+
       |        |        |        |        |        |
   +---v---+ +--v---+ +--v---+ +--v---+ +--v---+ +--v---+
   |Servo  | |Servo | |Servo | |Servo | |Engine| |Sep.  |
   |0x25   | |0x26  | |0x27  | |0x28  | |Start | |Nail  |
   |[PERM] | |[PERM]| |[PERM]| |[PERM]| |[OPT] | |[OPT] |
   +-------+ +------+ +------+ +------+ +------+ +------+

     +------------------------------------+
     |   Optional: Jetson Nano             |  [OPTIONAL — when seeker enabled]
     |   - CarTracking4 fork on Linux      |
     |   - YOLOv8 + tracker                |
     |   - LOS angles + rates -> STM32H7xx |
     |     via UART or CAN                  |
     |   - USB / CSI camera                 |
     +------------------------------------+
```

#### 7.1.3 Permanent vs Optional Devices

| Device | Status | Notes |
|--------|--------|-------|
| Flight computer | PERMANENT | Snapdragon 845 (Path A) or STM32H743 / H753 (Path B) |
| STM32L431 peripheral | PERMANENT (Path A only) | Absorbed into flight computer on Path B |
| IMU (built-in) | PERMANENT | Snapdragon built-in (Path A) or STM32H7xx-integrated (Path B) |
| External IMU | OPTIONAL (Path A only) | Auto-detected AND declared (Decision 11) |
| GPS | OPTIONAL with default `present: true` | `RTK or SBAS acceptable` |
| Telemetry radio | OPTIONAL with default `present: true` | LoRa default 418 MHz, operator-editable |
| CAN bus | PERMANENT | CANOpen for servos at 500 kbps |
| Servos / thrusters (≥ 4) | PERMANENT | Up to 12 in over-actuated airframes |
| Battery 28 V + power switch | PERMANENT | Single power source for all devices |
| Ground station + Ethernet | PERMANENT | Same on both paths |
| Seeker subsystem | OPTIONAL | Per template + per mission; co-processor on Path B |
| Warhead fuse (FUCAN) | OPTIONAL | Per template / mission |
| Engine starters | OPTIONAL | Multi-engine rockets only |
| Separating nails | OPTIONAL | Multi-stage only |
| Pyrotechnic physical security | OPTIONAL | Used if available (Phase 7 Q4); see §7.8 |
| Lightning / surge protection | NOT INSTALLED | Excluded (Phase 7 Q10) |
| Dual CAN | NOT INSTALLED | Single CAN; over-actuated airframes use redistribution and saturation handling |
| Flight termination system | OPTIONAL | Required when `radio.present = false` |

Path A USB OTG power on the Snapdragon 845 tablet is sufficient for GPS (PL2303) + USB-CAN + STM32 CDC simultaneously; this has been measured (Phase 7 Q7).

### 7.2 Power System

| Component | Voltage | Expected load | Supply |
|-----------|---------|---------------|--------|
| Android tablet | 5 V | 1.5–3 A | Power bank / USB PD |
| STM32 board | 3.3 V | 100 mA | CAN-bus 5 V via regulator |
| XQPOWER servo × 4 | 7.4 V | 1.5–5 A each | XT60 LiPo battery |
| GPS module | 5 V | 100 mA | CX2416 DC-DC |
| Telemetry radio | 12 V | 200–500 mA | CX2416 DC-DC |
| CAN adapter | 5 V | 50 mA | USB OTG |
| Pyrotechnic FIRE | variable | 1–5 A pulse | Separate, via STM32 GPIO |

Battery sizing for 30 min preparation + 2 min flight: main pack ~16 Wh (LiPo 2S 7.4 V × 2200 mAh, or 3S 11.1 V × 1500 mAh); pyrotechnic pack 3S 11.1 V × 1000 mAh; 50 % margin.

### 7.3 Communication Protocols

#### 7.3.1 XQPOWER CANOpen

| Parameter | Default | Range |
|-----------|---------|-------|
| Node ID | `0x25` per fin slot | 1–127 |
| Baud rate | 500 kbps | 20 kbps – 1 Mbps |
| Format | CANOpen SDO | Standard frame |
| Position range | ±100° hardware | We use ±25° for safety |
| Position precision | 0.1° | — |
| Report interval | 50 ms | 10–255 ms |

**Node ID convention.** NodeIDs are read from `hardware_mapping.yaml` field `servo_nodes_by_stage[*].nodes[*].can_id`. Two conventions are supported: **flat** (`1..4`) for single-stage 4-fin rockets, and the **formula** `0x25 + 12 · stage_index + fin_index` for multi-stage rockets (canonical definition in Appendix A.6). The mixer indexes fins through `hardware_mapping`; the simulator and CAN driver are agnostic to the convention. SDO TX uses `0x600 + NodeID`, SDO RX `0x580 + NodeID`, PDO `0x180 + NodeID`.

#### 7.3.2 Command Table

| Command | CAN ID | DLC | Data (hex) |
|---------|--------|-----|-----------|
| Start report | `NodeID` | 2 | `[0x01, 0x00]` |
| Stop report | `NodeID` | 2 | `[0x02, 0x00]` |
| Auto report (RX) | `0x580 + NodeID` | 4 | `[Lo, Hi, 0x00, 0x00]` |
| Set position | `0x600 + NodeID` | 8 | `[0x22, 0x03, 0x60, 0x00, L, H, 0, 0]` |
| Read position | `0x600 + NodeID` | 8 | `[0x40, 0x02, 0x60, 0x00, 0, 0, 0, 0]` |
| Set midpoint | `0x600 + NodeID` | 8 | `[0x22, 0x09, 0x30, 0x00, 0, 0, 0, 0]` |
| Save config | `0x600 + NodeID` | 8 | `[0x22, 0x10, 0x10, 0x01, "s","a","v","e"]` |
| Read status | `0x600 + NodeID` | 8 | `[0x40, 0x05, 0x60, 0x00, 0, 0, 0, 0]` |
| Read FW version | `0x600 + NodeID` | 8 | `[0x40, 0x0A, 0x10, 0x00, 0, 0, 0, 0]` |
| Set report rate | `0x600 + NodeID` | 8 | `[0x22, 0x00, 0x22, 0x00, X, 0, 0, 0]` |
| Low-voltage en | `0x600 + NodeID` | 8 | `[0x22, 0x0F, 0x30, 0x00, X, 0, 0, 0]` |
| Low-voltage auto-report (RX) | `0x380 + NodeID` | 8 | `[0x0A, 0x02, ...]` — emitted when bus voltage falls below ~70 % rated; requires Low-voltage en first |
| Set baud rate | `0x600 + NodeID` | 8 | `[0x22, 0x01, 0x30, 0x00, code, 0, 0, 0]` — `code` 0..7 = 20 k / 50 k / 100 k / 125 k / 250 k / 500 k / 800 k / 1 M; requires Save + restart |
| Set node number | `0x600 + NodeID` | 8 | `[0x22, 0x00, 0x30, 0x00, new_id, 0, 0, 0]` — requires Save + restart |
| Read current + temperature | `0x600 + NodeID` | 8 | `[0x40, 0x00, 0x56, 0x00, 0, 0, 0, 0]` — SDO read of index `0x5600` |
| Response success | `0x580 + NodeID` | 8 | `[0x60, idx, ..., 0, 0, 0, 0]` |
| Response error | `0x580 + NodeID` | 8 | `[0x80, idx, err_code, ...]` |

#### 7.3.3 Position Encoding

```python
def deg_to_raw(angle_deg: float) -> int:
    clamped = max(-25.0, min(25.0, angle_deg))
    raw = int(clamped * 10)              # 0.1° units
    if raw < 0:
        raw = (1 << 16) + raw            # two's complement
    return raw

def raw_to_deg(raw: int) -> float:
    if raw >= 0x8000:
        raw -= (1 << 16)
    return raw * 0.1
```

#### 7.3.4 Other USB Protocols

| Device | VID | PID | Baud | Protocol | Use |
|--------|-----|-----|------|----------|-----|
| PL2303 | `0x067B` | any | 115200 | KCA binary (GPS) + TLM (see §7.3.7) | GPS read + TLM send |
| CP2102 | `0x10C4` | any | 115200 | Rudder TTL 7-byte (see §7.3.10) | Tail servo (alternate path) |
| CH340 | `0x1A86` | any | 2 Mbps (Waveshare) | USB-CAN frame (see §7.3.11) | CAN adapter |
| CDC-ACM | multi | — | 115200 (ZLG) | USB-CAN frame (see §7.3.11) | Alternative CAN adapter |
| CH9102X | `0x1A86` | `0x55D4` / `0xE397` | 38400 / 921600 | External-IMU UART (see §7.3.6); also USB-CAN | `EXT_IMU` role (preferred) |
| FTDI FT232R | `0x0403` | any | 38400 | External-IMU UART (see §7.3.6) | `EXT_IMU` role (alternate) |

Android USB device-role enum (consumed by `gnc-android/hal-impl/AndroidUsbHelper.kt`):

```cpp
enum class UsbDeviceRole {
    GPS_TLM_PL2303 = 0,
    RUDDER_CP2102  = 1,
    CAN_CH340      = 2,
    SEEK_CARTRACK  = 3,
    EXT_IMU        = 4,
};
```

The role for each connected device is selected by VID / PID match against `schemas/android_usb_roles.yaml`.

#### 7.3.5 MisPlot Telemetry (77 bytes)

```c
struct MisPlotFrame {
    uint16_t sync;             // 0x70FA, little-endian (2 B)
    uint8_t  command;          // block number 0-19 (1 B)
    uint8_t  goto_sw;          // gotoSW flag (1 B)
    int32_t  timestamp_ms;     // milliseconds (4 B)

    // 6 floats — 24 B: IMU raw data
    float    accel_x, accel_y, accel_z;
    float    gyro_x,  gyro_y,  gyro_z;

    // 11 mixed values — 44 B (block-dependent payload)
    uint8_t  payload[44];

    uint8_t  checksum;         // XOR of all previous bytes
};                             // Total: 2+1+1+4+24+44+1 = 77 bytes
```

Block payloads:

| Block | Payload |
|-------|---------|
| 0–14 | Existing state telemetry |
| 15 | IMM mode probabilities `μ[0..5]` |
| 16 | MHE solver status + convergence info |
| 17 | Stage status (current stage + separation event) |
| 18 | Per-finset deflections (SA 3 finsets) |
| 19 | Extended envelope (α, β, Mach, Re) |

Saturation flag bytes (cols 102–103) are always included in every transmitted frame; they ride in the per-block payload header (`payload[0..1]`) regardless of block.

#### 7.3.6 External IMU ↔ Android UART Frame (Path A Optional)

The STM32F405 external-IMU bridge emits one 17-byte binary frame per 100 Hz tick (see §3.9.6 for the SPI side). The Android `EXT_IMU` USB role consumes it and feeds the values into the ESKF measurement stream alongside the Snapdragon built-in IMU.

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 0 | `SYNC1` | `uint8` = `0xAA` | Frame start |
| 1 | `SYNC2` | `uint8` = `0x55` | Frame start |
| 2..3 | `gyro_x` | `int16 LE` | Raw, scale 0.02 °/s/LSB |
| 4..5 | `gyro_y` | `int16 LE` | Raw |
| 6..7 | `gyro_z` | `int16 LE` | Raw |
| 8..9 | `accel_x` | `int16 LE` | Raw, scale 0.8 mg/LSB |
| 10..11 | `accel_y` | `int16 LE` | Raw |
| 12..13 | `accel_z` | `int16 LE` | Raw |
| 14..15 | `aux` | `int16 LE` | Alternates between `PROD_ID` and `TEMP_OUT` per cycle |
| 16 | `XOR` | `uint8` | XOR of bytes 2..15 |

Total = 17 B. Carrier: 38400 bps 8N1 over USB-UART (`EXT_IMU` role, see §7.3.4). The XOR integrity covers payload only; sync bytes are validated by the parser state machine. The COBS-framed CDC link defined in §1.6 is unrelated — that one carries peripheral commands, this one carries IMU samples.

```c
// builder (STM32F405)
pkt[0]  = 0xAA;
pkt[1]  = 0x55;
memcpy(&pkt[2], imu, 14);                 // 7 × int16 LE
uint8_t x = 0;
for (i = 2; i < 16; ++i) x ^= pkt[i];
pkt[16] = x;
HAL_UART_Transmit_DMA(&huart1, pkt, 17);
```

#### 7.3.7 GPS KCA Binary Protocol

Variable-length binary protocol spoken by the existing GPS receiver. Consumed by `gnc-core/sensors/GpsKca.cpp` (the reused `GPS.cpp` cited in §1.3) and surfaced to the ESKF as a `GpsFix`.

| Field | Bytes | Notes |
|-------|-------|-------|
| `SYNC1` | 1 | `0x81` |
| `SYNC2` | 1 | `0x7E` |
| `TYPE` | 1 | Message type |
| `LENGTH` | 1 | Payload length ≤ 160 B |
| `payload` | ≤ 160 | `NavData` struct (see below) |
| `CRC` | 2 | CRC-16/CCITT (poly `0x1021`, init `0`) over `TYPE..payload` |

`NavData` payload fields: latitude, longitude, altitude (deg, deg, m WGS-84); `Vx`, `Vy`, `Vz` (m/s, NED); `Ax`, `Ay`, `Az` (m/s²); UTC; DOP; `SNR_GPS[12]`; `SNR_GLONASS[12]`; `WkNum`.

Parser state machine: `UNINIT → IGOT_SYNC1 → IGOT_SYNC2 → IGOT_LENGTH → IGOT_PAYLOAD → IGOT_CHKSUM`. Counters surfaced to telemetry: `kca_msg_cnt`, `kca_byte_cnt`, `kca_frame_error`.

Measurement-delay compensation: a fixed `FIXED_DELAY_US = 14236` is subtracted from the IMU-aligned timestamp at the ESKF measurement step. The constant lives in `gnc-core/sensors/GpsKca.cpp`. Transport: USB-UART PL2303 @ 115200 8N1 + `DTR/RTS` asserted on open (see §7.3.4).

#### 7.3.8 Path A Peripheral CAN ID Map (Android ↔ STM32L431)

The STM32L431 peripheral controller is reachable by Android over **either** USB-CDC (the §1.6 protocol) or the CAN bus. The carrier is selected per mission via `hardware_mapping.peripheral_link.command_carrier ∈ { usb_cdc, can }` (default `usb_cdc`). When `command_carrier = can`, the same ARM / FIRE / AUX-IO commands defined in §1.6 are carried by the following 11-bit CAN IDs, independent from the XQPOWER servo NodeIDs:

| Direction | CAN ID | DLC | Bytes | Meaning |
|-----------|--------|-----|-------|---------|
| Android → L431 | `0x010` | 1 | `0x01` ON / `0x03` OFF | PUI power command (fire-and-forget) |
| L431 → Android | `0x100` | 1..N | `0xFF` startup banner; otherwise GPIO feedback bytes | Boot-up + GPIO feedback |
| Android → L431 | `0x405` | 1..2 | `0x01..0x06` GPIO group A / B / All command; `0x11..0x16` group feedback request | GPIO group control |
| L431 → Android | `0x405` | 1..2 | `0x11..0x16` group feedback values; `0xE0`, `0xE2` error codes | Replies + error reports |

When `command_carrier = usb_cdc`, the §1.6 USB-CDC protocol carries the same commands and `0x010 / 0x100 / 0x405` are not emitted. The CAN carrier is provided so the L431 can act as a CAN-only peripheral when the USB-OTG cable is not used.

#### 7.3.9 MCTU TCP-5900 Protocol Frames

Concrete frame definitions for the TCP-5900 link surfaced as "MCTU" in §1.3 and §7.11. The flight computer is the **server** and binds `192.168.0.2:5900` (Path A: USB-C to Ethernet adapter; Path B: built-in MAC), with `0.0.0.0:5900` as the listen-anywhere fallback. The GCS connects as the client.

**Outbound NAV frame** — 6 × `float` little-endian, 24 B, broadcast @ 50 Hz:

```c
struct McTuNav {
    float Xm;           // position North  [m]
    float Ym;           // position East   [m]
    float Zm;           // position Down   [m]
    float theta_deg;    // pitch  [deg]
    float phi_deg;      // roll   [deg]
    float psi_deg;      // yaw    [deg]
};   // 24 bytes
```

**Outbound control frame** — 16 × `float` little-endian, 64 B, @ 50 Hz: autopilot demand vector, fin commands echoed back, mode flags, mixer saturation indicators.

**Inbound command messages** — newline-terminated ASCII. The numerical operand is a hex string without prefix.

| Command | Payload | Effect |
|---------|---------|--------|
| `DELC1 <hex>` ... `DELC4 <hex>` | `int16` deflection in 0.1° units | Override fin 1..4 deflection (ground-test only; disabled in flight by S15 lock) |
| `Y1 <hex>` ... `Y4 <hex>` | `float` yaw / pitch reference | Set commanded attitude reference for stage 1..4 (controller-stack input override) |

#### 7.3.10 Rudder 7-Byte Alternate Servo Frame (Fallback Path)

Selected when `hardware_mapping.servo_protocol = rudder_7b` instead of the default `canopen_xqpower`. Carrier: USB-UART CP2102 (VID `0x10C4`, see §7.3.4) @ 115200 8N1 with `IFC_ENABLE` toggled on open.

Frame layout (7 bytes per message):

| Byte | Field | Bit layout |
|------|-------|------------|
| 0 | SYNC + OP + ID-high | bit 7 = SYNC (always 1); bits 6..2 = `OP`; bits 1..0 = `ID_hi` |
| 1 | ID-low | bit 7 = 0; bits 6..0 = `ID_lo` |
| 2 | reserved | — |
| 3 | reserved | — |
| 4 | val-high | bit 7 = 0; bits 6..0 = `val_hi` |
| 5 | val-low | bit 7 = 0; bits 6..0 = `val_lo` |
| 6 | XOR | XOR of bytes 0..5 |

Decoding rules:

```text
ID    = (b[0] & 0x03) * 128 + (b[1] & 0x7F)         // rudders 1..4, or 0x10 = disconnect
OP    =  b[0] & 0xFC                                 // 0x88 position, 0x8C current,
                                                     // 0xC0 disconnect counters
value = (b[4] & 0x7F) * 128 + (b[5] & 0x7F) - 8191   // 14-bit signed, ±8191 range
```

The CANOpen XQPOWER path is the platform default; the 7-byte rudder path is documented here because it remains the only servo protocol on hardware sets that pre-date the XQPOWER bus.

#### 7.3.11 USB-to-CAN Bridge Frame Formats (with Protocol Auto-Probe)

Two USB-CAN bridges are supported on Path A. The bridge type is read from `hardware_mapping.can_bus.bridge.type`; the `AndroidCan` HAL implementation hides the framing from the rest of `gnc-core`, which sees only `CanFrame { id, dlc, data[8] }`.

**Waveshare USB-CAN-A** — CH340 host UART @ 2 Mbps, variable length 5..13 B:

```text
0xAA HEADER | (0xC0 | DLC) INFO | ID_L | ID_H | data[0..DLC-1] | 0x55 FOOTER
```

**Aikemu / ZLG USB-CAN** — CDC-ACM host @ 115200, fixed length 20 B:

```text
0x01 TYPE | ID_L | ID_H | 0x00 × 8 reserved | DLC | data[0..7] (zero-padded)
```

When `hardware_mapping.can_bus.bridge.type = native_fdcan` (Path B FDCAN peripheral) or `none` (Path A with native CAN board, not currently shipped), the HAL bypasses both framers and writes raw CAN frames to the kernel driver.

**Protocol auto-probe at open** (close-integration plan Table 1 #6 / Table 3 #4). Static framing per VID:PID is too rigid — future adapter SKUs (re-flashed CH340s, ZLG variants with custom firmware, white-label CDC-ACM bridges) must work without a spec revision. The `AndroidCan::open()` HAL implementation therefore runs a 1 s probe before locking the framer:

1. **Send a no-op SDO read** addressed to the broadcast NodeID (`0x600`) with `[0x40, 0x00, 0x10, 0x00, 0, 0, 0, 0]`. The bus must answer or the link is dead.
2. **Sniff the response shape.** If the first reply byte is `0xAA` and a `0x55` footer arrives within 13 B, the device speaks Waveshare framing. If the first byte is `0x01` and exactly 20 B arrive, it speaks Aikemu / ZLG framing. If neither pattern matches inside the 1 s window, the open call fails with `CAN_PROBE_AMBIGUOUS`.
3. **Reconcile with `hardware_mapping.can_bus.bridge.type`.** If the auto-detected framer matches the declared type, proceed silently. If they differ, the HAL emits a `bridge_type_mismatch` warning to the audit log (§1.7) and to S13's status bar, and proceeds using the *auto-detected* framer because that is what the wire actually speaks; the operator must reconcile `hardware_mapping.yaml` afterwards via S13a (§6.4.7). The rule is identical to the close-integration plan Table 3 row 2 directive: "YAML stays canonical; auto-scan produces *suggested* mapping; deviations are warnings."
4. **Probe results are cached** in `gnc_device_assignments.json` (§7.3.13) so subsequent boots reuse the result and skip the 1 s probe when the same VID:PID is back on the same port. A cache miss re-runs the probe.

#### 7.3.12 Seeker ↔ Peripheral USB Bridge Frames (Path A)

When the seeker is enabled on Path A (`mission.seeker.enabled = true`) and the camera mount has a controllable gimbal, the Android seeker module exchanges status / command frames with the peripheral STM32 over a dedicated USB-UART link tagged as the `SEEK_CARTRACK` role (see §7.3.4). Carrier: 115200 8N1.

**Android → MCU** — 17 B @ 50 Hz, integrity = CRC-16 CCITT little-endian over bytes 0..14:

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 0 | `SYNC1` | `0xAA` | |
| 1 | `SYNC2` | `0xCC` | |
| 2..3 | `angle_x × 100` | `int16 LE` | LOS azimuth in 0.01° |
| 4..5 | `angle_y × 100` | `int16 LE` | LOS elevation in 0.01° |
| 6..7 | `rate_x × 100` | `int16 LE` | LOS rate azimuth in 0.01 °/s |
| 8..9 | `rate_y × 100` | `int16 LE` | LOS rate elevation in 0.01 °/s |
| 10 | `mode` | `uint8` | See mode table below |
| 11 | `target_w` | `uint8` | Bounding-box width (pixels / 4) |
| 12 | `target_h` | `uint8` | Bounding-box height (pixels / 4) |
| 13 | `cpu_temp_c` | `uint8` | Snapdragon thermal-zone reading |
| 14 | reserved | `uint8` | `0x00` |
| 15..16 | `CRC` | `uint16 LE` | CRC-16 CCITT over bytes 0..14 |

**MCU → Android** — 9 B, integrity = CRC-16 CCITT big-endian over bytes 0..6:

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 0 | `SYNC1` | `0x55` | |
| 1 | `SYNC2` | `0xAA` | |
| 2 | `mode_cam` | `uint8` | Echoed from `mode`, ground-truth from peripheral |
| 3..4 | `yaw × 100` | `int16 LE` | Commanded yaw (0.01°) |
| 5..6 | `pitch × 100` | `int16 LE` | Commanded pitch (0.01°) |
| 7..8 | `CRC` | `uint16 BE` | CRC-16 CCITT over bytes 0..6 |

**Mode values:**

| Code | Meaning |
|------|---------|
| `0xBF` | IDLE — seeker armed but not tracking |
| `0xAC` | SEARCHING — detector running, no lock |
| `0xAD` | TRACK — lock held; LOS / LOS-rate fields valid |
| `0xE4` | OFF — disabled or fault |

Cross-reference: the `Android → MCU` packet is emitted by the seeker module downstream of the `ISeeker::SeekerOutput` struct defined in §5b.4. The peripheral acknowledges with the commanded gimbal angles each frame.

#### 7.3.13 Persistent Device-Role Assignments (`gnc_device_assignments.json`)

Close-integration plan Table 1 #5 introduces a per-host JSON cache that records the last-known mapping between USB device identifiers and `UsbDeviceRole` slots (§7.3.4). The cache lets a subsequent session start fully wired in under 2 s instead of re-running the full hot-plug probe and the CAN auto-probe.

**Location.** `${XDG_DATA_HOME}/gnc/gnc_device_assignments.json` on Linux desktop hosts; `/data/data/com.gnc.android/files/gnc_device_assignments.json` in the Path A Android app's private storage. Both surfaces share the *same* document via the backend's REST API (close-integration plan Table 3 row 5: Pre-launch tool deployment).

**Schema.**

```json
{
  "version": "1.0",
  "updated_at_utc": "2026-05-12T08:13:42Z",
  "host_fingerprint": "sha256:…",
  "entries": [
    {
      "vid": "0x067B",
      "pid": "0x2303",
      "serial": "AC11AE2K",
      "port_path": "/dev/ttyUSB0",
      "role": "GPS_TLM_PL2303",
      "source": "auto",
      "operator_id": null,
      "reason": null
    },
    {
      "vid": "0x1A86",
      "pid": "0x7523",
      "serial": null,
      "port_path": "/dev/ttyUSB2",
      "role": "CAN_CH340",
      "source": "manual",
      "operator_id": "alice",
      "reason": "adapter swap (CH340 substitute)",
      "can_probe_result": "waveshare"
    }
  ],
  "yaml_patch_pending": false
}
```

**Field semantics.**

| Field | Meaning |
|-------|---------|
| `vid` / `pid` | USB vendor / product ID, hex string |
| `serial` | Device serial when available; `null` if absent |
| `port_path` | OS-resolved port (Linux `/dev/tty*`, Android `usbfs` path, Windows `COMx`) |
| `role` | Resolved `UsbDeviceRole` (§7.3.4 enum) |
| `source` | `auto` (VID/PID lookup), `cached` (loaded from this file unchanged), `manual` (S13a operator entry) |
| `operator_id` | RBAC user that authored a manual entry; mandatory when `source = manual` |
| `reason` | Free-text justification for any manual entry; mandatory when `source = manual` |
| `can_probe_result` | Optional, present only on CAN bridges, holds the §7.3.11 auto-probe verdict (`waveshare` / `aikemu_zlg` / `native_fdcan`) |
| `yaml_patch_pending` | `true` when the cache contains manual entries that have not yet been merged into `hardware_mapping.yaml`; CI gate refuses to publish a release while this flag is set |

**Lifecycle.**

1. **Read at boot.** The HAL factory (§1.5) loads the file, validates the host fingerprint (rejects entries written on a different machine), and uses each row as the first guess for the corresponding USB role.
2. **Verify each entry.** A 200 ms USB enumeration confirms each cached row before it is trusted; a row whose VID/PID is no longer present is dropped and the role re-runs the auto-scan (§11.2.5).
3. **Update on save.** S13a writes the file when the operator clicks *Save and stage YAML patch*. Manual rows always carry `operator_id` and `reason`; the audit-trail entry references this file's SHA-256.
4. **Reconcile.** Whenever `yaml_patch_pending = true`, the GCS shows a non-blocking banner reminding the engineering team to commit the patch into `hardware_mapping.yaml`. The CI release gate fails while the flag remains set, ensuring no release ships with un-reconciled manual mappings (close-integration plan Drop-table item 6).
5. **Wipe on path change.** Switching `mission.flight_computer_path` invalidates the cache; the file is rewritten from scratch on the next boot.

**Authority.** This file is *not* a flight artefact — it is host-local and is never read by a flight binary (`flight_build = true`, §1.5.1). Path A's flight loop reads roles strictly from `hardware_mapping.yaml` resolved at lock time; the JSON cache only accelerates *bench* and *ground-tool* sessions.

### 7.4 Communication Diagram

```
+----------+ GPS @ 5 Hz +----------+ EKF/ESKF @ rate +--------+
|   GPS    |----------->|          |---------------->|        |
|  Module  | (KCA bin)  |          |                 |        |
+----------+            |          |                 |        |
                        |  Flight  |                 |        |
+----------+ IMU @ rate |  Computer|                 | CAN    |
| Sensors  |----------->|  +HAL    | Servo cmd @ rate| Bus    |
+----------+            |          |---------------->|        |
                        |          |  (CANOpen SDO)  |        |
+----------+            |          |                 |        |
| Battery  | voltage    |          |<----------------|        |
| Monitor  |----------->|          |  Servo status   |        |
+----------+            +----+-----+                 +--------+
                             |                            ^
                             | TLM @ 50 Hz                |
                             | (MisPlot 77 B,             |
                             |  saturation flags          |
                             |  always included)          |
                             v                            |
                        +----------+                      |
                        |  LoRa    |  default 418 MHz     |
                        |  TX      |                      |
                        +----+-----+                      |
                             | RF                         |
                             v                            |
                        +----------+ TCP 5900 (MCTU)      |
                        | Ground   |--------------------->| (Path B
                        | Radio    |                      |  has direct
                        +----+-----+                      |  Ethernet)
                             |                             |
                             v                             |
                        +----------+                       |
                        |  Web GCS |<----------------------+
                        | (Browser)|        Ethernet
                        +----------+
```

### 7.5 Reliability and Protection

| Layer | Protection | On failure |
|-------|------------|------------|
| CAN bus (flight computer ↔ servos) | CRC-15 + auto ACK | Retransmit × 3, then ERR_PASSIVE; flight computer handles |
| USB / UART (Android ↔ STM32L431) | Bit-level error detection | Reconnect thread; STM32 enters safe mode if link lost > 2 s |
| TLM (flight → radio) | XOR checksum | Frame discard + count error |
| Ethernet (flight → GCS) | TCP + heartbeat | Link loss does not abort flight; flight computer continues autonomously |
| WebSocket (GCS ↔ browser) | TLS 1.3 + heartbeat | Reconnect with backoff |
| Overall heartbeat | Mandatory 1–5 Hz on every critical link | Failsafe response after 1–5 s missing |

### 7.6 CAN Bus Bandwidth Note (Phase 7 Q1)

Rockets with up to 12 servos (≥ 8 fins) are over-actuated; the recommended upper bound for CAN-bus utilisation is documented as a note inside §7.6 and is enforced by clause C25 at template import time:

> **Note.** Per the chosen `loop_rate_hz` and the number of fins declared in `template.stages[*].fin_config.sets`, computed CAN-bus utilisation must remain below 70 % including telemetry headroom. The operator should not exceed this bound. The GCS reports computed utilisation in S5 at mission lock and warns above 60 %.

### 7.7 Telemetry Radio (LoRa; default 418 MHz, operator-editable)

LoRa is the telemetry radio (Phase 7 Q3). Defaults: 418 MHz, operator-editable per mission via `mission.optional_devices.radio.{band, tx_power_dbm}`. Any deselection of the radio requires a flight termination system to be declared (Decision 17).

### 7.8 Pyrotechnic Physical Security (Optional, On-Availability)

Physical key + arming switch exists in hardware as an optional accessory (Phase 7 Q4). When physically present, it is wired into the FIRE GPIO chain and the operator must turn the key for ARM to succeed. When absent, the FIRE chain still requires password + countdown confirmation in S15. The mission file declares `optional_devices.pyrotechnic_physical_security.present`.

### 7.9 STM32 Watchdog (Default 500 ms, Editable)

STM32L431 (Path A) and STM32H743 / H753 (Path B) run independent hardware watchdogs (IWDG) at a default timeout of 500 ms (Phase 7 Q5). The timeout is editable per mission via `hardware_mapping.yaml` field `flight_computer.watchdog_timeout_ms`. Watchdog is kicked from the flight loop's main task; if a kick is missed, the device resets.

### 7.10 Android–STM32 Link Watchdog (Default 2 s, Editable; on Timeout: Telemetry Error Report)

The Android-STM32 link watchdog (Path A only) has a default timeout of 2 s (Phase 7 Q6 / Phase 1.1 Q3). Editable per mission via `hardware_mapping.yaml` field `peripheral_link.timeout_s`. On timeout, the STM32L431:

1. Enters safe mode and de-arms the pyro.
2. Sends an error report by telemetry (`STM32 → radio → GCS`) describing the link-loss event with last-seen-Android timestamp.
3. Continues broadcasting its own health beacon at 1 Hz over the radio, even if Android is gone.
4. Holds the last commanded peripheral state until the link is restored.

### 7.11 Ethernet to GCS

Path A uses a USB-C to Ethernet adapter on the Snapdragon device (Phase 7 Q8). Path B uses the STM32H7xx built-in Ethernet MAC. Both expose TCP 5900 (MCTU) to the GCS over the on-premises LAN.

### 7.12 Android Failure Policy

If the Android device on Path A fails catastrophically in flight (brown-out, thermal shutdown, kernel panic), the STM32L431 detects the absence of heartbeat and:

1. Continues operating in safe mode (pyro disarmed).
2. Continues broadcasting its own health beacon over LoRa.
3. Sends an explicit `ANDROID_DEVICE_FAIL` MisPlot frame at 1 Hz with the last-known telemetry and a fail reason code.
4. The flight is unrecoverable on Path A; the GCS uses the STM32 beacon to track the rocket until impact.

On Path B, the analogous failure (STM32H7xx hardware fault) is unrecoverable; the independent black-box recorder (§12.5) provides the only post-flight evidence.

---

## Phase 8 — SIL

SIL is the first integration loop. All software components run together against the simulation engine; no physical hardware is involved.

### 8.1 What Is Tested in SIL

| Component | Objective | Success criterion |
|-----------|-----------|-------------------|
| Simulation engine | 6-DOF dynamics correctness | Analytic match within ±1 % |
| ESKF 15-state | Convergence | Position error < 2 m after 10 s |
| MHE | Refinement when enabled | Position-error reduction ≥ 20 % vs ESKF-only |
| IMM | Stage classification when enabled | ≥ 95 % classification accuracy across SEP transitions |
| PID / LQR / MPC etc. | Reference-tracking | Steady-state error < 1 % |
| Mixer | Allocation correctness | Moments match demand within ±5 % |
| Mixer saturation feedback | Limit enforcement | Cols 102 / 103 set when fin output is at limit; 0 otherwise |
| Gain scheduling | Smooth transitions | No `u` jump > 10 % across operating points |
| TLM encoding | Round-trip identity | Bit-exact MisPlot 77 B |
| MCTU TCP 5900 | GCS reception | Packet loss < 0.1 % |
| Fault injection | System handles failures safely | No crash; safe response per Phase 3.4 table |

### 8.2 SIL Loop Architecture (Shared Memory for SIL; gRPC for HIL)

```
+=============================================================+
|                   SIL Loop Architecture                     |
+=============================================================+

   +------------------+           +----------------------+
   | C++ Simulation   |           |  gnc-core            |
   | Engine           |           |  (running in host    |
   | (high or low     |           |   emulation)          |
   |  fidelity)       |           |  ESKF / MHE / IMM /  |
   |                  |           |  Control / Mixer     |
   | 6-DOF solver     |           |                      |
   +--------+---------+           +----------+-----------+
            |                                |
            |  Simulated IMU @ rate          |
            |  Simulated GPS @ 5 Hz          |
            |  ----- shared memory --------> |
            |                                |
            |  <----- shared memory -------- |
            |  Control commands @ rate       |
            |  (δ_1, δ_2, ..., δ_n)          |
            v                                v
   +------------------------------------------------+
   |  Logger and Visualiser                          |
   |  - Every variable, every timestep               |
   |  - Real-time plots                              |
   |  - Replay-able logs (HDF5 + CSV)                |
   +------------------------------------------------+
```

Inter-process communication: shared memory for in-process SIL on the host (Phase 8 Q3); gRPC for cross-machine HIL (§9). Time is simulated, not wall-clock; the harness can accelerate up to 100 ×.

### 8.3 Required Test Scenarios

#### 8.3.1 Baseline Tests

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Nominal launch — vertical, no wind, perfect GPS, perfect IMU | Apogee within ±3 % |
| 2 | Nominal launch with Dryden moderate wind | Deviation within ±5 % |
| 3 | IMU bias injection (`b_a = 0.05 m/s²`, `b_g = 0.01 rad/s`) | ESKF / MHE estimate within 30 s |
| 4 | GPS outage 10 s at `t = 15 s` | Dead-reckoning error < 20 m |
| 5 | Aggressive 15° pitch step in 0.5 s | Settles without overshoot > 20 % |
| 6 | Fin 2 stuck at +8° at `t = 20 s` | Mixer compensates; stability maintained |
| 7 | Monte Carlo envelope (default 1,000 runs; user-configurable in S11) — `mass ±5 %`, `CG ±2 cm`, `thrust ±3 %`, random wind, random IMU noise | CEP within rocket-specific spec |

#### 8.3.2 Multi-Target Validation Harness (Platform Acceptance Gate)

Platform acceptance is **all of (every committed rocket × {Path A, Path B} × envelope grid for the rocket)** passing within per-rocket Appendix C tolerances. The committed-rockets set comes from `release_manifest.yaml` at repo root; the envelope grid is generated per rocket from its template's declared envelope (≥ 8 cells per rocket).

```python
import yaml

with open('release_manifest.yaml') as f:
    manifest = yaml.safe_load(f)

for rocket in manifest['rockets']:
    rocket_id     = rocket['id']
    tolerances    = load_yaml(f'rockets/{rocket_id}/tolerances.yaml')
    golden_dir    = f'rockets/{rocket_id}/golden'
    envelope_grid = generate_envelope_grid(load_template(f'rockets/{rocket_id}/template.yaml'))

    for (label, golden_path, mission_overrides) in envelope_grid:
        for path in ['A', 'B']:
            tmpl    = load_template(f'rockets/{rocket_id}/template.yaml')
            mission = make_mission(flight_computer_path = path, **mission_overrides)
            our_log = run_v53_sim(tmpl, mission, hal=path, engine='high_fidelity')
            ref_log = load_h5(f'{golden_dir}/{golden_path}')
            result  = compare_logs(our_log, ref_log,
                                   tolerances=tolerances,
                                   comparison_modes=COMPARISON_MODES,
                                   logging_bug_cols=LOGGING_BUG_CATALOG)
            assert result.percent_in_tolerance >= 90.0, f'{rocket_id} {label} {path}'
            assert result.logging_completeness_target_met, f'{rocket_id} {label} {path}'
```

`generate_envelope_grid` produces ≥ 8 representative envelope cells per rocket, mixing target-ground-range sweeps with `guidance_reference_pitch_deg` sweeps anchored to that rocket's `mach_max` and `alpha_max_abs`. When a `(rocket, path, case)` combination falls in the 90–95 % range, it is accepted (Phase 8 Q8).

#### 8.3.3 Rocket-Specific Test Categories

Per-rocket scenario files under `rockets/<id>/scenarios.yaml` select the categories below that apply to the rocket and populate rocket-specific parameters. Categories are platform-level; they exist whether or not any *currently* committed rocket exercises them.

| Category | Purpose | Applies when |
|----------|---------|--------------|
| Canard sign inversion | Sign-convention correctness in mixer | Any rocket with `placement: canard` |
| Inertia anomaly handling | `Iyy_full < Iyy_dry` or other declared anomaly | Any rocket whose template declares the anomaly explicitly |
| Two-stage separation | Separation success + IMM mode transition | Any rocket with `num_stages ≥ 2` |
| Hypersonic envelope | Aero models valid at declared `mach_max`; Newtonian fallback above declared `alpha_range` | Any rocket with `mach_max ≥ 5` |
| Extended-α manoeuvre | High-α handling near `alpha_max_abs` | Any rocket with `alpha_max_abs ≥ 30°` |
| Unpowered upper-stage coast | Multi-stage architecture works without upper-stage motor | Any rocket whose terminal stage omits `propulsion` |
| Three-or-more-FINSET separation | Allocation under separation with ≥ 3 finsets | Any rocket with `len(fin_config.sets) ≥ 3` |
| Asymmetric inertia integration | Full 6-DOF without `Iyy = Izz` assumption | Any rocket whose template declares `Iyy ≠ Izz` |
| Servo failure mid-flight | Detection (current spike, no response, position error) per §5.9 | All rockets |
| Path A external IMU integration | `optional_devices.external_imu.present = true` flow | All rockets on Path A with external IMU declared |
| GPS outage 10 s | Dead-reckoning error bound | All rockets |

#### 8.3.4 MHE Opt-in Validation Run (Phase 8 Q5)

For at least one target per path (e.g. 124 km), an `mhe.enabled = true` run is added to the harness and validated against the same golden log. The run is opt-in per mission and is included in Tier 3 nightly when scheduled by the operator.

#### 8.3.5 Controller-Type Fixture Matrix (Synthetic Rockets)

When the committed-rockets set in `release_manifest.yaml` does not exercise a controller type that the platform supports, the synthetic-rocket fixtures in `rockets/_synth/` keep the controller-type implementation under continuous SIL. Synthetic rockets do **not** fly and are not required to have golden logs that match real flight; their job is to exercise the algorithm path.

| Synthetic | `controller_type` | What it tests |
|-----------|-------------------|---------------|
| `_synth/synth_tvc` | `tvc` | `TVCActuator` 2-DOF integration; mixer for TVC; `direct_map_with_saturation_projection` allocation |
| `_synth/synth_coldgas` | `cold_gas` | `ColdGasThruster` discrete-pulse dynamics; `bang_bang_pwm` allocation |
| `_synth/synth_hybrid` | `hybrid` | `HybridActuator` composition; `blended_weighted_ls_with_priority` allocation |

Tier 3 SIL runs the synthetic fixtures nightly. A failure on a synthetic fixture blocks merge of any change to the corresponding actuator / allocation source. The synthetic fixtures are SIL-only and never enter the §8.3.2 acceptance harness.

### 8.4 SIL Infrastructure (GoogleTest; Nightly Multi-Target Harness)

| Concern | Choice |
|---------|--------|
| Unit tests for `gnc-core` | GoogleTest on host CI |
| Python harness scripts | pytest + hypothesis (property-based) |
| Cross-process IPC | Shared memory (SIL) / gRPC (HIL) |
| Time | Simulated, not wall-clock; pause / step / 10–100 × accelerate |
| Determinism | Fixed RNG seed per scenario; same inputs → bit-exact outputs |
| Logging | HDF5 per simulation (every variable, every step); JSON metadata |
| Dashboards | Grafana + Prometheus |

CI integration:

- Tier 1 (every PR commit): `gnc-core` unit tests on host. < 5 min.
- Tier 2 (every PR commit): build Path A and Path B; smoke tests; HAL leak check.
- Tier 3 (nightly + on-demand): full multi-target SIL across `N committed rockets × 2 paths × ≥ 8 cases per rocket` (parametrised per `release_manifest.yaml`); parity comparison; MHE opt-in run; Monte Carlo (operator-set count). 30–60 min.

### 8.5 System Acceptance Criteria

A single set of criteria; applied to every rocket in `release_manifest.yaml`.

#### Platform acceptance (committed rockets × Path A × Path B)

- Every committed rocket has all four §0.3.3 artefacts present (golden logs, tolerances, scenarios, onboarding report).
- All §8.3.2 multi-target validation runs pass: every `(rocket, path, case)` triple has `percent_in_tolerance ≥ 90 %`.
- Logging completeness target met per the per-mission `logging_completeness_target` (default 1.0).
- Saturation flags (cols 102, 103) populated correctly when actuator limits are hit.
- `gnc-core` algorithm output matches between Path A and Path B within parity tolerance for every rocket.
- All §8.3.1 baseline scenarios (1–7) pass on the rocket's primary path.
- All applicable §8.3.3 categories pass on the rocket per its `scenarios.yaml`.
- All §8.3.5 synthetic-fixture runs pass (controller types covered by SIL even when no committed rocket exercises them).
- Monte Carlo CEP within per-rocket specification at the 95th percentile.
- Code coverage > 80 % for new code paths added by any rocket's onboarding.
- No memory leaks under Valgrind / AddressSanitizer on host CI.
- All tests finish within their tier time limit.
- ≥ 1 successful flight per path on at least one committed rocket; dual-path parity ≥ 90 % per rocket post-flight.

### 8.6 Replay Mechanism — Design (recommendation)

The replay mechanism reproduces a scenario from a log exactly, including stochastic elements and hardware quirks. Specification:

#### Seed capture

Every simulation declares a single root seed (`mission.replay.seed`). The seed seeds a deterministic PCG64 generator. From it, sub-streams are derived:

```
root_seed
  ├─ wind_seed       (Dryden / Von Karman noise stream)
  ├─ imu_seed        (IMU bias / noise / drift)
  ├─ gps_seed        (GPS jitter and lag)
  ├─ thrust_seed     (thrust oscillation)
  ├─ atmosphere_seed (density / temperature deviations)
  └─ fault_seed      (random fault injection schedule when enabled)
```

Sub-stream derivation uses `splitmix64(root_seed, fixed_id)` so they are deterministic functions of the root.

#### Deterministic random stream

`gnc-core/random/PCG64.h` provides the canonical stream. All Monte Carlo and simulation use this generator. Wall-clock and OS RNGs are forbidden inside `gnc-core`; CI fails on any `<random>` `std::random_device` usage in `gnc-core/`.

#### Timestamp alignment

Every log entry carries `t_ns` (monotonic ns from launch command) and `seed_id` (which sub-stream produced any randomness on this row). Replay aligns by `t_ns`; OS-time drift is ignored.

#### Fault re-injection

Every scheduled fault is recorded in the events stream with `(t_ns, fault_name, params, sub_seed)`. Replay reads the events stream and calls `sim.injectFault()` at the recorded times with the recorded params, using the recorded sub-seed for any randomness.

#### Hardware-model versioning

Every log records the SHA-256 of the resolved `actuator_library.yaml` and `controller_library.yaml` snapshots, plus the `engine_version` of the simulation engine. Replay refuses to run if any snapshot or engine version has changed; the operator must explicitly request "best-effort replay" with a different version, which is logged.

#### Replay command

```bash
gnc-tools/replay --log <flight_log.h5> \
                 --output <replay_log.h5> \
                 [--engine high_fidelity|low_fidelity_fast] \
                 [--allow-version-mismatch]
```

Output is an HDF5 log identical to the input within FP precision (bit-exact when seed and snapshots match). Path A vs Path B parity failures are debugged by replaying both paths from the same seed and comparing column-by-column.

---

## Phase 9 — HIL

HIL is the bridge between SIL and flight. Real flight hardware runs the same code that will fly; the rocket "flies" against the simulation engine.

### 9.1 Why HIL After SIL

SIL is software-only with perfect timing. HIL exposes timing jitter, USB / CAN driver bugs, thermal throttling, brown-out behaviour, JNI race conditions and per-device characteristics. The HIL bench is also where path parity is stress-tested: same scenario, two completely different toolchains and runtimes.

### 9.2 HIL Bench Architecture (Two Benches, In-House)

```
+==============================================================+
|                  HIL Bench Topology (per path)                |
+==============================================================+

   +--------------------------+
   | HIL Host (PC)            |
   |                          |
   | +-----------------------+|
   | | C++ Simulation Engine ||
   | |                       ||
   | | Physics @ 1 kHz       ||
   | | Sensors @ rates       ||
   | +---------+-------------+|
   +-----------|--------------+
               |
               |  Simulated IMU / GPS
               |  over USB-Serial or Ethernet (gRPC)
               v
   +----------------------------------------------+
   |  REAL Flight Computer                         |
   |  Path A: Snapdragon 845 + STM32L431           |
   |  Path B: STM32H743 / H753                     |
   |  Running gnc-core + path-specific HAL impl    |
   +----------+----------+---------+---------------+
              |          |         |
         CAN / FDCAN   USB OTG  USB OTG
              |          |         |
              v          v         v
      +------------+ +--------+ +-----------+
      | REAL Servos| | Sim'd  | | Real CAN  |
      | XQPOWER    | | GPS    | | adapter   |
      | + Encoders | | (PL2303)| |           |
      +-----+------+ +--------+ +-----------+
            |
            | Position feedback (encoders)
            v
      +------------------+
      | HIL Host         |
      | (loop closure)   |
      | reads fin pos    |
      | feeds back into  |
      | physics simulator|
      +------------------+
```

Two benches are built in-house (Phase 9 Q1). Servo procurement is assumed already-on-hand (Phase 9 Q7). Both benches use identical safety provisions (Phase 9 Q4).

### 9.3 Required Components

| Component | Function | Quantity per bench |
|-----------|----------|--------------------|
| Powerful PC (16 cores+) | Run real-time simulation | 1 |
| Flight computer | Path A: Snapdragon tablet; Path B: STM32H743 / H753 dev board | 1–2 (incl. backup) |
| STM32L431CCT6 dev board | Peripheral controller (Path A bench only) | 1–2 |
| XQPOWER servos | Actuators | up to 12 (SA) |
| Test jig / mount | Fix actuators in place | 1 set |
| Servo encoders | Measure actual position; XQPOWER provides them (Phase 9 Q2) | 1 per servo (0.05° accuracy) |
| CAN adapter | Servo communication | 2 (primary + backup) |
| Powered USB hub | Aggregate USB devices | 1–2 |
| Oscilloscope (4-channel) | Inspect CAN waveforms | 1 |
| CAN analyser | Record + analyse traffic | 1 |
| Programmable PSU | Simulate sag / drop | 1 |
| Servo load bank | Aerodynamic load simulation; required for production rockets (Phase 9 Q5) | 1 set |
| Ethernet switch | Connect HIL host + flight computer | 1 |
| Cabling | Custom wiring | n/a |
| Emergency stop, fuses, enclosures | Safety provisions | 1 set per bench |
| Separate dev / flight board sets | Avoid damaging flight hardware (Phase 9 Q8) | 1 set per bench |

### 9.4 Progressive HIL Phases (9A, 9B, 9C, 9D)

| Phase | Scope | Tests |
|-------|-------|-------|
| 9A — Soft-HIL | Flight computer only, no real CAN | JNI / wrapper correctness; thread timing; race conditions |
| 9B — Single servo | Flight computer + 1 XQPOWER servo on real CAN | CANOpen protocol; servo response time; encoder feedback; error handling |
| 9C — 4 servos | Full configuration for BA / ES_273 | Mixer on real hardware; sub-millisecond servo synchronisation; CAN bus < 50 % utilisation; thermal under continuous load |
| 9D — 8–12 servos | Full for GH and SA | CAN bus under high load; allocation in real time; failure injection (remove a servo → redistribution); heat management |

### 9.5 Mandatory HIL Scenarios (Configurable Catalog)

The HIL scenario catalog is configurable; the operator can add new scenarios for both automated and manual test runs (Phase 9 Q3). The shipped baseline:

| Scenario | Focus | Success criterion |
|----------|-------|-------------------|
| Cold start | Boot time | Ready < 30 s |
| Sensor init | IMU calibration, GPS fix | Nominal < 60 s |
| Servo sweep | Per servo −25° → +25° | Smooth, no missed frames |
| Full mission replay | BA flight from start | Identical to SIL within 1 % |
| USB disconnect | Remove PL2303 mid-flight | Graceful reconnect |
| CAN error injection | Erroneous frames | Error recovery |
| Power sag | 20 % voltage drop | Warning + continue |
| CPU stress | Heavy task alongside flight loop | Rate maintained |
| Long-duration | 2 h continuous | No memory growth |
| Temperature cycle | −10 °C to +50 °C | Stable operation |
| External IMU mismatch | Operator declared mismatch | Pre-launch fail with clear error |
| Saturation flag round-trip | Drive fins to limit | Cols 102 / 103 set; fed back into next mixer cycle |

Scenario automation is set per mission (regression suite size is user-configurable; Phase 9 Q6).

### 9.6 HIL Analysis Tools

| Tool | Use |
|------|-----|
| CAN analyser software | Inspect each frame and its state |
| Wireshark + USBpcap | USB bulk transfers |
| Android Studio Profiler | CPU / memory / GPU on Snapdragon |
| `perfetto` / `systrace` | Android timing |
| Logic analyser (Saleae) | GPIO timing on STM32 |
| SWO / RTT viewer | STM32H7xx trace |
| Grafana + InfluxDB | Real-time dashboards |
| HDF5 + Python | Post-test analysis |

### 9.7 Path Parity Testing (User-Selectable Tolerance per Scenario)

HIL parity testing runs identical scenarios on both benches and compares logs. The parity tolerance is user-selectable per scenario (Phase 9 Q9) via `gnc-hil/parity_tolerances.yaml`. The defaults match the Appendix C bands but the operator can tighten or loosen per scenario.

A parity FAIL triggers automatic replay of both paths from the same seed using the §8.6 replay mechanism so the divergence can be located column by column.

### 9.8 Bench Safety

Each bench includes:

- Hardwired emergency stop (mushroom button) on a separate circuit; cuts servo power.
- Polyfuses on each servo channel.
- Acrylic enclosure around the actuator jig.
- Visible interlocks before energising.
- Operator badge + buddy system before any high-power test.
- Fire extinguishers within 3 m of each bench.
- LiPo storage in metal cabinets when not in use.

---

## Phase 10 — Firmware Flashing and Deployment

### 10.1 Layers to Flash (per path)

| Layer | Path | Content | Approx size | Update method |
|-------|------|---------|-------------|---------------|
| STM32L431 peripheral firmware | Path A only | C firmware: telemetry radio, FIRE GPIO, USB-CDC, watchdog | 50–100 KB | SWD (debugger) / DFU (USB) |
| Android app (`gnc-android`) | Path A only | NativeActivity + JNI + `gnc-core` + Path A HAL impl | 30–80 MB | Direct APK install |
| STM32H743 / H753 flight firmware | Path B only | C/C++ firmware: `gnc-core` + Path B HAL impl + FreeRTOS main | 500 KB – 2 MB | SWD / DFU only — **no CAN OTA** |
| Seeker co-processor app | Path B + seeker | Linux app: CarTracking4 fork + tflite + camera driver | 50–200 MB | SSH push / Docker |
| Ground station | Both | Web UI + Backend services | 50–500 MB | Docker Compose / Kubernetes |

### 10.2 STM32 Firmware Flashing (Custom Bootloader; No CAN OTA — Ethernet via USB-C Only)

Custom bootloader is built from scratch; Zephyr MCUboot is not used (Phase 10 Q1). CAN OTA is **removed** entirely from the system; firmware updates travel only over Ethernet (Path B native; Path A via the USB-C to Ethernet adapter) — Phase 10 Q2.

#### Path A — STM32L431CCT6 specs

```
ARM Cortex-M4 @ 80 MHz, Flash 256 KB, RAM 64 KB,
1 × CAN 2.0B, 2 × UART, 3 × SPI, 3 × I2C, 64 GPIO, LQFP48.
Responsibilities: telemetry radio + FIRE GPIO + aux I/O + watchdog.
No flight code.
```

#### Path B — STM32H743 / H753 specs

```
ARM Cortex-M7 @ 480 MHz, Flash 1–2 MB, RAM 512 KB – 1 MB,
single + double FPU, 2 × FDCAN (CAN-FD), Ethernet MAC,
integrated IMU.
Responsibilities: gnc-core flight loop + ESKF + (optional MHE) +
control + mixer + actuator dynamics + radio + pyro + Ethernet.
```

#### Available flashing methods

| Method | Tool | Speed | Reliability | When to use |
|--------|------|-------|-------------|-------------|
| SWD | ST-Link v3 + STM32CubeProgrammer | Fast (~10 s) | High | Daily development |
| DFU (USB) | System bootloader | Medium (~30 s) | High | Field update (no debugger) |
| UART ISP | BOOT0 + serial | Slow | Medium | Fallback |

#### Flash memory layout (256 KB STM32L431 example; adapt for H743 1 MB / H753 2 MB)

```
+---------------------------------+ 0x08000000
|  Bootloader (16 KB)             |
|   - DFU handler                 |
|   - Flash write routines        |
|   - Code-signing verification   |
+---------------------------------+ 0x08004000
|  Config block (4 KB)            |
|   - Device ID                   |
|   - Calibration                 |
|   - Current FW version          |
|   - Public key (signing)        |
+---------------------------------+ 0x08005000
|  Slot A (active firmware)       |
|   112 KB on L431; 256 KB on H7  |
+---------------------------------+
|  Slot B (pending or rollback)   |
|   112 KB on L431; 256 KB on H7  |
+---------------------------------+
|  Logs and crash dumps (12 KB)   |
+---------------------------------+
```

#### Dual-slot + rollback

```
1. Operator pushes new FW via DFU over USB-C Ethernet path
2. Bootloader writes Slot B; verifies SHA-256 + signature
3. On success: set "try Slot B" flag; reboot
4. Bootloader boots Slot B; if heartbeat OK within 30 s: confirm Slot B
5. If no heartbeat: roll back to Slot A; alert GCS
6. If signature / SHA-256 fails: keep Slot A; request retransmit
```

Rollback is exercised periodically (Phase 10 Q6) — included in Tier 3 nightly with a synthetic broken FW that intentionally fails to send the heartbeat.

#### Code signing (Phase 10 Q8)

A small PKI signs every STM32 firmware image. Keys live in the offline HSM. The bootloader holds the public key and verifies the signature before booting any image. The CI release pipeline triggers a manual signing step; operators cannot bypass.

### 10.3 Android App Deployment (Direct APK; Manual CI Build Trigger)

```
Android app structure:
  app/
    src/main/
      kotlin/                     # UI layer (Compose)
      cpp/                        # Native code (gnc-android wrapper)
        CMakeLists.txt
        gnc-bridge/               # JNI bridge to gnc-core
        libusb_src/
      AndroidManifest.xml
      jniLibs/
        arm64-v8a/
          libcasadi.so
          libipopt.so
          libgnc-core.so          # main code
        armeabi-v7a/
    assets/
      gnc_data/
        ...                       # config files
```

Distribution is direct APK only — Google Play is not used (Phase 10 Q3). APK signing uses a release key held offline.

CI builds APKs on demand only; merges to main do **not** trigger an automatic APK build (Phase 10 Q7). The release engineer triggers a CI workflow manually after sign-off.

### 10.4 Ground Station Deployment (Kubernetes and Docker Compose Both Supported)

Both Kubernetes and Docker Compose are supported (Phase 10 Q4). Production runs on-premises Kubernetes (k3s); development and SIL run Docker Compose. No cloud (Phase 10 Q5).

`docker-compose.yml` (development / SIL):

```yaml
services:
  backend:
    image: rocket-backend:5.2.0
    ports:
      - "8000:8000"   # REST API
      - "8001:8001"   # WebSocket
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      - DATABASE_URL=postgresql://gnc:gnc@postgres:5432/gnc
      - TIMESCALE_URL=postgresql://gnc:gnc@timescaledb:5432/telemetry
    depends_on:
      - postgres
      - timescaledb
      - keycloak

  frontend:
    image: rocket-frontend:5.2.0
    ports: ["3000:80"]
    depends_on: [backend]

  cad-converter:
    image: rocket-cad-converter:5.2.0
    volumes: ["./cad:/cad"]

  mctu-bridge:
    image: rocket-mctu-bridge:5.2.0
    network_mode: host          # for TCP 5900

  postgres:
    image: postgres:15-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment: ["POSTGRES_DB=gnc"]

  timescaledb:
    image: timescale/timescaledb:latest-pg15
    volumes: ["tsdata:/var/lib/postgresql/data"]

  keycloak:
    image: quay.io/keycloak/keycloak:latest
    ports: ["8080:8080"]
    command: start-dev

  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]

  grafana:
    image: grafana/grafana:latest
    ports: ["3001:3000"]

volumes:
  pgdata:
  tsdata:
```

Kubernetes deployment (production) lives under `gnc-backend/k8s/` with one Deployment / Service per component plus a NetworkPolicy that pins all traffic to the on-premises LAN.

### 10.5 Versioning System

Semver: `MAJOR.MINOR.PATCH`. Compatibility matrix:

```
stm32_fw_v2.x      -> android_v1.5+
android_v1.8+      -> backend_v3.0+
backend_v3.2+      -> frontend_v3.2+   (frontend tied to backend)
```

Pre-deployment compatibility check rejects any incompatible combination.

### 10.6 Rollback Testing (Periodic)

Rollback is tested in Tier 3 nightly with a synthetic broken firmware build (no heartbeat). The harness pushes the broken image, observes the bootloader fall back to Slot A, and verifies the rocket reports the rollback event. Failure of this test fails the nightly pipeline.

### 10.7 Code Signing (STM32 Firmware PKI)

Small PKI:

- Root CA (offline HSM, signed once).
- Intermediate CA (offline HSM, signed quarterly).
- Firmware signing key (offline HSM, used on each release).
- Bootloader holds the root public key.

Signing is a manual step in the release pipeline; CI cannot push an unsigned image.

---

## Phase 11 — Pre-Launch Procedures

The pre-launch checklist is the highest-stakes procedure on launch day. Every item is automatable when possible, documented and ownership-assigned.

### 11.1 Timeline

| T- | Activity | Duration | Owner |
|----|----------|----------|-------|
| T-24 h | Weather check | 15 min | PM |
| T-12 h | Final hardware assembly | 3 h | HW + ME |
| T-4 h | Full system check | 30 min | QA |
| T-2 h | Team arrival at launch site | — | PM |
| T-90 min | Install rocket on launch rail | 30 min | HW |
| T-60 min | Power-on check | 15 min | EE + HW |
| T-45 min | GPS fix acquisition | 10–20 min | NE |
| T-30 min | IMU calibration (stationary) | 5 min | NE |
| T-25 min | CAN bus health check | 5 min | HW |
| T-20 min | Servo sweep test (without load — Phase 11 Q4) | 3 min | EE + CE |
| T-15 min | Telemetry link verification | 5 min | SA |
| T-10 min | Final weather check | 2 min | PM + SE |
| T-8 min | Team evacuation to safe distance | 5 min | SE |
| T-3 min | ARM sequence initiation | 1 min | SE + PM |
| T-60 s | Final readiness confirmation | 30 s | All |
| T-10 s | Countdown start | 10 s | System automated |
| T-0 | LAUNCH | instant | System |

The pre-launch checklist exists in both digital and paper forms (Phase 11 Q2). The digital form drives the system-side checks; the paper form is signed by the operator at every gate. Evacuation drill is not practiced (Phase 11 Q6).

### 11.2 Hardware Checklist

| # | Item | Method | Acceptable result |
|---|------|--------|-------------------|
| H01 | Main battery voltage | Multimeter | > 7.2 V (LiPo 2S) |
| H02 | Main battery capacity (rested) | Tester | > 80 % SOC |
| H03 | Pyrotechnic battery voltage | Multimeter | > 8.5 V (LiPo 3S) |
| H04 | All cable connections | Visual + tug test | All secure |
| H05 | DB9 connectors seated | Visual + screw | Fixed with screws |
| H06 | XT60 connectors | Visual | Correctly oriented |
| H07 | DC-DC converters temperature | IR thermometer | < 50 °C at idle |
| H08 | Servo mounting bolts | Torque wrench | Specified torque |
| H09 | Servo arm zero position | Visual + software | Each fin at 0° ± 0.5° |
| H10 | CAN bus termination (120 Ω) | Multimeter | 60 Ω between H and L |
| H11 | USB cables strain relief | Visual | No strain on connectors |
| H12 | Ground wire continuity | Multimeter | < 1 Ω |
| H13 | Antenna SWR | SWR meter | < 1.5 |
| H14 | GPS antenna sky view | Visual | No obstructions |
| H15 | Launch rail levelness | Bubble level | ± 0.5° max |

### 11.2.5 USB Auto-Scan and Auto-Assign on Startup

Close-integration plan Table 1 #2. Before any S01–S24 software check runs, the GCS executes a USB auto-scan that resolves every connected device to a `UsbDeviceRole` (§7.3.4) automatically. The operator no longer needs to know which port a device landed on; first-time bench setup drops from minutes to seconds.

**Trigger.** Auto-scan runs:

- At backend boot.
- When the operator opens S5 (Mission Configuration) or S13a (Routing Manager, §6.4.7).
- On every USB hot-plug event reported by `udev` (Linux), `MTP` (Android `BroadcastReceiver`), or `RegisterDeviceNotification` (Windows).

**Algorithm.**

1. Enumerate USB devices through the platform's standard API (Linux `libusb`, Android `UsbManager`, Windows `SetupDi`).
2. For each device, read VID, PID and serial number.
3. Look up the (VID, PID) tuple in `schemas/android_usb_roles.yaml` to obtain the *suggested* `UsbDeviceRole`.
4. Cross-check `gnc_device_assignments.json` (§7.3.13) for a cached row matching the (VID, PID, serial). If found, the cached role takes priority over the suggestion (the operator has already disambiguated).
5. If the cached row's port differs from the current port, mark the row `port_changed`; the row is still trusted but logged.
6. For devices whose VID/PID has multiple plausible roles (e.g. CH9102X may be `EXT_IMU` or `CAN_CH340`), the auto-scan refuses to guess and surfaces the ambiguity in S13a as a *required* manual choice. The flight loop will not enter pre-launch with an unresolved ambiguity.
7. CAN bridges trigger the §7.3.11 protocol auto-probe before the role is finalised.

**Output.**

- A populated `gnc_device_assignments.json` (§7.3.13).
- A reconciliation report against `hardware_mapping.yaml`: any device that contradicts the canonical mapping appears as a *warning* in S13's status bar and as a row in S13a; CI release is gated on `yaml_patch_pending = false`.
- An entry in the audit log (§1.7) recording the timestamp, host fingerprint, and the resolved role for every device.

**Authority.** Auto-scan never silently overrides `hardware_mapping.yaml`. The flight loop continues to read roles from the canonical YAML at lock time; the auto-scan output only accelerates the bench / ground-tool sessions and pre-fills the routing dialog. This implements close-integration plan Table 3 row 2 directive verbatim.

### 11.3 Software Checklist (Path-Aware, S01–S24)

| # | Item | Path | Acceptable result |
|---|------|------|-------------------|
| S01 | Mission file loaded; `flight_computer_path` matches connected hardware | Both | Path matches detected device — mission rejected otherwise |
| S02 | STM32L431 peripheral firmware version matches | A only | Expected SHA-256 |
| S03 | Android app version matches | A only | Expected version |
| S04 | STM32H743 / H753 flight firmware version matches | B only | Expected version + variant declared in `hardware_mapping.yaml` |
| S05 | Seeker co-processor app version matches (when seeker enabled) | B + seeker | Reachable on local network; expected version |
| S06 | Flight loop reports "ready" | Both | Heartbeat received |
| S07 | Template loaded matches rocket | Both | ID match + SHA-256 match |
| S08 | Actuator library loaded; all fin slots resolve (C14) | Both | No unresolved `actuator_ref` |
| S09 | Controller library loaded; all stage `controller_ref` resolve (C22) | Both | No unresolved entries |
| S10 | Mission parameters within rocket envelope | Both | Pass |
| S11 | Loop rate locked | Both | Path A: 50–200 Hz; Path B: 100–500 Hz; matches mission file |
| S12 | ESKF converged | Both | Stationary for 60 s+ |
| S13 | MHE running (when enabled) | Both | Path A: `N=10`, 10 Hz default; Path B: `N=5`, 5 Hz default; or user override |
| S14 | GPS fix quality | Both | RTK or SBAS, ≥ 8 satellites (Phase 11 Q7) |
| S15 | IMU biases within normal range | Both | `b_a < 0.1 m/s²`, `b_g < 0.01 rad/s` |
| S16 | CAN bus error rate | Both | < 0.01 % |
| S17 | All servos responsive to test commands | Both | Position match ± 0.5° |
| S18 | Saturation flags zero in idle | Both | Cols 102 = 0; col 103 = 0 |
| S19 | Telemetry link quality | Both | RSSI > −70 dBm |
| S20 | Logs writing enabled per `logging_profile` | Both | Free space > 1 GB; configured columns being written; placeholder zeros only on intentionally-omitted columns |
| S21 | Clock sync (NTP / GPS) | Both | Drift < 10 ms |
| S22 | All watchdogs enabled; external IMU verification matches declared | Both (S22 IMU verify is Path A only) | Heartbeat confirmed; declared `external_imu.present` matches probe |
| S23 | Path A: T_cpu < 70 °C after 10 min idle | A only | Snapdragon thermal headroom check |
| S24 | Path B: T_cpu < 60 °C after 10 min idle | B only | STM32H7xx thermal headroom check |

**Live S13 Hardware Health Monitor extensions (close-integration plan Table 1 #3 / #8 / Table 3 #3).** While the §11.3 list runs, screen S13 (§6.2) maintains a status bar with two new live counters and a hotplug rescan ticker:

- **Per-port TX/RX throughput.** For every connected USB / CAN / UART port, S13 displays the rolling 1 s TX bytes/s and RX bytes/s. Operators spot a dead servo (TX rises, RX flat) or a chattering bus (RX bursts) instantly. The CAN-bus utilisation budget remains clause C25 (< 70 %); the per-port byte-rate column complements the aggregate utilisation reading because a *silent failure* does not move the utilisation needle.
- **5 s hotplug rescan.** Every 5 seconds the backend re-runs the USB enumeration of §11.2.5. A topology change (device added or removed) is surfaced in S13 within 5 s and triggers a fresh diff against `hardware_mapping.yaml`. **Auto-NO-GO at S22**: once the launch state machine is past T-3 min (§12.1), any topology change reported by the rescan is escalated to a NO-GO at S22 and the SE / QA hold automatic veto until the operator re-runs the pre-launch sequence from S01.

Both features are read-only telemetry surfaces and never change flight-loop behaviour. They are the two most-used CloseUI capabilities folded into the operator UI per the close-integration plan; raw-byte terminal panes (CloseUI Drop-table item 1) remain a developer-only debug tool, not part of S13.

### 11.4 Functional Tests

#### 11.4.1 Servo Sweep (Without Load)

The servo sweep runs without aerodynamic load (Phase 11 Q4). v5.4 adopts a **broadcast-first** sweep (close-integration plan Table 1 #7 and Table 3 #1): the default mode commands every fin in parallel through a CAN broadcast, runs in ~3 s for any rocket count, and falls back to the v5.3 sequential sweep if the broadcast acceptance criterion is not met. SA's 12-fin sweep drops from `n × 3 s = 36 s` to ~3 s, and the broadcast pathway doubles as the platform's *all-fins-to-neutral* emergency command in the launch state machine.

```python
def servo_sweep_test(mode="broadcast"):
    """
    mode = "broadcast" (default, ~3 s)
         | "sequential" (fallback, n × 3 s)
    Per-fin pass / fail is logged in either mode (close-integration
    plan Table 3 row 1).
    """
    if mode == "broadcast":
        ok = _sweep_broadcast()
        if ok:
            return
        log.warning("broadcast sweep inconclusive; reverting to sequential")
    _sweep_sequential()


def _sweep_broadcast():
    """Issue a single broadcast SDO per setpoint; read back per-fin position."""
    results = {}
    for angle in [-20.0, +20.0, 0.0]:
        send_can_broadcast_setpoint(angle)   # CAN ID 0x000 + SDO write
        sleep(1.0)
        for fin_idx in range(n_fins):
            actual = read_can_pos(fin_idx)
            ok = abs(actual - angle) < 0.5
            results.setdefault(fin_idx, []).append((angle, actual, ok))
    # Pass only if every fin reported within tolerance for every setpoint.
    return all(all(r[2] for r in fin_results)
               for fin_results in results.values())


def _sweep_sequential():
    for fin_idx in range(n_fins):
        send_can_cmd(fin_idx, -20.0); sleep(1.5)
        assert abs(read_can_pos(fin_idx) - (-20.0)) < 0.5

        send_can_cmd(fin_idx, +20.0); sleep(1.5)
        assert abs(read_can_pos(fin_idx) - (+20.0)) < 0.5

        send_can_cmd(fin_idx, 0.0); sleep(1.5)
        assert abs(read_can_pos(fin_idx)) < 0.5

    # All in parallel — rapid commands
    for angle in [-10, +10, 0]:
        for fin_idx in range(n_fins):
            send_can_cmd(fin_idx, angle)
        sleep(0.5)
```

**Authority gate (close-integration plan Drop-table item 3).** A bare broadcast call without authority check is *not* adopted. The broadcast SDO is rejected by the launch state machine outside the *Bench-Test* and *Pre-Launch → servo sweep* states; the launch state machine is the single arbiter of when broadcast commands may leave the GCS, in keeping with the existing 2-key ARM and hardware switch (§12.1).

#### 11.4.2 Emergency Abort Test

```python
def abort_test():
    arm()
    # ... during simulated countdown
    press_abort()
    assert all_servos_neutral()
    assert fire_disabled()
    assert pyro_disarmed()
    assert "ABORT" in recent_logs
```

### 11.5 GO / NO-GO Decision (SE and QA Hold Veto Jointly)

| Role | Veto / Recommendation | Notes |
|------|------------------------|-------|
| PM | Recommendation | General management, scheduling, weather |
| SE | **Veto** | Decision is binding (Phase 11 Q1) |
| QA | **Veto** | System check passed, all checks complete (Phase 11 Q1) |
| NE | Recommendation | GPS fix, ESKF converged |
| EE | Recommendation | Firmware ready, STM32 healthy |
| HW | Recommendation | Hardware ready, no defects |
| SA | Recommendation | System integration verified |
| Operator | Execution | Presses launch button only |

If SE or QA says NO-GO, launch stops immediately. No pressure, no override.

### 11.6 Safety Distance (100–500 m, Rocket-Dependent)

The safety distance is per-rocket inside `100 m – 500 m+` (Phase 11 Q3). Per rocket:

| Rocket | Safety distance |
|--------|-----------------|
| BA | 100 m |
| ES_273 | 100 m |
| GH | 500 m |
| SA | 300 m |
| Customer rockets | Per-rocket — declared in `template.safety.distance_m`; bounded `[100, 500]` |

### 11.7 Weather Constraints (Per-Rocket Tables)

Per-rocket weather constraint tables are declared in `template.environment.constraints` (Phase 11 Q5):

```yaml
environment:
  constraints:
    max_wind_speed_m_s: 8.0
    max_wind_gust_m_s: 12.0
    temperature_min_C: -10
    temperature_max_C: 45
    humidity_max_pct: 95
    visibility_min_m: 2000
    cloud_ceiling_min_m: 500
    no_lightning_within_km: 30
```

S5 reads these and the live weather feed and rejects any out-of-range condition.

### 11.8 GPS Fix Requirement (RTK or SBAS Acceptable)

Either RTK or SBAS is acceptable (Phase 11 Q7). The mission file declares the minimum acceptable quality via `optional_devices.gps.fix_quality_required` (`RTK_ONLY` | `RTK_OR_SBAS`).

### 11.9 Dry-Run Policy (Optional Full or Fast Dry-Run)

A dry run is optional and the operator selects between `full` and `fast` (Phase 11 Q8) via `mission.dry_run` field:

| Mode | Description |
|------|-------------|
| `none` | No dry run (default) |
| `fast` | Hardware checklist + servo sweep + telemetry link only (~10 min) |
| `full` | Full timeline replayed up to `T-3 min` without ignition (~90 min) |

---

## Phase 12 — Launch and Operations

### 12.1 Launch Sequence

```
T-10.0 s: Automated countdown start
          - STM32 / H7xx enters "pre-ignition" mode
          - Last moment for ABORT

T-5.0 s:  Ignition sequence initiated
          - FIRE signal primed
          - Operator cannot cancel (use ABORT)

T-0.5 s:  Ignition command to pyro
          - CAN message 0x405 to STM32 (Path A) /
            direct GPIO (Path B)
          - GPIO FIRE = HIGH

T-0.0 s:  Ignition (motor start)
          - Thrust builds in 10–50 ms
          - Liftoff detected (accel > 2g for 20 ms)

T+0.0 s:  Liftoff event
          - "LIFTOFF" event logged
          - Full telemetry @ 50 Hz
          - All systems in flight mode

T+0.1 s:  Rails cleared (typical)
          - Servos engaged
          - Control loop active

T+Burn:   Main burn (BA: ~4 s; GH stage 1: ~8 s)
          - Continuous feedback control
          - MHE correction every 1 s when enabled
          - IMM mode tracking when enabled

T+Coast:  Coasting
          - Thrust = 0
          - Aerodynamic control only

T+Sep:    Stage separation (multi-stage only)
          - Separation event detection
          - IMM mode switch
          - Stage 2 ignition (if powered) OR direct C2 mode
            (unpowered upper stage, e.g. SA)

T+Apogee: Maximum altitude

T+Descent: Descent

T+Impact: End of mission
          - "IMPACT" event logged
          - Final logs written
          - Post-flight analysis can begin
```

In-flight ABORT after liftoff is **not** available (Phase 12 Q2). A Range Safety System / Flight Termination System is not built for v5.2 (Phase 12 Q1) — declared via `optional_devices.flight_termination_system.present` only when supplied externally.

### 12.2 In-Flight Monitoring (Thresholds Derived from SIL/HIL Runs)

Live monitoring thresholds are derived from SIL / HIL runs (Phase 12 Q4). Defaults shipped per template; updated from each flight's data.

| Parameter | Normal | Warning (yellow) | Critical (red + alert) |
|-----------|--------|------------------|------------------------|
| Altitude | < expected + 10 % | 10–20 % above | > 20 % above |
| Velocity | typical curve | ±15 % deviation | ±30 % |
| Pitch angle | ±45° from plan | ±60° | ±75° |
| Alpha | < 15° | 15–20° | > 20° |
| Battery voltage | > 7.2 V | 6.8–7.2 V | < 6.8 V |
| CAN error rate | < 0.1 % | 0.1–1 % | > 1 % |
| TLM signal | > −70 dBm | −70 to −85 dBm | < −85 dBm |
| Servo current | nominal | 1.5 × nominal | 2 × nominal (stuck) |
| GPS satellites | > 6 | 5–6 | < 5 |

### 12.3 Emergency Scenarios

| Scenario | Detector | Automatic response | Operator role |
|----------|----------|---------------------|---------------|
| Loss of TLM link | No heartbeat 5 s | Flight computer keeps flying; logs continue locally | Monitor recovery |
| Alpha > stall | IMU + estimation | Reduce pitch command | Alert |
| Servo failure | CAN timeout / current spike / position error | Redistribute (over-actuated) or soft-fail (single-axis) | Monitor |
| Excessive roll | `gyro_x` > threshold | Counter-roll command | Monitor |
| Off-course trajectory | Position error large | Fly-back if possible; otherwise predicted-impact tracking | Decision: continue or abort |
| Structural anomaly | Accel spike | Reduce loads (pitch down) | Alert + decision |
| Low battery | Voltage monitor | Graceful degradation | Prepare for abort |
| GPS loss | No fix 30 s | Dead reckoning; autopilot mode fallback | Monitor uncertainty |

### 12.4 Abort Procedure

```
Q: Is the rocket still on rails?

  YES -> "Safe abort" — disable ignition, safe pyrotechnics
        - FIRE signal -> LOW
        - Pyro disarmed
        - Team evacuates further
        - Wait 10 minutes before approach

  NO  -> Rocket is airborne (in-flight ABORT not available — Phase 12 Q2)
    Q: Is it flying correctly?
      YES -> Continue, monitor for later issues

      NO -> Assess severity:
        - Minor deviation: continue with monitoring
        - Major deviation:
          -> If FTS exists: activate
          -> Otherwise: ride out, notify authorities,
             plan impact area
        - Catastrophic failure:
          -> Notify emergency services
          -> Evacuate predicted impact area
          -> Document for investigation
```

### 12.5 Three-Layer Flight Data Logging

Every flight is logged in three independent places (Phase 12 Q3):

```
Layer 1: On-board (rocket itself) — primary
  Path A:
    - STM32L431: minimal events (boot, ignition, separation, impact)
    - Android: full 101+2 column log @ flight loop rate
      Local SD card / internal storage; ring buffer 500 MB
  Path B:
    - STM32H743 / H753: full 101+2 column log @ flight loop rate
      Internal flash + SD card if available
      Ring buffer sized to mission length

Layer 2: Transmitted to ground (real-time)
  - MisPlot frames @ 50 Hz (compressed subset of the 101 columns)
  - Sent over LoRa (default 418 MHz)
  - GCS stores in PostgreSQL + TimescaleDB + HDF5
  - Saturation flags (cols 102, 103) ALWAYS included
  - When telemetry link is restored after a loss, the flight
    computer resumes sending frames including a backfill marker
    so the GCS can stitch the gap from local logs after recovery

Layer 3: Independent black-box (fail-safe)
  - Minimal independent recorder, separate from flight computer
  - Survives impact (case-hardened)
  - Stores: position, velocity, attitude, mass, T_cpu @ 10 Hz
  - Downloaded after recovery
```

v5.2 logging requirements:

- Every column declared in the mission's `logging_profile` is populated; placeholder zeros are restricted to intentionally-omitted columns.
- Saturation flags (cols 102, 103) are uint8 / uint16 bitmasks (uint16 when `num_fins > 8`).
- Sample rate matches loop rate; transmitted MisPlot is sub-sampled to 50 Hz; the on-board log is at the full loop rate.

Post-flight merge produces a single trusted flight report by reconciling the three layers (Phase 13 §13.1).

### 12.6 Predicted Impact Zone Computation

Predicted impact is computed every second (Phase 12 Q5) from current state via the `gnc-core/sim/PredictedImpact.h` module. The predictor uses a deterministic fast 3-DOF propagation forward from the current state with current wind, current mass, and the remaining thrust profile; result is a circle of radius `σ_predict` around an impact point. The GCS displays the circle on the map and asserts an `IMPACT_ZONE_BREACH` event when the predicted point leaves `safety_zone`.

### 12.7 Flight Report Template — Design (recommendation)

Every flight produces a Flight Report. The template is fixed; data fills in automatically where possible (numerical), and engineers fill in interpretation manually (Phase 13 Q1, Phase 12 Q7).

#### Section list

```
1. Cover
   - Flight ID, date, location, weather summary
   - Rocket name + version + template SHA-256
   - Mission file SHA-256
   - Actuator + Controller library SHA-256
   - Path used (A or B)
   - Result: SUCCESS | PARTIAL_SUCCESS | FAILURE
   - One-line summary

2. Mission Configuration                                    (auto)
   - Target ground range, autopilot modes per stage
   - Loop rate, MHE on/off, seeker on/off
   - Optional devices declared and detected
   - Safety zone polygon

3. Pre-Launch Summary                                       (auto)
   - All checklist items with PASS / FAIL
   - GO / NO-GO signatures (SE, QA)
   - Weather at T-0
   - GPS / IMU bias init values

4. Launch Sequence Timeline                                 (auto)
   - T-10s through T+Impact, every recorded event
   - Phase transitions (BOOST → COAST → SEP → COAST → IMPACT)

5. Trajectory                                               (auto)
   - Apogee, ground range, max Mach, max-q, max-G,
     burn time, flight duration
   - 3D trajectory plot, ground track, altitude vs time

6. Estimation Performance                                   (auto + manual)
   - ESKF / MHE / IMM convergence
   - Residual analysis (white-noise check on GPS / IMU residuals)
   - Bias estimation drift
   - Covariance evolution
   - Manual: anomalies, root-cause hypotheses

7. Control Performance                                      (auto + manual)
   - Tracking error per axis (mean, peak)
   - Saturation events (cols 102, 103) — count, durations,
     fin distribution
   - Control effort: ∫|δ|² dt per fin
   - Stability margins identified ex-post
   - Manual: tuning recommendations for next flight

8. Aerodynamic Verification                                 (auto + manual)
   - Measured CA / CN / CM at flown Mach × α points
   - Discrepancies vs DATCOM predictions
   - Suggested AeroDB updates (after ≥ 3 flights — see Phase 13)

9. Hardware Health                                          (auto)
   - T_cpu profile (peak + sustained)
   - Battery voltage profile
   - CAN error counts
   - Servo currents per fin
   - Thermal events

10. Telemetry Link Quality                                  (auto)
    - RSSI profile, dropouts, recovery times

11. Anomalies and Findings                                  (manual)
    - Each anomaly with severity, suspected cause, proposed action
    - Linked to ticketing system entries (Jira)

12. Lessons Learned                                         (manual)
    - What went well
    - What went poorly
    - What we learned
    - What was surprising
    - Actions before next launch
    - Document / checklist updates needed
    - New SIL / HIL tests to add

13. Partial-Success Acceptance                              (auto + manual)
    - Per the per-rocket criteria table (§13.7), category result
    - Override decision (if any), with sign-off

14. Appendices
    A. Full timeline of events (every entry from the events stream)
    B. Plots: every monitored channel vs time
    C. Configurations snapshot (template, mission, libraries, hardware mapping)
    D. Flight log file references and checksums
    E. Photos and video references
    F. Signatures (PM, SA, SE, QA)
```

#### Automation split

| Section | Mode | Owner |
|---------|------|-------|
| 1 cover | Auto + manual one-liner | PM |
| 2 mission | Auto | system |
| 3 pre-launch | Auto | system |
| 4 timeline | Auto | system |
| 5 trajectory | Auto | system |
| 6 estimation | Auto + manual interpretation | NE |
| 7 control | Auto + manual interpretation | CE |
| 8 aero verification | Auto + manual interpretation | AE |
| 9 hardware | Auto | HW + EE |
| 10 telemetry | Auto | EE |
| 11 anomalies | Manual | All |
| 12 lessons | Manual | PM + All |
| 13 acceptance | Auto + manual sign-off | QA + SA |
| 14 appendices | Auto | system |

The report is emitted as PDF + Markdown; both checked into the on-premises Git repo against the flight's `flight_id`.

### 12.8 Video and Photo Recording (Drone + Fixed; Use Whatever Is Available)

The system requires both drone and fixed camera coverage; whatever is operationally available is used (Phase 12 Q8). Mission file declares `video_recording.{drone, fixed}` with `enabled` and `use_if_available` flags. Recording metadata (camera serial, frame timestamp synchronisation against GPS time) is logged into the events stream.

---

## Phase 13 — Post-Flight Analysis

### 13.1 Post-Flight Steps

| T+ | Activity | Owner | Output |
|----|----------|-------|--------|
| 0 min | Secure area, ensure no fires | SE + HW | Safe approach begins |
| 30 min | Recover rocket if possible | HW + PM | Components on site |
| 1 h | Transport to lab | HW + PM | Lab ready |
| 2 h | Extract Layer 1 + Layer 3 logs | EE + ME | Logs on workstation |
| 4 h | First flight report (initial findings) | QA | Preliminary doc |
| 1 day | Sync all 3 log layers | BE | Merged dataset |
| 2 days | Compare with prediction | NE + AE | Residual analysis |
| 3 days | Full telemetry replay (S18 + §8.6) | QA + FE | Replay session |
| 1 week | Root-cause analysis if issues | SA + team | RCA document |
| 2 weeks | Lessons-learned meeting | PM + All | Action items |
| 1 month | System improvements deployed | Team | New version |

### 13.2 Deep Technical Analysis

#### 13.2.1 Physical Model Verification

For each important variable (altitude, velocity, ground track, attitude, fin deflections, thrust) plot prediction vs actual with the Monte Carlo 95th-percentile envelope. If actual lies within 3-σ of MC, model is good. Otherwise investigate aero data, atmosphere model and hidden faults.

#### 13.2.2 Estimation System Verification

ESKF / MHE / IMM analysis: convergence behaviour, residual analysis (white-noise check on GPS / IMU residuals), covariance evolution, bias estimation, MHE solve-time statistics, IMM mode probabilities and transition delays vs ground truth.

#### 13.2.3 Control System Verification

Tracking error per axis (mean, peak, steady-state), control effort (saturation percentage, ∫|δ|² dt), stability margins identified from flight data ex-post, disturbance rejection (response to wind gusts), mode-transition smoothness.

### 13.3 Knowledge Improvement from Flight (AeroDB Updates after ≥ 3 Flights)

Each flight delivers:

- Updated aerodynamic database — measured CA / CN / CM at flown Mach × α points; discrepancies vs DATCOM. Updates trusted after ≥ 3 flights of the same rocket (Phase 13 Q2).
- Calibrated sensor models — IMU bias / noise across temperature; GPS lag / jitter; updated `Q`, `R` covariances.
- Refined mass / CG properties — actual CG during burn (from estimator), moment of inertia changes vs predictions.
- Wind and atmospheric data — actual profile, density deviations, reusable for future missions.
- Improved gain schedules — points where PID was too aggressive / sluggish; new tuning recommendations; better interpolation strategy.

### 13.4 Flight Database (Retain All Flights, All Layers)

All flights are kept indefinitely with all three layers (Phase 13 Q3). Storage is on-premises:

```sql
-- PostgreSQL (metadata)

CREATE TABLE flights (
    id                    UUID PRIMARY KEY,
    rocket_template_id    UUID REFERENCES templates(id),
    flight_date           TIMESTAMPTZ,
    launch_site           GEOGRAPHY(POINT),
    mission_profile       JSONB,
    result                TEXT CHECK (result IN ('success','partial','failure')),
    notes                 TEXT,
    template_sha256       TEXT,
    mission_sha256        TEXT,
    actuator_lib_sha256   TEXT,
    controller_lib_sha256 TEXT,
    hardware_map_sha256   TEXT,
    engine_version        TEXT
);

CREATE TABLE flight_events (
    flight_id             UUID REFERENCES flights(id),
    timestamp_ns          BIGINT,
    event_type            TEXT,
    details               JSONB
);

-- TimescaleDB (telemetry)

CREATE TABLE flight_telemetry (
    flight_id             UUID,
    timestamp_ns          BIGINT,
    state_vector          DOUBLE PRECISION[],
    imu_raw               DOUBLE PRECISION[],
    gps_raw               DOUBLE PRECISION[],
    mode_probabilities    DOUBLE PRECISION[],
    controller_output     DOUBLE PRECISION[],
    fin_rate_limited      INT,
    fin_pos_limited       INT
);
SELECT create_hypertable('flight_telemetry', 'timestamp_ns');

-- Object storage (HDF5 logs)
-- Path: /srv/gnc/flight_logs/<flight_id>/<layer>.h5
```

### 13.5 Lessons Learned (per Flight + Monthly Rollup)

Lessons-learned cadence (Phase 13 Q4):

- After every flight: a dedicated meeting; outputs sections 11–12 of the flight report and a list of action items.
- Monthly rollup: PM consolidates all flights of the month into a single document highlighting recurring themes and cross-flight trends.

### 13.6 Findings Tracking (Ticketing System — Jira)

Findings are tracked in a ticketing system — Jira (Phase 13 Q5). Each anomaly in section 11 of the flight report becomes a Jira ticket with severity, suspected cause, owner and proposed action. Tickets are linked back to the flight ID. Closed tickets remain in Jira for cross-flight analysis.

### 13.7 Partial-Success Acceptance Criteria

A "partial success" requires explicit criteria (Phase 13 Q6):

| Category | Success | Partial | Failure |
|----------|---------|---------|---------|
| Stage transitions | All declared transitions executed within their timeout windows | One or more late but within 2 × timeout | Any transition missed |
| CEP | < target CEP | Target ≤ CEP < 2 × target | ≥ 2 × target |
| Logging | Mission `logging_completeness_target` met | ≥ 90 % of target | < 90 % of target |
| Telemetry | Continuous coverage with < 5 % drop | 5–20 % drop | > 20 % drop |
| Hardware health | No anomaly | Recoverable anomaly (e.g. transient saturation) | Unrecoverable anomaly |
| Estimation | ESKF converged through full flight | One transient divergence < 5 s, recovered | Persistent divergence |
| Control | No recurring saturation per `recurring_saturation` policy | Transient saturation only | Recurring saturation |
| Final state | Impact within safety zone | Impact within 10 % of zone boundary | Impact outside |

A flight is "PARTIAL_SUCCESS" when no category is FAILURE and at least one category is PARTIAL. Otherwise SUCCESS or FAILURE.

### 13.8 Backup Policy (Multiple Copies, Retained Indefinitely; On-Premises Only)

Backups (Phase 13 Q7):

- Primary copy: in the GCS cluster's PostgreSQL + TimescaleDB + object storage.
- Nightly snapshot: separate on-premises NAS in the same building.
- Weekly snapshot: separate on-premises NAS in a different room.
- Monthly archive: cold-storage tape, fire-safe vault.
- All copies retained indefinitely; no off-site cloud copy.

### 13.9 Public Disclosure: None

The system does not publish flight results publicly or to scientific community (Phase 13 Q8). All results are internal.

---

## Appendix B — Flight Log Schema

The 101-column flight log + 2 saturation-flag columns is the canonical output contract. Every simulator (SIL on the ground, on-board flight computer, HIL replay) emits logs conforming to this schema. Columns are not optional: unknown values are written as `NaN`; the column is never omitted. New columns are appended (never renamed, never reordered).

### B.1 Header row

CSV first line is the 103 names below, comma-separated, in order. Lines terminate with `\r\n`. Numeric values use scientific notation; exceptional values use IEEE 754 `NaN`. The time column (col 1) is monotonically increasing seconds from launch command (`T = 0` on row 2).

### B.2 Columns 1–32 — Kinematics, attitude, and body rates

| # | Column | Units | Description |
|---|--------|-------|-------------|
| 1 | `time_s` | s | Seconds from launch command |
| 2 | `velocity_x_m_s` | m/s | Velocity, ECEF X-axis |
| 3 | `velocity_y_m_s` | m/s | Velocity, ECEF Y-axis |
| 4 | `velocity_z_m_s` | m/s | Velocity, ECEF Z-axis |
| 5 | `velocity_total_m_s` | m/s | Speed magnitude |
| 6 | `position_x_m` | m | Position, ECEF X-axis |
| 7 | `position_y_m` | m | Position, ECEF Y-axis |
| 8 | `position_z_m` | m | Position, ECEF Z-axis |
| 9 | `altitude_m` | m | Altitude (WGS-84) |
| 10 | `ground_range_m` | m | Down-range from launch |
| 11 | `alpha_rad` | rad | Angle of attack |
| 12 | `alpha_deg` | deg | Duplicate of 11 in degrees |
| 13 | `beta_rad` | rad | Sideslip angle |
| 14 | `beta_deg` | deg | Duplicate of 13 in degrees |
| 15 | `mach` | — | Mach number from flight dynamics |
| 16 | `mach_aero` | — | Mach used by aerodynamic lookups |
| 17 | `q_dynamic_Pa` | Pa | Dynamic pressure |
| 18 | `q_gain_pilot_kPa` | kPa | q-gain pilot channel (legacy `PILOT`) |
| 19 | `airspeed_m_s` | m/s | True airspeed |
| 20 | `quat_w` | — | Body→NED quaternion, scalar |
| 21 | `quat_x` | — | …, i |
| 22 | `quat_y` | — | …, j |
| 23 | `quat_z` | — | …, k |
| 24 | `roll_deg` | deg | Roll Euler |
| 25 | `pitch_deg` | deg | Pitch Euler |
| 26 | `yaw_deg` | deg | Yaw Euler |
| 27 | `omega_x_rad_s` | rad/s | Body rate x |
| 28 | `omega_y_rad_s` | rad/s | Body rate y |
| 29 | `omega_z_rad_s` | rad/s | Body rate z |
| 30 | `omega_x_deg_s` | deg/s | Duplicate 27 in degrees |
| 31 | `omega_y_deg_s` | deg/s | Duplicate 28 |
| 32 | `omega_z_deg_s` | deg/s | Duplicate 29 |

### B.3 Columns 33–56 — Guidance and autopilot state

| # | Column | Units | Description |
|---|--------|-------|-------------|
| 33 | `guidance_mode` | enum | `WAYPOINT, TRAJECTORY, TERMINAL_HOMING, LOSS_OF_LOCK` |
| 34 | `guidance_quat_cmd_w` | — | Commanded attitude quaternion, w |
| 35 | `guidance_quat_cmd_x` | — | …, x |
| 36 | `guidance_quat_cmd_y` | — | …, y |
| 37 | `guidance_quat_cmd_z` | — | …, z |
| 38 | `autopilot_mode` | enum | `BOOST, COAST, TERMINAL, …` |
| 39 | `autopilot_control_stage` | int | Control-law stage index |
| 40 | `moment_cmd_x_Nm` | N·m | Commanded body moment, x |
| 41 | `moment_cmd_y_Nm` | N·m | … y |
| 42 | `moment_cmd_z_Nm` | N·m | … z |
| 43 | `attitude_error_x_rad` | rad | x error |
| 44 | `attitude_error_y_rad` | rad | y |
| 45 | `attitude_error_z_rad` | rad | z |
| 46 | `rate_error_x_rad_s` | rad/s | Body-rate error x |
| 47 | `rate_error_y_rad_s` | rad/s | y |
| 48 | `rate_error_z_rad_s` | rad/s | z |
| 49 | `autopilot_quat_used_w` | — | Inner-loop attitude quaternion, w |
| 50 | `autopilot_quat_used_x` | — | x |
| 51 | `autopilot_quat_used_y` | — | y |
| 52 | `autopilot_quat_used_z` | — | z |
| 53 | `autopilot_quat_cmd_used_w` | — | Used command quaternion, w |
| 54 | `autopilot_quat_cmd_used_x` | — | x |
| 55 | `autopilot_quat_cmd_used_y` | — | y |
| 56 | `autopilot_quat_cmd_used_z` | — | z |

### B.4 Columns 57–75 — Actuators, forces, and flight phase

| # | Column | Units | Description |
|---|--------|-------|-------------|
| 57–60 | `fin{1..4}_deflection_rad` | rad | Per-fin commanded deflection (radians) |
| 61–64 | `fin{1..4}_deflection_deg` | deg | Duplicates of 57–60 in degrees |
| 65 | `force_x_N` | N | Total body-axis force x |
| 66 | `force_y_N` | N | y |
| 67 | `force_z_N` | N | z |
| 68 | `thrust_x_N` | N | Thrust component x (body) |
| 69 | `thrust_y_N` | N | y |
| 70 | `thrust_z_N` | N | z |
| 71 | `moment_x_Nm` | N·m | Total body moment x |
| 72 | `moment_y_Nm` | N·m | y |
| 73 | `moment_z_Nm` | N·m | z |
| 74 | `mass_kg` | kg | Instantaneous total mass |
| 75 | `flight_phase` | enum | `SAFE_ON_PAD, BOOST, COAST, SEPARATION, TERMINAL, IMPACT` |

For rockets with > 4 fins (GH 8, SA 12), per-fin columns extend in the same pattern in templates whose `num_fins > 4`; the schema is append-only and adds columns 104+ for fins 5–12.

### B.5 Columns 76–88 — Aerodynamic coefficient decomposition

| # | Column | Description |
|---|--------|-------------|
| 76 | `CN_base` | Normal-force coefficient, body contribution |
| 77 | `CM_base` | Pitch-moment coefficient, body |
| 78 | `CY_base` | Side-force coefficient, body |
| 79 | `Cn_base` | Yaw-moment coefficient, body |
| 80 | `CN_delta` | Normal-force coefficient, fin-deflection contribution |
| 81 | `CM_delta` | Pitch-moment coefficient, fin |
| 82 | `CN_control` | Normal-force coefficient, control-resolved |
| 83 | `CM_control` | Pitch-moment coefficient, control-resolved |
| 84 | `CY_control` | Side-force coefficient, control-resolved |
| 85 | `Cn_control` | Yaw-moment coefficient, control-resolved |
| 86 | `M_roll_aero` (N·m) | Aerodynamic roll moment |
| 87 | `M_pitch_aero` (N·m) | Aerodynamic pitch moment |
| 88 | `M_yaw_aero` (N·m) | Aerodynamic yaw moment |

### B.6 Columns 89–101 — CG motion, FUR-frame derivatives, body accelerations

| # | Column | Units | Description |
|---|--------|-------|-------------|
| 89 | `xbc_m` | m | CG along body x (moves as propellant burns) |
| 90 | `position_fur_x_m` | m | FUR (forward-up-right) frame x |
| 91 | `position_fur_y_m` | m | y |
| 92 | `position_fur_z_m` | m | z |
| 93 | `velocity_fur_x_m_s` | m/s | x |
| 94 | `velocity_fur_y_m_s` | m/s | y |
| 95 | `velocity_fur_z_m_s` | m/s | z |
| 96 | `acceleration_fur_x_m_s2` | m/s² | x |
| 97 | `acceleration_fur_y_m_s2` | m/s² | y |
| 98 | `acceleration_fur_z_m_s2` | m/s² | z |
| 99 | `acceleration_body_x_g` | g | Accelerometer signal x |
| 100 | `acceleration_body_y_g` | g | y |
| 101 | `acceleration_body_z_g` | g | z |

### B.7 Sampling rate and time base

The on-board log samples at the loop rate (Path A 100 Hz default; Path B 200 Hz default). Down-sampling to 10 Hz for SIL comparison takes the sample at the nearest 100 ms instant — no averaging, no interpolation. A 200 s flight at 100 Hz produces 20,000 rows; at 10 Hz, 2,000.

### B.8 Required columns for on-device logging

Three logging profiles are selectable per mission via `mission.logging_profile`:

| Profile | Columns | Approx row | Use |
|---------|---------|------------|-----|
| `FULL` (default) | 1–101 + 102 + 103 (all) | ≈ 1.6 KB | Default — every flight |
| `FLIGHT` | 1–32 + 33, 38, 57–75 + 102, 103 | ≈ 0.9 KB | Reduced — skips aero decomposition and FUR frame |
| `MINIMAL` | 1–10, 20–26, 75 + 102, 103 | ≈ 0.3 KB | Telemetry only — long missions or low storage |

Default is `FULL`. Over a 200 s flight at 100 Hz, `FULL` consumes ~32 MB.

### B.9 Saturation Flag Columns 102–103

| # | Column | Units | Description |
|---|--------|-------|-------------|
| 102 | `fin_rate_limited_flag` | uint8 / uint16 bitmask | Bit `i` set when fin `i+1` hit `rate_max` (more restrictive of rocket-level / actuator-level) |
| 103 | `fin_position_limited_flag` | uint8 / uint16 bitmask | Bit `i` set when fin `i+1` hit `delta_max` / `delta_min` |

For rockets with > 8 fins, both columns widen to `uint16`.

### B.10 Rocket-Properties YAML Schema Additions

#### B.10.1 New scalar fields

| Field | Type | Default | Required | Description |
|-------|------|---------|----------|-------------|
| `aerodynamics.CA_multiplier` | float | 1.0 | optional | Drag coefficient scaling. BA reference uses 0.9 |
| `propulsion.thrust_multiplier` | float | 1.0 | optional | Thrust scaling. Default 1.0 |
| `num_stages` | int | 1 | required | Stage count |

#### B.10.2 New actuator-reference fields (in `fin_config.sets[*]`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `actuator_ref` | string | required (or `per_fin_actuator_ref`) | Names actuator type; must resolve in `actuator_library.yaml` (C14) |
| `per_fin_actuator_ref` | list[string], length = `count` | optional | Per-fin override |

#### B.10.3 Worked example (BA reference excerpt)

```yaml
num_stages: 1
stages:
  - id: stage_1
    aerodynamics:
      CA_multiplier: 0.9
    propulsion:
      thrust_curve_csv: "thrust_curve.csv"
      thrust_multiplier: 1.0
      propellant:
        radius_m: 0.1325
        length_m: 3.33
        grain_radius_ratio: 0.2528
    fin_config:
      sets:
        - id: finset_1
          count: 4
          chord: [0.20, 0.03]
          xle: [1.106]
          delta_max_deg: 20.0
          delta_dot_max_deg_s: 300.0
          actuator_ref: "default_4020"
          # per_fin_actuator_ref:
          #   - default_4020
          #   - default_4020
          #   - default_4020
          #   - XQ-4020
```

---

## Appendix C — Reference Dataset (BA Golden)

The correct reference logs will be supplied later; until then, the content below is used as-is for envelope-shape validation only.

### C.1 Package contents

| Path | Size | Role |
|------|------|------|
| `rockets/BA/rocket_properties.yaml` | ~8 KB | Mass, CG, inertia, reference dims, nozzle, fin geometry |
| `rockets/BA/aero_coeffs.csv` | ~3 KB | `Cd`, `Cn`, `Cm` vs Mach × α |
| `rockets/BA/ca_3d_coeffs_motor_on.csv` | ~31 KB | `CA` vs Mach × α × Re, motor burning |
| `rockets/BA/ca_3d_coeffs_motor_off.csv` | ~31 KB | `CA` vs Mach × α × Re, motor off |
| `rockets/BA/damping_coeffs.csv` | ~3 KB | `Cmq`, `Cnq`, `Clp` |
| `rockets/BA/fin_deflection_coeffs.csv` | ~3 KB | `Cnd`, `Cmd` vs Mach × δ |
| `rockets/BA/fin_loads.csv` | ~2 KB | Hinge and bending moments per fin |
| `rockets/BA/roll_aero_coeffs.csv` | ~5 KB | `Cll` vs Mach × α × `δ_roll` |
| `rockets/BA/thrust_curve.csv` | ~31 KB | Thrust + mass-flow @ 10 ms |
| `rockets/BA/atmosphere_table.csv` | ~800 KB | Altitude-indexed `ρ`, `p`, `T`, `a`, wind |
| `rockets/BA/BA.SLDPRT` | ~2 MB | SolidWorks CAD reference |
| `results/...log.csv` | ~1.7 MB | Reference output log |
| `logs/{25000m, 50000m, 80000m, 124310m, 150000m}.h5` | ~1.3 MB each | Reference runs by ground range |
| `logs3/{45deg_100km, 75deg_100km, 85deg_100km}.h5` | ~2 MB each | Reference runs by guidance pitch |

### C.2 Known characteristics of the reference flight

| Metric | Value | Source |
|--------|-------|--------|
| Launch altitude | 1,500 m | `rocket_properties.yaml` launcher |
| Launch elevation | 65° | `launcher.launch_elevation` |
| Rail length | 5.45 m | `launcher.rail_length` |
| Rail effective length | 4.5 m | `launcher.rail_effective_length` |
| Initial mass (full) | 576.0 kg | log row 2 |
| Propellant mass | 285.0 kg | computed |
| Dry mass | 291.0 kg | template |
| Stage 1 burnout | t = 13.2 s | report |
| Maximum Mach | 4.29 at t = 13.0 s | report |
| Maximum dynamic q | 518.6 kPa at t = 12.9 s | report |
| Maximum G-force | 15.80 G at t = 12.6 s | report |
| Apogee | 40.89 km at t = 94.1 s | report |
| Flight duration | 193.5 s | log final |
| Ground range | 124.31 km | report |
| Final velocity | 570.5 m/s | report |
| Reference frame | ECEF | report |
| Gravity model | J2 / J3 / J4 spherical harmonics | report |

### C.3 Acceptance tolerances (statistical, by column group)

Each column has a comparison mode and tolerance band derived from the 8-log envelope.

#### Comparison modes

| Mode | Meaning | Pass criterion |
|------|---------|----------------|
| `match` | Reference value is correct and our output should reproduce it | Difference within tolerance, both at 90th percentile and at peak |
| `gap` | Reference is a placeholder (logging bug — see C.7); our system populates properly | Output is internally consistent and physically plausible (sanity-check only) |
| `sanity-check` | Reference value is correct but bounded by sim-specific behaviour (e.g. reference does not enforce limits) | Output respects physical bounds even if reference exceeds; tolerance applied where reference is within bounds |

#### Column groups by variance

| Group | Description | Examples | Tolerance |
|-------|-------------|----------|-----------|
| Invariant | 21 columns; `σ = 0` (FP precision) during boost | `mass_kg`, thrust columns, atmosphere lookups, force_x boost, mach boost | ≤ 0.01 % magnitude or ≤ 4 sig-figs |
| Mildly varying | 24 columns | `alpha_deg`, fin deflections, `M_pitch_aero`, `CN_base`, body rates, attitude error | Mission-dependent: ≤ 2 % local magnitude or ≤ 0.5° |
| Highly varying | 25 columns | `beta_deg`, `yaw_deg`, `force_y`, `moment_y`, `CY_base`, cross-axis | ≤ 10 % local magnitude or ± absolute threshold per column |
| Always zero | 27 columns | logging-bug zeros (16) + physical zeros (11) — see C.7 | Mode = `gap` or `match` per C.7 |

#### Tolerance table

| Column / Group | Phase | Tolerance (90 %) | Tolerance (peak) | Mode |
|----------------|-------|------------------|------------------|------|
| Position (cols 6–8) | Boost (t < 13.3 s) | ≤ 0.01 m or 0.001 % | ≤ 0.1 m or 0.01 % | match |
| Position (cols 6–8) | Coast (t > 13.3 s) | ≤ 0.5 % local | ≤ 2 % | match |
| Velocity total (col 5) | Boost | ≤ 0.001 m/s or 0.001 % | ≤ 0.01 m/s | match |
| Velocity total (col 5) | Coast | ≤ 0.5 % local | ≤ 2 % | match |
| Altitude (col 9) | Boost | ≤ 0.5 m | ≤ 5 m | match |
| Altitude (col 9) | Coast | ≤ 10 m or 0.05 % | ≤ 50 m | match |
| Mass (col 74) | Whole | ≤ 0.1 kg | ≤ 0.5 kg | match |
| Mach (col 15) | Whole | ≤ 0.005 | ≤ 0.05 | match |
| q dynamic (col 17) | Whole | ≤ 0.5 % local | ≤ 5 % | match |
| Body accel x (col 99) | Boost | ≤ 0.05 g | ≤ 0.2 g | match |
| α, β (cols 11–14) | Whole | ≤ 0.01° or 2 % | ≤ 0.3° | match |
| Pitch (col 25) | Whole | ≤ 0.1° | ≤ 1.0° | match |
| Body rates ωy, ωz (28–32) | Whole | ≤ 0.005 rad/s | ≤ 0.05 rad/s | match |
| Quaternion (20–23) | Whole | ≤ 0.001 / component (norm < 1 e−5) | ≤ 0.01 | match |
| `CN_base`, `CM_base` (76–77) | Whole | ≤ 2 % local | ≤ 10 % | match |
| `force_x_N` (65) | Whole | ≤ 1 % local | ≤ 5 % | match |
| Cross-axis force (66–67) | Whole | ≤ 10 % local or 50 N | ≤ 30 % | match |
| Moments cross-axis (71, 73) | Whole | ≤ 10 % local or 5 N·m | ≤ 30 % | match |
| Yaw (col 26) | Whole | ≤ 0.5° | ≤ 5° | match |
| Fin deflections (57–64) | Whole | ≤ 0.5° per fin OR our output respects limits while reference exceeds | ≤ 2° | sanity-check |
| Saturation flags (102–103) | Whole | bitmask consistent with fin behaviour | n/a | sanity-check |
| Apogee value, time-to-apogee | Single | ≤ 0.5 % | ≤ 2 % | match |
| Burnout time | Single | ≤ 0.05 s | ≤ 0.2 s | match |
| Achieved ground range | Single | ≤ 1 % target | ≤ 5 % | match |

Per-rocket acceptance gate (per §8.5): ≥ 90 % of `match`-mode samples within tolerance, no peak violations.

### C.4 Running the comparison

```python
ref = load('rockets/BA/golden/logs/<config_id>.h5')
our = run_simulator(template='rockets/BA/', mission=mission_overrides, hal=path)
align_to_same_rate(ref, our, target_hz=10)

results = {}
for group, tol_90, tol_peak in TOLERANCE_TABLE:
    diff = our[group.columns] - ref[group.columns]
    diff_norm = diff / abs(ref[group.columns]) if group.is_relative else diff
    p90  = np.percentile(np.abs(diff_norm), 90)
    peak = np.max(np.abs(diff_norm))
    results[group] = {'pass': p90 <= tol_90 and peak <= tol_peak,
                      'p90': p90, 'peak': peak}

overall_pass = all(r['pass'] for r in results.values())
```

### C.5 When the comparison fails

A failure is a signal to investigate — never to loosen tolerances. Common causes:

- Coordinate-frame mismatch (NED vs ECEF) — fix conversion.
- Time-base offset — align timelines.
- Numerical integration differences — match integrator settings.
- Aerodynamic interpolation — match scheme.
- Atmosphere model — verify both use the supplied table.
- Mass-flow rounding — consume `mass_flow` column directly.

### C.6 Gaps identified by comparing against the reference template

Two outstanding template-extension areas remain (independent of the BA reference fix-ups already applied):

- Hardware mapping is supplied via `hardware_mapping.yaml` per template (clauses C11, C21).
- Seeker block — see C13 in the Onboarding Procedure; absent block defaults to `seeker.enabled: false`.

### C.7 Logging-Bug Catalog

#### C.7.1 Logging bugs

These columns must be populated by v5.2 systems with computed values. Comparison mode `gap` (do not compare to reference). Sanity-check criterion = physically plausible.

| # | Column | Why non-zero | Sanity check |
|---|--------|--------------|--------------|
| 33 | `flight_phase` | Phase transitions occur every flight | Monotone progression matching expected timing |
| 34 | `guidance_mode` | Varies between modes | Non-empty enum; matches mission profile |
| 38 | `autopilot_mode` | Varies per phase | Non-trivial; transitions on phase boundaries |
| 39 | `attitude_error_x_rad` | Autopilot computes error to drive fins | Non-zero when fins deflect; bounded by abort_policy |
| 40–41 | `attitude_error_{y,z}_rad` | Same | Same |
| 42–44 | `rate_error_*` | Inner loop computes rate error | Non-zero when fins deflect |
| 45–48 | `autopilot_quat_cmd_{w,x,y,z}` | Output quaternion | Non-identity when guidance mode active |
| 71–73 | `moment_cmd_{x,y,z}_Nm` | Output moments pre-mixer | Magnitude bounded by rocket capability |
| 65 | `thrust_x_N` | Thrust component in body frame | Match `force_x` convention OR populate explicitly; convention documented |

#### C.7.2 True zeros

These columns are zero by physics in the BA reference. v5.2 systems also produce zero in the same regime. Comparison mode `match`.

| # | Column | Why zero | When non-zero in v5.2 |
|---|--------|----------|-----------------------|
| 27, 30 | `omega_x_*` | Reference flights have zero roll rate | Roll-aware guidance or asymmetric configuration |
| 86 | `M_roll_aero` | Zero roll moment in the reference | Roll fins deflect or asymmetric flow |
| 89 | `xbc_m` | Reference uses 0 datum | Mass changes shift CG and template logs delta |
| 80, 82 | `CN_delta`, `CM_delta` | Reference folds into base | v5.2 explicitly decomposes — sanity-check mode |

#### C.7.3 Saturation indicator — reference exceeds limits

For runs where the reference simulator exceeds actuator limits (e.g. 85° launch with fin deflection to 40.1°), v5.2 enforces limits at the boundary and writes saturation flags. Comparison for fin columns 57–64 is `sanity-check`: v5.2 output respects limits, may differ from reference where reference exceeds. The saturation-flag columns (102 / 103) have no reference counterpart; pass criterion is bitmask consistency with v5.2 fin output.

---

## Appendix D — Mission File (Full Schema Reference)

Authoritative schema lives in `schemas/mission_file.schema.yaml`. Worked-out fields cover required and optional sections per stage, including:

- `flight_computer_path` — `A` | `B`.
- `mission.target_ground_range_m`.
- `mission.guidance_reference_pitch_deg` (power-user override).
- `mission.cep_target_m`.
- `mission.stages[*].autopilot_mode` (Decision 10 enum).
- `mission.stages[*].abort_policy` (per-stage thresholds, including the `recurring_saturation` block in §5.7.3).
- `loop_rate_hz` (within path range).
- `estimator.approach` — `single_filter` | `sequential` | `imm`.
- `mhe.{enabled, horizon, rate_hz, budget_overrun_mode}`.
- `seeker.{enabled, mode, target_class, loss_of_lock_policy, camera_id, fov_deg, mount_isolation, los_rate_method, pn_variant, pn_gain_N, inference_target}`.
- `optional_devices.{gps, radio, warhead_fuse, engine_starter_*, separating_nail_*, jamble, external_imu, flight_termination_system, pyrotechnic_physical_security}`.
- `safety_zone` polygon / circle / `vlos_or_tethered`.
- `logging_profile`, `logging_completeness_target`.
- `dry_run` mode.
- `video_recording.{drone, fixed}`.
- `replay.seed`.

---

## Appendix E — Controller Library (Full Schema Reference)

Authoritative schema in `schemas/controller_library.schema.yaml`. Key fields:

- `controllers.<name>.type` — one of the 12 algorithms in §5.2.
- `controllers.<name>.parameters` — algorithm-specific gain set.
- `controllers.<name>.operating_points` — gain-schedule grid (linear interior, cubic boundaries).
- `controllers.<name>.flight_phases` — per-phase parameter overrides.
- `controllers.<name>.allocation_algorithm` — bound to controller type per §5.3.2.

Every per-stage `controller_ref` in a template must resolve here (clause C22).

---

## Appendix F — Actuator Library (Full Schema Reference)

Authoritative schema in `schemas/actuator_library.schema.yaml`. Per `actuators.<name>`:

- `description`.
- `model_type` — `second_order_with_delay` | `first_order` | `ideal` | `electromechanical`.
- Model-type specific fields (`wn_rad_s`, `zeta`, `delay_s` for second-order; `tau_s` for first-order; motor + gearbox blocks for electromechanical).
- Saturation limits — `rate_max_deg_s`, `delta_max_deg`, `delta_min_deg`.
- Optional — `deadband_deg`, `backlash_deg`, `config_type`, `hinge_moment_curve_csv`.

Every fin slot's `actuator_ref` in a template must resolve here (clause C14).

---

## Appendix G — Multi-Stage Architecture Reference

This appendix consolidates the multi-stage capability defined in Decision 16 and exercised by the reference test fixtures (Appendix A.4).

### G.1 Schema essentials

```yaml
num_stages: <int>
stages:
  - id: <string>
    is_terminal: <bool>
    physical: { mass_dry_kg, propellant_mass_kg, cg_*, inertia_* }
    geometry: { ref_diameter_m, ref_length_m, ref_area_m2 }
    aerodynamic_data: { mach_range, alpha_range, delta_range, reynolds_range,
                        coefficient_files: { CN, CM, CA_on, CA_off, damping,
                                              fin_loads } }
    propulsion:                        # omitted for unpowered coast stage
      thrust_curve_file: <path>
      burn_time_s: <float>
      total_impulse_Ns: <float>
      isp_s: <float>
      thrust_multiplier: <float>
    aerodynamics: { CA_multiplier: <float> }
    operational_envelope: { mach_min, mach_max, alpha_max_abs, delta_max_abs }
    controller_type: <enum: fins | tvc | hybrid | cold_gas |
                            aerospike | roll_canards | none>
    controller_ref: <key into controller_library.yaml>
    autopilot:
      enabled: <bool>
      capable_modes: [auto_shape, fixed_pitch, passive_ballistic,
                      waypoint, terminal_homing]
    fin_config:                        # for controller_type ∈ {fins, hybrid, roll_canards}
      sets:
        - { id, placement, orientation, count, chord, sspan, xle, phif,
            max_deflection_deg, sign_convention,
            actuator_ref: <key>, per_fin_actuator_ref: [<key>...] }
    tvc_config:                        # for controller_type ∈ {tvc, hybrid, aerospike}
      actuator_count: <int>
      per_tvc_actuator_ref: [<key>...]
    seeker_capable: <bool>
    optional_sensors: [<sensor_id>...]
    separation:                        # required for non-terminal stages
      trigger: <enum: burnout | time | altitude | velocity | event>
      offset_s: <float>
      timeout_s: <float>
      arming:
        from_event: <enum>
        delay_s: <float>
      nail_count: <int>
      nail_pyro_events: [<event_id>...]
```

### G.2 Controller-type registry

| Type | Day-1 status |
|------|--------------|
| `fins` | Full implementation |
| `none` | Full implementation |
| `tvc` | Full implementation |
| `hybrid` | Full implementation |
| `roll_canards` | Full implementation |
| `cold_gas` | Full implementation |
| `aerospike` | Fail-closed stub (validator C19 rejects while `implementation_status: stub`) |

### G.3 Separation-trigger registry

| Trigger | Day-1 status |
|---------|--------------|
| `burnout` | Full implementation |
| `time` | Full implementation |
| `altitude` | Full implementation |
| `velocity` | Full implementation |
| `event` | Full implementation |

### G.4 Estimator approaches

| Approach | When used | Day-1 status |
|----------|-----------|--------------|
| `single_filter` | Single-stage rockets | Full implementation |
| `sequential` | Multi-stage with crisp transitions | Full implementation |
| `imm` | Multi-stage with noisy transitions; mode set derived from template (§4.1.1) | Full implementation |

---

## RACI Matrix (Updated)

R = responsible, A = accountable, C = consulted, I = informed.

| Task | PM | SA | AE | CE | NE | BE | FE | EE | ME | HW | QA | SE | DO |
|------|----|----|----|----|----|----|----|----|----|----|----|----|-----|
| Define vision | A | R | C | C | C | I | I | I | I | I | C | C | I |
| System architecture | A | R | C | C | C | C | C | C | C | C | I | C | C |
| Data parser | I | C | R | I | I | A | I | I | I | I | C | I | I |
| Multi-stage template + parser | I | A | R | C | C | R | C | I | I | I | C | I | I |
| Mission file schema + validator | C | A | C | R | C | R | C | I | I | I | C | C | I |
| Actuator library + multi-model types | I | A | C | C | C | C | I | R | R | C | C | I | I |
| Controller library | I | A | C | R | C | R | I | I | I | I | C | I | I |
| Hardware mapping | I | C | C | I | I | I | I | R | I | A | C | I | I |
| HAL design (`gnc-core`) | I | A | C | R | R | R | I | C | C | I | C | I | C |
| Path A wrapper (`gnc-android`) | I | C | I | C | C | C | I | C | A | C | C | I | R |
| Path B wrapper (`gnc-stm32`) | I | C | I | C | C | C | I | A | C | C | C | I | R |
| Simulation engine + actuator model + dual-fidelity | I | C | R | C | C | A | I | I | I | I | C | I | I |
| ESKF (canonical, both paths) | I | C | C | C | A | R | I | I | C | I | C | I | I |
| MHE (optional, both paths; IPOPT + acados) | I | C | C | C | A | R | I | I | C | I | C | I | I |
| IMM (multi-stage; manual + learned) | I | C | C | C | A | R | I | I | I | I | C | I | I |
| Control algorithms (all 12) | I | C | C | A | C | R | I | I | C | I | C | I | I |
| Control mixer + per-controller-type allocation | I | C | C | A | I | R | I | C | C | C | C | C | I |
| Saturation feedback (Strategy B + watchdog + anti-windup) | I | C | C | A | I | R | I | C | C | C | C | C | I |
| Web GCS (shared) | I | C | I | I | I | C | A | I | I | I | C | I | I |
| 3D viewer + Three.js + GLB conversion | I | C | C | I | I | I | A | I | I | I | I | I | I |
| CAD-to-GLB conversion server | I | C | C | I | I | C | A | I | I | I | I | I | C |
| AG Grid + Handsontable editor | I | C | C | I | I | I | A | I | I | I | I | I | I |
| WebSocket telemetry + Redux Toolkit | I | C | I | I | I | C | A | I | I | I | C | I | I |
| React Native companion | I | C | I | I | I | I | A | I | I | I | I | I | I |
| Localisation (Arabic + English RTL) | I | C | I | I | I | I | A | I | I | I | I | I | I |
| Kiosk mode for Launch Control | C | C | I | I | I | I | A | I | I | I | C | R | I |
| CAN integration (both paths) | I | C | I | I | I | I | I | R | R | A | C | C | I |
| STM32L431 peripheral firmware (Path A) | I | C | I | C | I | I | I | A | C | C | C | C | C |
| STM32H743 / H753 flight firmware (Path B) | I | C | I | C | C | C | I | A | C | C | C | C | C |
| Android app (Path A) | I | C | I | I | C | C | I | C | A | C | C | C | R |
| Seeker co-processor app (Path B + seeker; Jetson Nano) | I | C | I | C | I | C | I | C | A | C | C | I | R |
| Hardware build (both benches) | I | C | C | I | I | I | I | C | I | A | C | C | I |
| SIL testing (multi-target, GoogleTest, shared memory) | I | C | C | C | C | C | I | I | I | I | A | I | C |
| Dual-path parity testing | C | C | C | C | C | C | I | C | C | I | A | I | C |
| HIL testing — Path A bench | I | C | I | C | C | I | I | C | C | C | A | C | C |
| HIL testing — Path B bench | I | C | I | C | C | I | I | C | C | C | A | C | C |
| HIL scenario configuration + automation | I | C | I | C | C | I | I | C | C | C | A | C | C |
| CI/CD (3-tier, single CI, parallel jobs) | I | C | I | I | I | C | I | R | R | I | C | I | A |
| Pre-launch checklist (path-aware) | C | C | I | I | I | I | I | C | C | C | A | R | I |
| Launch execution (path-aware; SE+QA veto) | A | C | I | I | C | I | I | C | C | C | R | R | I |
| Post-flight analysis + parity check | C | C | R | R | R | C | I | I | I | I | A | C | I |
| Flight report (auto + manual; AeroDB updates ≥ 3 flights) | C | C | R | R | R | C | C | I | I | I | A | C | I |
| Findings tracking (Jira) | C | A | C | C | C | C | C | C | C | C | R | C | I |
| Backup policy (on-premises, indefinite) | C | A | I | I | I | C | I | I | I | I | C | I | R |
| Code documentation package | C | R | C | C | C | C | C | C | C | C | C | I | A |
| User manual | C | C | I | I | I | I | A | I | I | I | R | I | I |

### Work interfaces between disciplines

| Interface | Parties | Shared deliverable |
|-----------|---------|--------------------|
| Template schema | AE ↔ BE ↔ CE | Unified YAML structure + multi-stage |
| Mission file schema | SA ↔ CE ↔ BE ↔ FE | `mission/<id>.yaml` + validator |
| Actuator library | EE ↔ ME ↔ CE ↔ BE | `actuator_library.yaml` + multi-model types |
| Controller library | CE ↔ NE ↔ BE | `controller_library.yaml` |
| Hardware mapping | HW ↔ EE ↔ BE | `hardware_mapping.yaml` |
| HAL interfaces | SA ↔ CE ↔ NE ↔ EE ↔ ME | `IImu`, `IGps`, `ICan`, `IPyro`, `IRadio`, `IClock`, `IThermal`, `IFinDriver`, `ISeeker` |
| Saturation feedback | CE ↔ BE | Cols 102–103 read by mixer next cycle |
| Aero database | AE ↔ BE | HDF5 schema + naming |
| TLM frame | EE ↔ ME ↔ BE ↔ FE | MisPlot 77 B incl. saturation flags |
| CAN protocol | HW ↔ EE ↔ ME | CANOpen command set |
| UI ↔ Backend | FE ↔ BE | REST + WebSocket specs |
| JNI bridge (Path A) | ME ↔ CE ↔ NE | JNI signatures |
| Path B HAL bridge | EE ↔ CE ↔ NE | C++ bindings |
| Seeker co-processor link | EE ↔ ME ↔ CE | UART / CAN protocol from H7xx to Jetson Nano |
| GCS ↔ Flight Computer | FE ↔ ME ↔ EE | TCP 5900 protocol; same on both paths |
| Launch sequence | SE ↔ EE ↔ ME | State machine spec |
| Safety protocols | SE ↔ All | Fault response table |
| Dual-toolchain CI/CD | DO ↔ EE ↔ ME | Single CI with parallel jobs; HAL leak check; parity test job |

---

## Milestones (capability-driven; PM owns the calendar)

This plan asserts capability milestones, not week counts. PM owns the schedule and publishes it separately. The capability gates are:

| Gate | Definition | Owner |
|------|------------|-------|
| **G1 — Platform skeleton** | `gnc-core` compiles on host CI; `gnc-android` and `gnc-stm32` wrappers compile in CI; HAL leak Wave 1 active (L1, L2, L3); Tier 1 < 5 min on host. | DO + SA |
| **G2 — Single-rocket SIL on Path A** | One committed rocket from `release_manifest.yaml` passes its full §8.3.2 envelope grid on Path A within Appendix C tolerances. | QA |
| **G3 — Single-rocket SIL on Path B** | Same rocket passes its full §8.3.2 envelope grid on Path B within Appendix C tolerances. Dual-path parity ≥ 90 %. | QA |
| **G4 — Single-rocket flight on Path A** | One successful flight on the rocket's primary path (Path A or Path B per the rocket's choice). Post-flight reconciliation per §13. | QA + SE |
| **G5 — Dual-path flight (single rocket)** | Same rocket flown on the second path. Dual-path parity demonstrated post-flight. | QA + SE |
| **G6 — Per additional rocket** | Each subsequent rocket in `release_manifest.yaml` passes G2 → G3 → (G4 or G5 per operational choice). | QA + AE |
| **G7 — Optional capability gates** | Seeker-enabled mission (§3.9.4 thermal checklist applied per device); MHE opt-in run; Monte Carlo at production count; HIL on both benches. | QA + SE + ME |

Milestones G2 and G3 are sequenced per rocket (a rocket cannot reach G3 without first reaching G2 on the same rocket), but the platform is built to support all capabilities from day 1; G2 / G3 are validation gates, not implementation gates. The milestone set carries no path-specific stage suffixes and no week-numbered phase letters — PM publishes the calendar separately.

---

## Risk Register

Probability (1–5), Impact (1–5), Score = P × I.

### Platform — Dual-path risks

| Risk | P | I | Score | Mitigation |
|------|---|---|-------|------------|
| Path A vs Path B parity drift | 4 | 5 | 20 | HAL surveillance; both paths run unit tests on every PR; nightly multi-target SIL on both; parity drift alert when same input gives outputs > tolerance |
| HAL leak — platform-specific code in `gnc-core` | 4 | 4 | 16 | L1 forbidden-includes static check; L2 host build; L3 PR review; CI fails when `gnc-core` links platform headers; HAL leak Waves 1–3 |
| Single-CI parallel-jobs complexity exceeds team capacity | 3 | 4 | 12 | DO is first-class role; weekly CI health review |
| Path B Cortex-M7 cannot meet flight-loop deadlines under load | 3 | 4 | 12 | Bench-test M7 timing on representative load early in P3b; if budget exceeded, drop MHE on Path B (default already off); reduce loop rate to 100 Hz lower bound |
| Single-developer bus factor on `gnc-stm32` | 3 | 3 | 9 | Pair-programming on critical-path `gnc-stm32` modules; require ≥ 2 reviewers on `gnc-stm32` PRs; documented onboarding for the FreeRTOS toolchain |
| Snapdragon 845 thermal envelope tighter than budget | 4 | 5 | 20 | Adreno 630 GPU inference; reduced seeker rate outside terminal phase; passive cooling; pre-flight thermal soak; main-loop rate reducible at 85 °C; fall back to detector-only |
| Multi-target SIL acceptance gate (16/16) cannot be met | 3 | 5 | 15 | Tolerances statistically derived from 8 logs; investigate root cause before loosening; target 90 %, not 100 % |
| One HIL bench delays system acceptance | 3 | 4 | 12 | Both benches built in parallel from day 1 (§0.2); daily standup includes HIL bench status; QA escalates ≥ 1-week slip to PM |
| Logging-bug discovery during Stage 1 (more bugs than catalog) | 3 | 3 | 9 | C.7 catalog is starting set; QA owns triage; new entries added as found |
| Path A external IMU SKU detection ambiguous | 2 | 3 | 6 | Auto-detect AND declared verification; pre-launch S22 confirms; abort on mismatch |
| Path B variant change mid-development | 3 | 3 | 9 | Locked to STM32H743 primary, STM32H753 alternate; any other variant = explicit re-baseline |
| Multi-rocket acceptance matrix size grows quickly | 3 | 3 | 9 | `release_manifest.yaml` is sized by PM per release; SIL parametrisation uses ≥ 8 cells per rocket as a floor, not a ceiling; CI Tier 3 nightly with operator-set Monte Carlo count; per-rocket envelope grid generation is a single function in the SIL harness |

### Platform — Inherited technical risks

| Risk | P | I | Score | Mitigation |
|------|---|---|-------|------------|
| Single flight computer = SPOF (per path, no backup) | 3 | 5 | 15 | Pre-flight burn-in; thermal monitoring; black-box independent recorder; abort on ground if unhealthy |
| Seeker false target lock when seeker enabled | 3 | 5 | 15 | Multi-frame lock confirmation; quality threshold; conservative `revert_trajectory` default; Stage 1 keeps seeker off |
| Seeker loss-of-lock during terminal phase | 4 | 3 | 12 | `loss_of_lock_policy` default `revert_trajectory`; PN coast for short glitches; abort option |
| MHE exceeds loop budget on either path | 3 | 3 | 9 | MHE optional, default off in Stage 1; user-selectable budget overrun mode (`skip` / `reduce_horizon` / `reduce_trust`) |
| Camera hardware failure in flight (seeker enabled) | 2 | 4 | 8 | Loss-of-lock policy triggers; if seeker disabled, system unaffected |
| Ethernet link to GCS disconnects in flight | 2 | 2 | 4 | Flight continues autonomously; no in-flight commands required from GCS post-launch |
| STM32L431 firmware hang on Path A (peripheral loss) | 2 | 4 | 8 | Watchdog reset; Android detects heartbeat loss and enters safe mode for peripherals |
| CAN 500 kbps insufficient for high-fin-count rockets | 3 | 3 | 9 | Clause C25 enforces utilisation < 70 %; benchmark in HIL Phase 9D |
| Validation rocket data missing/shaped like a template mismatch | 4 | 3 | 12 | C1–C25 catches before simulation; missings reported; SA stage 2 unpowered coast handled explicitly |
| Power rail drops in flight (battery brown-out) | 2 | 5 | 10 | Redundant power rails; brown-out protection; STM32L431 (Path A) or STM32H7xx (Path B) independent pyro-safe path |

### Advanced-capability risks

| Risk | P | I | Score | Mitigation |
|------|---|---|-------|------------|
| Over-actuated allocation unstable (SA 12 fins) | 3 | 4 | 12 | Stage 2 work; Weighted LS + failure testing in SIL and HIL when SA onboards |
| Hypersonic regime model gaps at Mach > 8 | 3 | 3 | 9 | Advanced-capability work; extended atmosphere models (NRLMSISE-00 above 80 km); high-α aero coefficients fall back to Newtonian impact theory per §3.3 |
| Anomalous inertia cases in validation data | 4 | 3 | 12 | AE review; clause C5 per rocket onboarded |
| Two-stage separation logic (GH, SA) | 2 | 5 | 10 | Stage 2 work; IMM (or sequential) handles transitions; tested per rocket |

### Organisational / logistical risks

| Risk | P | I | Score | Mitigation |
|------|---|---|-------|------------|
| Late servo purchase | 4 | 4 | 16 | Servo procurement assumed already on hand; otherwise early order in P0 |
| Weather delays Stage 1 flights | 5 | 2 | 10 | Schedule flexibility ±2 weeks; Path A and Path B flights can be on different days |
| Key engineer absence | 3 | 3 | 9 | Pair programming + documentation; HAL design owned by ≥ 2 engineers |
| Launch site not licensed | 2 | 5 | 10 | Begin licensing procedures early; same site serves both paths |
| Customer requirement changes during Stage 1 | 3 | 4 | 12 | Stage 1 scope is locked; new customer rockets are Stage 2 work |
| Budget overrun on dual-bench HIL hardware | 3 | 4 | 12 | Monthly monitoring; emulation fallback for one path |

### Safety risks

| Risk | P | I | Score | Mitigation |
|------|---|---|-------|------------|
| Explosion on launch | 1 | 5 | 5 | Safety zone + evacuation |
| Loss of control → off-range impact | 2 | 5 | 10 | Predicted-impact tracking; FTS optional accessory |
| Pyrotechnic failure (no ignition) | 2 | 2 | 4 | Pre-launch inspection |
| Early ignition (accidental) | 1 | 5 | 5 | 2-key ARM + hardware switch + countdown confirmation |
| Staff injury at HIL bench | 2 | 4 | 8 | Emergency stops + acrylic enclosures + buddy system |
| Battery fire (LiPo) | 2 | 4 | 8 | Fire extinguishers + metal storage cabinet + storage protocols |

---

## Glossary and Acronyms

| Term | Meaning |
|------|---------|
| AE | Aerospace Engineer |
| BE | Backend Engineer |
| CE | Control Systems Engineer |
| CEP | Circular Error Probable |
| DATCOM | Digital DATCOM aerodynamic prediction code |
| DO | DevOps Engineer |
| EE | Embedded Engineer |
| ECEF | Earth-Centred Earth-Fixed reference frame |
| ESKF | Error-State Kalman Filter (15-state in this system) |
| FOV | Field of view |
| FTS | Flight Termination System |
| FUR | Forward-Up-Right body-relative frame |
| GCS | Ground Control Station |
| GLB | GL Transmission Format Binary (3D asset) |
| GNC | Guidance, Navigation and Control |
| HAL | Hardware Abstraction Layer |
| HIL | Hardware in the Loop |
| HSM | Hardware Security Module |
| HW | Hardware Engineer |
| IMM | Interacting Multiple Models |
| IMU | Inertial Measurement Unit |
| IPOPT | Interior-Point OPTimiser (NLP solver) |
| JNI | Java Native Interface |
| LOS | Line of Sight |
| LQR | Linear Quadratic Regulator |
| LQG | Linear Quadratic Gaussian |
| MCTU | Mission Control Telemetry Unit (TCP 5900 protocol) |
| ME | Mobile Engineer |
| MHE | Moving-Horizon Estimator (17-state in this system) |
| MisPlot | The legacy 77-byte telemetry frame |
| MPC | Model Predictive Control |
| MRAC | Model-Reference Adaptive Control |
| NE | Navigation Engineer |
| NRLMSISE-00 | NRL high-altitude atmosphere model |
| PCG64 | Permuted Congruential Generator (64-bit deterministic RNG) |
| PID | Proportional-Integral-Derivative |
| PKI | Public-Key Infrastructure |
| PM | Project Manager |
| PN | Proportional Navigation |
| QA | Quality and Test Engineer |
| RACI | Responsible / Accountable / Consulted / Informed |
| RBAC | Role-Based Access Control |
| RTK | Real-Time Kinematic GPS |
| SA | Systems Architect |
| SAS | Satellite-Based Augmentation System |
| SBAS | Satellite-Based Augmentation System |
| SE | Safety Engineer |
| SIL | Software in the Loop |
| SPOF | Single Point of Failure |
| TVC | Thrust-Vector Control |
| WLS | Weighted Least Squares |

---
