# Rocket GNC System Plan v8

A unified, rocket-agnostic, multi-stage Guidance, Navigation and Control system, driven by
rocket templates, mission files, an actuator library, a controller library and a hardware
mapping. Any rocket that satisfies the Template Validation Contract (clauses C1–C25) can be
imported, simulated, tuned, tested and flown without source-code changes. Two flight-computer
paths are first-class: Path A (Snapdragon 845 + STM32L431 peripheral) and Path B (STM32H743/
H753 + FreeRTOS).

> **v8 is an audit-driven, reality-aligned supersession of v5.4.** It does **not** re-specify
> the architecture from scratch — v5.4 remains the detailed phase/section reference. v8
> records the *true* as-built state (per the multi-discipline audit `GNC_System_Audit_v5.4.md`),
> makes every masked gap explicit, adds the safety invariants the audit found missing, and
> defines a priority-ordered execution plan (P0→P5 tiers backing the audit's 8-item sprint
> order). Companion file: `IMPLEMENTATION_CHECKLIST.md` (done / not-done, same priority order).

---

## 0. Why v8 exists (audit summary)

A full multi-discipline audit of v5.4 against the built artifacts (`gnc-core`, `gnc-backend`,
`gnc-frontend`, `rockets/`, `schemas/`, build/deploy config) found that **the interfaces and
orchestration are real, but the safety- and flight-critical internals behind them are largely
scaffolding — and several gaps are *masked* as functional.** That masking (false-PASS
validation, advanced-control class names over PD stubs, UI-only safety interlocks) is the most
dangerous pattern for a flight program, because *apparent* fidelity overstates *actual*
fidelity.

**Overall fidelity rating: CONCERNING.** Roughly 30–40% of the advertised system is genuinely
built. The macro-architecture and ground software track the plan well; a few core algorithms
(6-DOF physics, IMM filter, PID) are real. But navigation never runs, 9/12 controllers and
21/25 validation clauses are stubs, guidance/staging are unimplemented, there is no firmware
for either path, no enforced authentication/authorization, and no CI pipeline.

v8's job is to make the plan **honest** and **fail-safe**, and to sequence the work that
closes the gap.

---

## 1. Change-log v5.4 → v8

This change-log is the authoritative list of what v8 changes relative to v5.4. Each entry is
tagged: **[FAIL-SAFE]** corrects a defect that can produce a dangerously wrong "ready" state;
**[ENFORCE]** turns an asserted property into a checked one; **[HONESTY]** rewrites a v5.4
claim to match reality; **[ADD]** adds a requirement v5.4 omitted.

| # | Tag | Change | Anchor in v5.4 |
|---|-----|--------|----------------|
| 1 | FAIL-SAFE | **Validation aggregation is now fail-closed.** An un-implemented *required* clause MUST block (treated as FAIL), never silently pass. `NotApplicable` is no longer ignored by `aggregate()`. See §3 (Systems) + §6 (Validation Contract). | Contract C1–C25 / Verdict aggregation |
| 2 | HONESTY | **Validation Contract re-scoped to "implemented vs required-but-stubbed".** v5.4 presented all 25 clauses as if live; v8 marks C1/C2/C15/C17 *implemented* and C3–C14, C16, C18–C25 *required-but-stubbed (blocking)*. | C1–C25 table |
| 3 | FAIL-SAFE | **Clause↔number desync fixed and frozen to a single source of truth.** v5.4/code drifted (e.g. `run_C7` labeled "thrust curve", C19–C23 shuffled). v8 freezes the C-map in `schemas/` and requires a test that code labels == contract. | C-clause numbering |
| 4 | ENFORCE | **Server-enforced RBAC is mandatory.** Frontend RBAC is *advisory only*; every mutating/launch-relevant route MUST carry a `MinRoleFilter`. UI-only gating of a safety control is forbidden. | Phase 6 / auth |
| 5 | ENFORCE | **Real authentication required.** Replace the `X-Dev-Role` header stub with JWT/JWKS verification (signature, `exp/iss/aud`). `GNC_AUTH_DISABLED=1` is a *local-dev-only* flag that MUST be impossible in a flight/release build. | Keycloak / 2-key ARM |
| 6 | ADD | **Server-side ARM/LAUNCH/ABORT authority.** The launch interlock MUST be enforced by an authenticated backend endpoint, not just Redux state. The hardware-key interlock MUST be checked server-side. | §12 launch / S15 |
| 7 | FAIL-SAFE | **Estimator-in-the-loop is a SIL prerequisite.** SIL MUST close the loop on *estimated* (noisy) state, never truth state. A truth-state run is a *debug* mode and cannot produce a SIL "pass". | Phase 8 SIL |
| 8 | HONESTY | **Navigation is declared unbuilt.** ESKF/UKF/IMM/MHE are a disconnected *library*; none is instantiated in any loop, `GenericESKF` is additive (not error-state), and `Rocket6DOFProcessModel::propagate` is a position-only Euler stub. | Phase 4 estimation |
| 9 | HONESTY | **Controller library is declared "PID-only real".** 9/12 controllers are self-labeled "math stub" PD laws; v8 forbids registering a stub under an advanced-algorithm name without a `verification_status` field. | Phase 5 control |
| 10 | ADD | **Control-law verification standard.** A controller is not "done" until it meets defined margins / MC pass-rate / saturation-budget criteria per vehicle and flight regime. Registry presence ≠ adequacy. | Phase 5 |
| 11 | FAIL-SAFE | **Guidance is declared hardcoded.** The control target is a hardcoded vertical hold (`pitch=90°`); none of the 5 autopilot modes exist. v8 requires at least one real guidance mode before any guided-flight SIL is credible. | Phase 5 guidance |
| 12 | ADD | **Allocator must be template-driven `M_mix`.** The hardcoded 4-fin allocator (fixed `Cn_delta=Cm_delta=0.05`, ±20° clamp) cannot fly the 8/12-fin GH/SA vehicles the plan centers on. v8 requires the `n×3` mixing matrix + weighted-LS + canard sign. | §5.3 |
| 13 | ADD | **Aero must be δ-dependent** (and β, ideally Re). v5.4 forces include `CN/CM/CY(M,α,δ)` but `AeroCoeffs::lookup(mach,alpha)` ignores δ — so control effectiveness is *not* sourced from aero data. v8 makes δ-swept aero a data-provenance deliverable. | §3.1.1 |
| 14 | ADD | **Staging physics required.** `SeparationTrigger.h` exists but is wired nowhere; no mass/inertia discontinuity, no per-stage aero switch. v8 requires real staging before any multi-stage SIL. | Appendix G |
| 15 | HONESTY | **Gravity is J2-only; v8 states the fidelity-vs-certification mapping.** v5.4 claimed J2/J3/J4. v8 either downscopes to J2 *with a stated validity envelope* or schedules J3/J4 — and defines the minimum physics fidelity required for a SIL pass to be meaningful. | §3.1.1 |
| 16 | ENFORCE | **CI is a first-class deliverable with an owner.** No CI exists today. v8 makes CI (build all targets + run tests + HAL-leak + manifest schema-check + architecture fitness) the enforcement backbone, scoped explicitly rather than assumed. | Phase 13 CI/CD |
| 17 | FAIL-SAFE | **Build inputs must parse/compile.** Fix the broken backend Dockerfile (`COPY ../gnc-core` is outside build context), the malformed `release_manifest.yaml`, and the stale `sim_test.cc` (`#include PointMassSim.h` — class does not exist). | Dockerfile / manifest / tests |
| 18 | ADD | **Firmware is declared 0% built and scheduled.** `gnc-stm32`/`gnc-android`/`gnc-flight`/`gnc-bench` do not exist. v8 schedules a minimal single-path (Path B/STM32H7) bring-up hosting `gnc-core` over the HAL, with watchdog + safe-mode, before any dual-path/parity claim. | Phase 7 |
| 19 | ADD | **Formal safety case required.** No FHA/FMEA/SSA/fault-tree exists and no standard is invoked. v8 adds a systematic, traceable safety case (target standard to be selected: MIL-STD-882 / ECSS-Q-ST-40 / DO-178C-equivalent) instead of scattered risk-register rows. | Phase 12 |
| 20 | ADD | **Golden set + closed-loop GNC regression.** `rockets/BA/golden/` is empty; there is no end-to-end GNC-loop test. v8 requires ≥8 envelope cells and a closed-loop attitude-tracking regression once nav+control are real. | Phase 8 / Appendix C |
| 21 | ADD | **Repo-hygiene gate.** Dev-scratch artifacts (`fix.py`, `patch_s5*.py`, `*.bak`, a 16 MB `sim_run_BA_67.csv`, `req*.json`, `build_log.txt`) must be removed and blocked by CI. | repo root |

---

## 2. v8 mandatory invariants (new, non-negotiable)

These are the safety/quality invariants the audit found missing. They sit **above** the phase
specs and override any conflicting v5.4 text.

- **INV-1 (Fail-closed validation).** A template is `PASS` only if **every required clause is
  implemented and PASS**. Any required clause that is un-implemented, errored, or `NotApplicable`
  ⇒ overall **FAIL**. Optional clauses may `WARN`. No code path may certify a template while
  skipping a physics- or safety-relevant clause.
- **INV-2 (Server-enforced authority).** Every state-changing or launch-relevant action is
  authorized **server-side** against a verified identity. Frontend gating is a UX convenience
  and is assumed bypassable. The ARM/LAUNCH/ABORT path is server-authenticated end-to-end.
- **INV-3 (Estimated-state SIL).** A SIL run that closes the loop on truth state is a *debug*
  run and can never yield a "pass". SIL "pass" requires the controller to be fed from a real
  estimator running on a real (RK4) process model with sensor noise injected.
- **INV-4 (No mislabeled algorithms).** A controller/estimator registered under a named
  algorithm MUST carry a `verification_status` ∈ {`stub`, `implemented`, `verified`}. The UI
  and validator surface this; a `stub` may never be reported as flight-ready.
- **INV-5 (CI-gated truth).** Anything the plan relies on as a gate (golden/parity/Valgrind/
  HAL-leak/manifest-schema/architecture-fitness) MUST run in CI. A gate that does not run in
  CI does not count as a gate.
- **INV-6 (Flight-build hardening).** A flight/release build MUST fail to compile or boot if
  auth is disabled, if any HAL is stubbed (`any_stubbed == true`), or if firmware signing is
  absent.

---

## 3. Reality baseline by discipline (as-built vs required)

For each discipline: **Built (real)** / **Stubbed or wrong (active defect)** / **Missing (gap)**
/ **Revised v8 requirement**. Citations are file/function-level. Severities are the audit's.

### 3.1 Systems Architect — *worst gap: CRITICAL (false-PASS gate)*
- **Built:** 5-layer decomposition (`gnc-core`→`gnc-backend`→`gnc-frontend`, `rockets/`,
  `schemas/`) with correct dependency direction; HAL factory (`HalFactory.h/.cc`,
  `resolve<T>(...)`, `any_stubbed` at boot); template-as-config (YAML, not compiled);
  25-row validation report surface; audit-as-middleware (`registerPostHandlingAdvice`).
- **Stubbed/wrong:** `Verdict.h::aggregate()` ignores `NotApplicable`, so a template passing
  only C1/C2/C15/C17 reports overall **PASS** (false-PASS); clause labels desynced from
  contract numbers; SIL↔HIL↔Flight parity compares binaries that don't exist.
- **Missing:** enforced ICDs (no firmware↔backend ICD); functional template↔core version
  matrix (`release_manifest.yaml` malformed); malformed/partial-template override+sign-off
  workflow; architecture fitness functions (no `gnc-core`-has-no-backend-deps check in CI).
- **v8 requirement:** INV-1 + INV-5; freeze the C-map to a single source of truth in
  `schemas/` with a label-equality test; define `NotApplicable` semantics explicitly
  (un-run required safety clause ⇒ block).

### 3.2 Aerospace — *worst gap: HIGH (δ-independent aero + unsimulated staging)*
- **Built:** real 6-DOF rigid-body integrator (`Full6DOFIntegrator.cc`, ~753 LOC): quaternion
  attitude w/ per-step renorm, full asymmetric Euler (`ω×Iω`), RK4, launch-rail constraint,
  NaN/Inf guards, jet-damping/tip-off; frame discipline (`r_n`,`v_n`,`q_b_n`,`omega_b_b`);
  table-driven atmosphere/thrust/aero at the sim boundary (`Tables.cc`); 3 fidelities
  (`ThreeDOF`/`Tuning`/`Full`).
- **Stubbed/wrong:** gravity **J2-only** (no J3/J4 anywhere); aero is **2-D (M,α) only** —
  `AeroCoeffs::lookup(mach,alpha_deg)` ignores δ, β, Re, so control effectiveness is not
  sourced from aero (allocator hardcodes `Cm_delta=Cn_delta=0.05`); **staging not simulated**
  (`SeparationTrigger` referenced nowhere; no mass discontinuity); no wind/turbulence in loop
  (simple `rho=1.225·exp(-alt/8500)` fallback).
- **Missing:** golden-log validation (`rockets/BA/golden/` empty); structural/max-Q margins;
  trajectory-optimization interface; multi-stage physics (Appendix G).
- **v8 requirement:** add δ-dependence (and β; Re if feasible) to aero tables + lookup;
  implement staging discontinuities via `SeparationTrigger`; state the **fidelity-vs-
  certification mapping** (min gravity order / aero dimensionality / wind model for a
  meaningful SIL pass); reconcile the "1-hour onboarding" claim with δ-swept aero-deck
  provenance cost.

### 3.3 Control — *worst gap: CRITICAL (advertised control library non-existent; no guidance)*
- **Built:** controller-factory topology (`ControllerFactory::create` → `{IController,
  IControlAllocator}`, 12 named classes + `FallbackController`); **PID is real** (cascaded
  attitude/rate, `wrap_pi`, anti-windup ±10, discrete derivative); actuator rate/pos limiting
  + achieved-moment back-computation under saturation in `Full6DOFIntegrator::step`.
- **Stubbed/wrong:** **9/12 controllers are "math stub" PD laws** (`LQR` has no Riccati solve;
  `MPC_linear/nonlinear` "stubbed out"; `LQG`,`H_infinity`,`SDRE`,`SlidingMode`,`Backstepping`,
  `MRAC`,`L1_adaptive` likewise); **guidance hardcoded** to `target.euler={0,90°,0}` vertical
  hold; **TVC inert** (`thrust_n=0` so `denom=thrust·lever≈0`); **allocator hardcoded 4-fin**,
  cannot fly GH(8)/SA(12), no canard sign inversion.
- **Missing:** gain scheduling (`PID_GS` is a stub); Monte-Carlo dispersions (fixed seed
  `12345`); in-loop FDIR; phase/gain-margin & latency-budget artifacts.
- **v8 requirement:** template-driven `M_mix` allocator (P3); ≥1 real guidance mode (INV-3
  dependency); INV-4 verification_status; a control-law verification standard (INV-10/§1#10);
  graduate stubs to real controllers behind that standard (ongoing, not day-1).

### 3.4 Navigation — *worst gap: CRITICAL (no navigation anywhere in executable system)*
- **Built:** coherent estimator hierarchy (`AbstractFilter/ProcessModel/MeasurementModel`,
  `IEstimator`; `GenericESKF`,`GenericUKF`,`IMMFilter`,`FallbackEKF`, LM-MHE solver). **IMM is
  textbook-correct**; the MHE LM solver is a real sparse Gauss-Newton/LDLT solve. `SensorModel`
  injects accel/gyro white noise, bias random-walk, GPS pos/vel noise.
- **Stubbed/wrong:** **entire stack is dead code** — no instantiation in `gnc-core/src/sim`
  or `gnc-backend`; `Full6DOFIntegrator::step` feeds the controller from **true** state
  ("an Estimator would sit here"); `GenericESKF` injects **additively** (not SO(3)/quaternion
  error-state); `Rocket6DOFProcessModel::propagate` is **position-only Euler** ("should call
  RK4"); MHE applies all measurements at the terminal node.
- **Missing:** real sensor fusion (time-align/outlier/gating); full IMU error model (scale
  factor, misalignment, g-sensitivity, temp drift, vibration); baro/magnetometer; GPS-denied/
  INS coasting; nav init (alignment/initial covariance); latency/buffering; observability
  analysis.
- **v8 requirement:** **P1** — wire one estimator (ESKF or IMM) into the sim loop; fix
  `Rocket6DOFProcessModel::propagate` to real RK4 dynamics; make `GenericESKF` a true
  error-state filter; feed the controller from estimated state; codify INV-3. Define a
  solver-abstraction contract (LM vs IPOPT/acados) + equivalence test instead of naming
  heavyweight solvers the build doesn't use.

### 3.5 Backend — *worst gap: CRITICAL (no real auth + unenforced RBAC)*
- **Built:** clean Drogon service (`main.cc`, CORS+audit middleware, `/api/v1` surface);
  in-process SIL orchestration (`SimulationController`+`SimRunRegistry`, REST-for-control +
  WS-for-stream); real relational schema (`001_init.sql`: versioned templates/missions, runs,
  audit_log, TimescaleDB); RBAC role model defined (`KeycloakAuth.h`).
- **Stubbed/wrong:** **auth is a spoofable `X-Dev-Role` header** (or `GNC_AUTH_DISABLED=1` ⇒
  Admin), no JWT/JWKS/`exp/iss/aud`; **`MinRoleFilter`s attached to no routes** (RBAC is
  UI-only, bypassable by direct API call) — including `POST /simulation/start`,
  `PUT /hardware/assignments`, `POST /missions/{id}/lock`; **template lifecycle returns
  501/503** (`POST/PUT/PATCH/DELETE/duplicate` "not yet implemented"); persistence not wired
  (templates from disk, audit to flat JSONL "until libpqxx is wired").
- **Missing:** real telemetry ingestion + backpressure (only sim WS); multi-vehicle parallel
  SIL / job queue at scale; gRPC (arguably correctly omitted).
- **v8 requirement:** **P0** — real JWT verification + attach `MinRoleFilter` to every
  mutating route + server-side ARM/LAUNCH/ABORT authority (INV-2, INV-5/§1#5,6); then wire
  persistence and the template import/version/rollback flow.

### 3.6 Frontend — *worst gap: MEDIUM (UI-only safety gating + bundle governance)*
- **Built:** 30 `S*.tsx` screens matching Phase 6; modern stack (React 19 + RTK + Vite + TS +
  Tailwind 4; three/r3f/drei + Cesium/resium; AG-Grid/Handsontable; uPlot/Plotly/Recharts/d3;
  i18n EN/AR RTL); type-gen from backend (`generate_types.mjs`); 25-clause validation UI;
  thoughtful launch UX (`S15_LaunchControl.tsx`: ARM→LAUNCH state machine, `hardwareKeyPresent`
  interlock, audit-on-ARM).
- **Stubbed/wrong:** launch interlock is **Redux-only** (no authenticated server command — see
  INV-2); charting/3D library redundancy (uPlot+Plotly+Recharts+d3, three+Cesium+Leaflet) →
  bundle-bloat risk with no budget guard; committed `.bak` files (`S6c_SimFull.tsx.bak`,
  `Layout.tsx.bak`).
- **Missing:** live telemetry from real hardware; bundle/build-budget + served artifact
  pipeline (no frontend Dockerfile, no CI build).
- **v8 requirement:** back ARM/LAUNCH/ABORT with the P0 server endpoint; add a bundle-budget
  CI check; concrete high-stress ergonomics spec (color-blind-safe, confirm-timeouts,
  mis-click guards).

### 3.7 Embedded — *worst gap: CRITICAL (no flight software exists)*
- **Built:** HAL contracts firmware would implement (`IFinDriver`,`ISeeker`, CAN/thermal/USB)
  + stub set (`hal/stub/StubHals.cc`) + registration factory; `build_default(flight_build)`
  with `any_stubbed` boot guard.
- **Stubbed/wrong:** the only "native" HAL is **desktop Windows** (`UsbScan`,`WindowsCan`,
  `WindowsThermal`) used by the ground backend — not flight code.
- **Missing:** **everything embedded** — `gnc-stm32`/`gnc-android`/`gnc-flight`/`gnc-bench`
  do not exist; no RTOS task model, no WCET/deadline analysis, no drivers (SPI/I²C/UART, DMA
  vs IRQ), no actuator outputs (PWM/CAN/RS-422), no memory layout/stack sizing, no boot/
  safe-mode (§7.10), no watchdog, no firmware update/rollback/signing; COBS USB-CDC peripheral
  protocol (921600 bps, CRC-16/CCITT) has no firmware endpoint; no DO-178C reference.
- **v8 requirement:** **P5** — minimal Path B/STM32H7 bring-up hosting `gnc-core` over HAL +
  watchdog + safe-mode, *before* any dual-path/parity claim; INV-6 flight-build hardening.

### 3.8 Mobile (= Path A Android flight wrapper) — *worst gap: HIGH (Path A unproven+unbuilt)*
- **Built:** correct architectural treatment of Android as a HAL target, not a separate
  codebase.
- **Missing:** `gnc-android` entirely (USB host/accessory roles, STM32L431 link over USB-CDC,
  on-device GNC loop). No operator phone app was planned (correctly) and none exists.
- **v8 requirement:** analyze Android hard-real-time suitability (RT patch / cgroup / core
  isolation / thermal throttling for a 100 Hz loop) **before** committing Path A; treat Path A
  as a research spike gated behind Path B (P5).

### 3.9 Hardware — *worst gap: HIGH (pyro/arming safety + HW interface enforcement absent)*
- **Built:** hardware *interface* contracts as artifacts (`schemas/hardware_mapping*.yaml`:
  CAN node IDs, pyro events, per-fin servo map; per-rocket mapping files); `HardwareController`
  + USB scan device-discovery surface.
- **Stubbed/wrong:** only C11 partially implemented ("merged doc has a `hardware` key"); C21
  (per-stage CAN/pyro resolution) and C25 (CAN util <70%) are stubs — mapping asserted in YAML
  but not enforced.
- **Missing:** all physical-HW engineering (board power/thermal/EMI, harness/pinouts, sensor
  placement, **pyro fire-circuit isolation/safing/arming**, power rails/battery, environmental
  qual, HW redundancy, PCB SI); register maps / version-locking.
- **v8 requirement:** implement C11/C21/C25 enforcement; specify pyro inhibit architecture
  (independent inhibits, no-fire/all-fire margins) as part of the safety case (P-cross-cutting).

### 3.10 Quality & Test — *worst gap: HIGH (no executable acceptance gate; broken core test)*
- **Built:** test scaffolding across all 3 layers (Catch2 core, backend `validator_test.cc`,
  Vitest + Playwright FE); RBAC Playwright suite asserts ARM enable/disable by role; serious
  test *strategy* on paper (Appendix C tolerances, 103-col log schema, golden regression, ≥8
  cells, parity ≥90%, Valgrind/ASan).
- **Stubbed/wrong:** **`sim_test.cc` references deleted `PointMassSim`** (`#include
  gnc-core/sim/PointMassSim.h` — no such class) ⇒ core physics regression won't compile;
  **no GNC-loop test** (no closed-loop integrator+controller+allocator, no estimator test);
  contract coverage ~16% by construction (only 4/25 real); SIL/golden/parity machinery has no
  inputs.
- **Missing:** SIL scenario library, golden logs, dual-path parity harness, MC, HIL;
  traceability matrix; defect register with risk classification.
- **v8 requirement:** **P2** fix stale test; **P4** golden set (≥8 cells) + closed-loop GNC
  regression; "tests-match-current-code" CI hygiene gate; define SIL "pass" as *functional
  adequacy* (estimated state + real guidance + staging), not just tolerance bands.

### 3.11 Safety — *worst gap: CRITICAL (no enforced safety gating; no safety case; no abort/FTS)*
- **Built:** honest, recorded posture decisions (single-FC SPOF accepted w/ RPN 15; no
  in-flight abort post-liftoff; FTS external-only); Risk Register w/ likelihood×severity×RPN;
  layered arming *intent* (`abort_policy` C24, `nail_pyro_events` C17, safe-mode-on-missed-
  cadence §7.10).
- **Stubbed/wrong:** **every safety-relevant clause is a non-blocking stub** (C7 static
  stability, C8 thrust integrity, C9 fin authority, C18 timing, C24 abort policy, C25 CAN
  budget) — a template with no abort policy + unstable CP can report PASS; safe-mode/abort
  have no implementation substrate (firmware absent); ARM interlock UI-only + server-
  unauthenticated; C405 CAN abort message has no endpoint.
- **Missing:** **all formal analyses — FHA, SSA, FMEA/FMECA, fault trees**; pyro inhibit
  architecture; range-safety/FTS integration; personnel ground-safety interlocks.
- **v8 requirement:** INV-1 makes safety clauses blocking (P0); add a **systematic, traceable
  safety case** under a selected standard (cross-cutting, starts immediately); server-side
  abort path (P0) + firmware safe-mode (P5); justify "no in-flight abort + no FTS" against
  off-range-impact hazard severity.

### 3.12 DevOps — *worst gap: HIGH (no CI; broken release/build inputs)*
- **Built:** real multi-service compose topology (nginx→backend→TimescaleDB→MinIO→Keycloak,
  `127.0.0.1`-bound per on-prem mandate, read-only mounts); reproducible backend build intent
  (Conan+CMake+Ninja, multi-stage Dockerfile); FE dependency pinning + type-gen.
- **Stubbed/wrong:** **no CI/CD at all** (`check_hal_leak.cmake` exists but nothing runs it);
  **backend Dockerfile can't build** (`COPY ../gnc-core` outside build context, contradictory
  `context: ..`); **`release_manifest.yaml` malformed** (invalid `committed_rockets` list,
  junk `- dfg`/`_copy`/duplicate `notes`); **poor repo hygiene** (`fix.py`,`fix_s6c.js`,
  `patch_s5*.py`,`plot_traj.py`,`test_api.js`,`req1..4.json`,`build_log.txt`, 16 MB
  `sim_run_BA_67.csv`, `.bak` files).
- **Missing:** artifact/firmware signing (null `firmware_sha256`/`signing_key_id`); secrets
  management (dev creds only); observability (logs/metrics/traces — only `std::cout`+JSONL);
  IaC, multi-target build orchestration, rollback automation.
- **v8 requirement:** **P2** stand up CI (build all targets + tests + HAL-leak + manifest
  schema-check + architecture fitness + repo-hygiene); fix Dockerfile, manifest, stale test;
  add signing + secrets + observability as follow-ons; INV-5.

---

## 4. Validation Contract v8 (C1–C25 status + aggregation policy)

**Aggregation policy (replaces v5.4):** `PASS` iff every **Required** clause is `implemented`
and `PASS`. Any Required clause that is `stub`/`NotApplicable`/errored ⇒ overall **FAIL**.
`Optional` clauses may `WARN` without blocking. (Implements INV-1.)

| Clause | Subject | As-built | v8 class |
|--------|---------|----------|----------|
| C1 | template parse/shape | implemented | Required |
| C2 | mission/template cross-refs | implemented | Required |
| C7 | static stability (CP/CG margin) | **stub (mislabeled "thrust curve")** | Required (blocking) |
| C8 | thrust integrity | **stub (mislabeled "atmosphere coverage")** | Required (blocking) |
| C9 | fin authority | **stub** | Required (blocking) |
| C11 | hardware mapping resolves | partial ("has `hardware` key") | Required |
| C14 | actuator references | **stub (mislabeled "capable_modes")** | Required |
| C15 | (real) | implemented | Required |
| C17 | nail/pyro events per separation | implemented | Required |
| C18 | timing reachability | **stub** | Required (blocking) |
| C19–C23 | (labels shuffled vs plan) | **stub** | Required |
| C21 | per-stage CAN/pyro resolution | **stub** | Required |
| C24 | abort policy (WARN onboarding / FAIL flight) | **stub** | Required (blocking at flight) |
| C25 | CAN bus utilization < 70% | **stub** | Required (blocking) |

> Action items: (a) implement C7/C8/C9/C18/C24/C25 physics & safety checks; (b) fix
> clause↔number desync and freeze the C-map in `schemas/` with a label-equality test; (c)
> implement the malformed/partial-template WARN-with-override + SA sign-off workflow.

---

## 5. Revised success criteria / Definition of Done (v8)

v5.4's success criteria ("pass C1–C25", "dual-path parity ≥90%", "≥1 flight per path") are
retained as the *eventual* bar but are **not reachable from today's artifacts**. v8 defines a
staged Definition of Done so progress is honest:

- **DoD-A (Trustworthy gate):** validator fail-closed (INV-1); real auth + server RBAC
  (INV-2); CI green on all current targets (INV-5). *No "PASS" or "ready" is meaningful before
  DoD-A.*
- **DoD-B (Representative SIL):** estimator-in-the-loop (INV-3); ≥1 real guidance mode;
  template-driven allocator; δ-dependent aero + staging; closed-loop GNC regression + ≥8
  golden cells. *Only now is a SIL "pass" credible.*
- **DoD-C (Flight substrate):** Path B/STM32H7 minimal flight target over HAL with watchdog +
  safe-mode + signing (INV-6); firmware↔backend ICD enforced.
- **DoD-D (Dual-path):** Path A spike resolved; both paths build in CI; parity ≥90% on real
  binaries; safety case (FHA/FMEA/SSA) complete under the selected standard.

---

## 6. Priority-ordered execution plan (P0→P5)

This is the backbone the user requested. Tiers **P0→P5** preserve the audit's authoritative
8-item sprint order (§13.5, items 1–8). Each item lists **status %**, **deliverables**,
**success criteria**, **affected files**, and **dependencies**. The companion
`IMPLEMENTATION_CHECKLIST.md` carries the same items as checkboxes.

> Ordering rationale (audit §13.5): (1) safety-criticality, (2) unblocking other work,
> (3) risk reduction.

### P0 — Stop the bleeding (nothing downstream is trustworthy until these land)

**P0.1 — [Audit Priority 1][SAFETY/SYSTEMS] Fail-safe validator.** Status **~10%** (4/25
clauses real; aggregation actively wrong).
- *Deliverables:* change `Verdict.h::aggregate()` so any Required un-implemented/`NotApplicable`
  clause ⇒ FAIL; tag each clause Required/Optional; fix clause↔number desync; freeze C-map in
  `schemas/` + label-equality test.
- *Success:* a template passing only C1/C2/C15/C17 now reports **FAIL**; `validator_test.cc`
  asserts fail-closed behavior.
- *Files:* `gnc-backend/src/validator/{Verdict.h,Validator.cc}`, `schemas/`,
  `gnc-backend/tests/validator_test.cc`.
- *Deps:* none. **Highest leverage; do first** (one-function change stops false-PASS).

**P0.2 — [Audit Priority 2][BACKEND/SAFETY] Real auth + enforced RBAC + server ARM authority.**
Status **~15%** (role model defined; nothing enforced).
- *Deliverables:* JWT/JWKS verification (`exp/iss/aud`) replacing `X-Dev-Role`; attach
  `MinRoleFilter` to **every** mutating route; add authenticated `ARM/LAUNCH/ABORT` endpoints +
  server-side hardware-key check; make `GNC_AUTH_DISABLED` impossible in flight/release builds.
- *Success:* direct API calls to mutating/launch routes without a valid token are rejected;
  Playwright RBAC suite extended to hit the API (not just UI).
- *Files:* `gnc-backend/src/auth/KeycloakAuth.{h,cc}`, all `*Controller.h` `ADD_METHOD_TO`,
  new launch controller, `gnc-frontend/src/screens/S15_LaunchControl.tsx`.
- *Deps:* none (parallel with P0.1).

### P1 — Make SIL representative

**P1.1 — [Audit Priority 3][NAVIGATION] Estimator-in-the-loop + real process model.** Status
**~25%** (library exists, IMM correct; zero integration; ESKF additive; process model is Euler
stub).
- *Deliverables:* instantiate one estimator (ESKF or IMM) in `Full6DOFIntegrator`; replace
  truth-state feedback with estimated state; fix `Rocket6DOFProcessModel::propagate` to real
  RK4 dynamics (vel/quat/rate, not pos-only); make `GenericESKF` a true error-state filter
  (quaternion/SO(3) injection); codify INV-3 (truth-state = debug only).
- *Success:* SIL closes the loop on noisy estimated state; a nav-accuracy test bounds estimate
  error vs truth across an envelope cell.
- *Files:* `gnc-core/src/sim/Full6DOFIntegrator.cc`,
  `gnc-core/src/estimation/{Rocket6DOFProcessModel.cpp,GenericESKF.cpp,IMMFilter.cpp}`.
- *Deps:* P0 (so SIL results are gated by a trustworthy validator).

### P2 — Enforcement backbone

**P2.1 — [Audit Priority 4][DEVOPS/QUALITY] CI + fix broken build inputs.** Status **0%** (no
CI; Dockerfile/manifest/test broken).
- *Deliverables:* CI that builds all 3 current targets (core, backend, frontend), runs Catch2/
  Vitest/Playwright, runs `check_hal_leak.cmake`, schema-checks `release_manifest.yaml`, runs
  an architecture-fitness check (`gnc-core` has no backend includes), and a repo-hygiene gate;
  fix backend Dockerfile (build-context), repair `release_manifest.yaml`, repoint/fix the
  stale `sim_test.cc` (`PointMassSim` → current integrators); remove dev-scratch artifacts.
- *Success:* CI green on `main`; broken Dockerfile/manifest/test no longer present; hygiene
  gate blocks `*.bak`/scratch files.
- *Files:* `.github/workflows/*`, `gnc-backend/Dockerfile`, `release_manifest.yaml`,
  `gnc-core/tests/sim_test.cc`, repo root cleanup.
- *Deps:* none structurally, but most valuable after P0/P1 so it gates real behavior.

### P3 — Control & physics content

**P3.1 — [Audit Priority 5][CONTROL] Template-driven `M_mix` allocator.** Status **~20%**
(4-fin hardcoded; back-computation good).
- *Deliverables:* `n×3` mixing matrix for 4/8/12 fins; weighted least-squares for over-
  actuated GH(8)/SA(12); canard sign-inversion (BA); source `C*_delta` from aero data (not
  hardcoded 0.05).
- *Success:* GH and SA templates allocate correctly in SIL; allocator unit test across fin
  counts.
- *Files:* `gnc-core/src/control/ControlAllocator.cc`, aero lookup (`Tables.cc`,`AeroCoeffs`).
- *Deps:* P3.2 (δ-dependent aero) for real `C*_delta`; P1 for meaningful closed-loop check.

**P3.2 — [Audit Priority 6][AEROSPACE] δ-dependent aero + staging discontinuities.** Status
**~30%** (2-D aero real; δ/β/Re/staging absent).
- *Deliverables:* extend aero tables + `AeroCoeffs::lookup` to `(M,α,δ)` (+β; Re if feasible);
  implement staging mass/inertia discontinuity + per-stage aero switch via `SeparationTrigger`;
  add wind/turbulence injection; state fidelity-vs-certification mapping (and decide J2 vs
  J3/J4).
- *Success:* control effectiveness sourced from aero; a 2-stage SIL shows correct mass-drop at
  separation; documented min-fidelity-for-SIL-pass.
- *Files:* `gnc-core/src/sim/{Full6DOFIntegrator.cc,Tables.cc}`,
  `gnc-core/.../SeparationTrigger.*`, aero CSV provenance docs.
- *Deps:* P1 (loop must be real to see effects).

### P4 — Acceptance baseline

**P4.1 — [Audit Priority 7][QUALITY] BA golden set + closed-loop GNC regression.** Status **0%**
(`golden/` empty; no GNC-loop test).
- *Deliverables:* generate ≥8 envelope-cell golden logs for BA (once nav+control real); add a
  closed-loop attitude-tracking regression (integrator+estimator+controller+allocator);
  populate `tolerances.yaml`/`scenarios.yaml`.
- *Success:* `make test` / CI runs a real acceptance baseline; regressions detected.
- *Files:* `rockets/BA/golden/`, `rockets/BA/{tolerances,scenarios}.yaml`,
  `gnc-core/tests/`.
- *Deps:* P1, P3.1, P3.2 (a golden set on stub internals would bake in wrong behavior).

### P5 — Flight substrate

**P5.1 — [Audit Priority 8][EMBEDDED] Minimal Path B/STM32H7 flight target.** Status **0%**
(no firmware anywhere).
- *Deliverables:* `gnc-stm32` project hosting `gnc-core` over the HAL (FreeRTOS or bare loop),
  watchdog, safe-mode entry, minimal driver set, firmware signing hook; firmware↔backend ICD;
  INV-6 flight-build hardening (fail if `any_stubbed`/auth-disabled/unsigned).
- *Success:* `gnc-core` runs on-target in a HIL/bench loop with watchdog + safe-mode; second
  execution substrate exists for future parity.
- *Files:* new `gnc-stm32/`, HAL native impls, `release_manifest.yaml` firmware fields.
- *Deps:* P1 (a real core loop), P2 (CI to build the target), P0 (auth for the ground link).

### Cross-cutting (start immediately, run alongside all tiers)
- **Safety case (FHA/FMEA/SSA/fault trees) under a selected standard** (MIL-STD-882 / ECSS-Q-
  ST-40 / DO-178C-equiv). Blocks DoD-D; informs INV-1 clause priorities and pyro inhibit
  architecture.
- **Graduate stub controllers** to real implementations behind the control-law verification
  standard (INV-4/§1#10) — ongoing, *not* day-1; each promotion flips `verification_status`.
- **Persistence + template import/version/rollback** (backend 501/503 endpoints → real),
  wiring libpqxx + the `001_init.sql` schema.

---

## 7. Sequencing / dependency graph

```
P0.1 validator ─┐
P0.2 auth/RBAC ─┼─► P1 nav-in-loop ─► P3.2 aero/staging ─► P3.1 allocator ─► P4 golden+regress ─► P5 firmware
                │                          │                                          ▲
P2 CI ──────────┴──────────(gates everything; land asap)──────────────────────────────┘
Safety case (FHA/FMEA/SSA) ───────────── runs in parallel, gates DoD-D ─────────────────►
```

- **P0 before everything:** no result is trustworthy until the gate is fail-closed and the
  backend is authenticated.
- **P1 before P3/P4:** control tuning and golden logs on truth-state feedback are meaningless.
- **P3.2 before P3.1:** the allocator needs real `C*_delta` from δ-dependent aero.
- **P2 ASAP:** without CI, P0–P5 fixes silently rot (the stale test/Dockerfile/manifest prove
  it).
- **P5 last of the eight,** but the safety case and stub-controller graduation run continuously.

---

## 8. Companion deliverable

`IMPLEMENTATION_CHECKLIST.md` — the same P0→P5 backbone as an explicit **done / not-done**
checklist (component-level), so the team can track sprint progress against this plan. The
audit (`GNC_System_Audit_v5.4.md`) remains the evidence base; v5.4 (`Rocket_GNC_System_Plan_
v5.4.md`) remains the detailed phase/section reference.
