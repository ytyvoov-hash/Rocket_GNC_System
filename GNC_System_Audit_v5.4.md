# GNC System Audit — Rocket_GNC_System_Plan_v5.4 vs Built Artifacts

**Auditor role:** Senior Multi-Discipline Systems Auditor
**Target:** `Rocket_GNC_System_Plan_v5.4.md` (5,431 lines) + repository artifacts
**Repo:** `github.com/ytyvoov-hash/Rocket_GNC_System`
**Method:** Full plan read + source-level inspection of `gnc-core`, `gnc-backend`, `gnc-frontend`, `rockets/`, `schemas/`, build/deploy config.

---

## Orienting Summary (read this first)

The plan describes a **flight-grade, dual-path, rocket-agnostic GNC platform**: 12 control algorithms, a 3-estimator stack (ESKF + MHE + IMM), full 6-DOF physics with J2/J3/J4 gravity, a 25-clause template validation contract, SIL↔HIL↔Flight parity at ≥90%, signed firmware on STM32 + Snapdragon, Keycloak RBAC, TimescaleDB telemetry, and three-tier CI.

The built reality is a **well-architected desktop simulation + ground-control web app skeleton**. The strongest assets are: a genuine 6-DOF rigid-body integrator, a clean HAL/factory abstraction, a thoughtfully structured Drogon backend, and a broad, modern React frontend (30 screens). The weakest reality is that **the GNC algorithmic core is largely scaffolding**: 9 of 12 controllers are self-described "math stub" PD laws, the entire estimation/navigation stack is dead code (never instantiated in the sim or flight loop), guidance is hardcoded, staging is unimplemented, 21 of 25 validation clauses are stubs, there is no firmware for either flight path, and there is no CI pipeline at all.

The dominant systemic pattern: **interfaces and orchestration are real; the safety-critical and flight-critical internals behind them are placeholders.** This is fine for a v0.1.0-dev bootstrap, but the plan's success criteria (passing C1–C25, dual-path parity, ≥1 flight per path) are not remotely reachable from the current artifacts, and several gaps are masked rather than surfaced (e.g. validation "PASS" on 4 of 25 clauses, RBAC filters defined but never attached).

---

# 1. SYSTEMS ARCHITECT

### ✅ What Was Built Correctly (As Planned)
- **Layered decomposition matches the plan's 5-layer intent.** `gnc-core` (algorithms/sim), `gnc-backend` (Drogon REST + WS), `gnc-frontend` (React), `rockets/` (templates), `schemas/` (contracts) are cleanly separated with `gnc-core` having no backend/UI dependencies. The dependency direction is correct: backend depends on core, core depends on nothing upward.
- **The HAL abstraction is genuinely well-built.** `gnc-core/include/gnc-core/hal/HalFactory.h` + `src/hal/HalFactory.cc` implement a factory-registration pattern (`resolve<T>(factory, make_stub, flight_build, any_stubbed)`) that defaults to stubs and flips to native implementations when registered. `main.cc` reports `any_stubbed` at boot. This is the correct mechanism for the "same core, different targets" goal.
- **Template-as-config (not code) is structurally honored.** Rockets live as YAML in `rockets/<id>/` and are loaded/parsed (`gnc-backend/src/parser/TemplateLoader`, `YamlToJson`) rather than compiled in. The schema set in `schemas/` (rocket_template, hardware_mapping, mission_file, actuator_library, controller_library, flight_log_103_columns) gives the abstraction a documented contract surface.
- **The validation contract is a real artifact.** The 25 clauses (C1–C25) exist in the plan as a precise table with PASS/WARN/FAIL verdicts, and the backend mirrors them as a fixed-order `run_all()` producing a 25-row report consumed 1:1 by the frontend (`rocketSlice.ts`).

### 🚀 What Was Built Better Than Planned
- **The "complete report, stub the internals" validation pattern is a smart engineering decision.** `Validator.cc` deliberately emits all 25 rows (real for C1/C2/C15/C17, `NotApplicable` stubs for the rest) so the FE renders the full contract UI immediately and clauses can be "flipped to real impls one at a time without touching call sites." This is good incremental-delivery architecture — provided the aggregation is honest (it is not; see ⚠️).
- **Audit-by-middleware is cleanly cross-cutting.** `main.cc` registers a `registerPostHandlingAdvice` hook that calls `audit::on_response` for every mutating REST call, and the DB schema (`001_init.sql`) documents the invariant "every mutating REST call inserts exactly one row in `audit_log`." Centralizing this is better than per-controller audit code.

### ⚠️ What Was Built Worse / Incorrectly
- **The template-validation gate — the linchpin of the entire "rocket-agnostic" thesis — is effectively hollow.** `Verdict.h::aggregate()` returns FAIL only if a clause is FAIL, WARN if any WARN, else PASS. `NotApplicable` is ignored. Since 21 of 25 clauses return `NotApplicable` (`Validator.cc` lines 180–206), a template that passes only C1, C2, C15, C17 reports **overall PASS**. The safety-relevant clauses (C7 static stability, C8 thrust integrity, C9 fin authority, C14 actuator references, C25 CAN bandwidth) never run yet a rocket can be declared valid. This is a built-incorrectly defect, not merely a gap: the gate actively returns a false PASS.
- **Stub clause labels are desynchronized from the contract numbering.** In `Validator.cc`, `run_C7` is annotated "thrust curve sanity check" (plan C7 = static stability), `run_C8` "atmosphere altitude coverage" (plan C8 = thrust integrity), `run_C14` "autopilot capable_modes" (plan C14 = actuator references), and C19–C23 labels are shuffled relative to the plan table. The contract has drifted between document and code with no single source of truth.
- **SIL↔HIL↔Flight consistency model has no built realization.** There is exactly one execution substrate: the desktop sim. There is no HIL harness, no flight binary, and therefore nothing to be "consistent" across. The plan's parity gate (`release_manifest.sil_acceptance.parity_threshold_pct: 90`) compares Path A vs Path B binaries that do not exist.

### ❌ What Is Missing (Was in the Plan, Not Built)
- **ICDs as enforced artifacts.** The plan implies interface control across hardware↔firmware↔backend↔frontend; only the FE↔BE JSON shape is enforced (by shared field names + `generate_types.mjs`). There is no firmware↔backend ICD because there is no firmware.
- **Template/core version-compatibility matrix.** The plan (Decision/§10) calls for vehicle-template ↔ core-version locking; `release_manifest.yaml` is the intended materialization but is non-functional (see DevOps — it is malformed YAML).
- **Malformed/partial-template handling end to end.** The plan specifies WARN-with-operator-override + SA sign-off. The override/sign-off workflow is not implemented; the validator cannot even produce most WARNs because the clauses are stubs.

### 🔍 What the Plan Missed (Plan-Level Gaps)
- **No defined behavior for `NotApplicable`/partial-implementation verdicts.** The plan's contract is binary-ish (PASS/WARN/FAIL) and never anticipated a world where clauses are *not yet implemented*. The code invented `NotApplicable` to fill the gap, and because the plan never specified how to aggregate it, the implementation defaulted to "ignore," producing the false-PASS above. A plan for an incrementally-built safety gate must specify "un-run safety clause ⇒ block (treat as FAIL), never pass."
- **No architectural fitness functions / enforcement of the layering.** The plan asserts `gnc-core` is dependency-free but provides no automated check (no CI rule, no `check_no_backend_includes`). The one architectural guard that exists (`check_hal_leak.cmake`) has no CI to run it.

### 📊 Discipline Verdict
The macro-architecture is sound and the abstractions (HAL, template-as-config, layered modules) are the best part of the system. But the central contract that makes "any valid template flies" *true* — the validator — currently certifies templates as PASS while skipping every physics- and safety-relevant clause. **Worst open gap severity: CRITICAL** (false-PASS validation gate).

---

# 2. AEROSPACE ENGINEER

### ✅ What Was Built Correctly (As Planned)
- **A real 6-DOF rigid-body integrator exists.** `gnc-core/src/sim/Full6DOFIntegrator.cc` (753 LOC) implements quaternion attitude propagation with per-step renormalization, full asymmetric Euler rotational dynamics (`ω × Iω` coupling), RK4 integration (`rk4_step`), a launch-rail/launch-direction constraint phase, and NaN/Inf guards on the state. This matches plan §3.1.2's "full asymmetric form."
- **Coordinate-frame discipline is present.** The codebase carries frame suffixes (`r_n`, `v_n`, `q_b_n`, `omega_b_b`) as mandated by plan §3.0, and `EarthModel.cc` implements NED/ECEF handling with WGS84 prime-vertical radius and Earth-rate (`OMEGA_E`) terms.
- **Aerodynamic and thrust data are table-driven at the sim boundary.** `UnifiedSim.cc` auto-loads `atmosphere_table.csv`, `thrust_curve.csv`, `aero_coeffs.csv`; `Tables.cc` (535 LOC) parses and interpolates them.
- **Two-fidelity engine selection exists** (plan §3 Q8): `UnifiedSim::Mode { ThreeDOF, Tuning, Full }` instantiates `ThreeDOFIntegrator`, `TuningIntegrator`, or `Full6DOFIntegrator`.

### 🚀 What Was Built Better Than Planned
- **Jet-damping and launch-rail tip-off are actually coded, not just specified.** `Full6DOFIntegrator` honors the variable-mass/launch-rail intent from plan §3.1.1.1 — these are often skipped in first implementations.
- **Defensive numerical hygiene exceeds the plan's prose.** Quaternion renormalization every step, inertia floor guards (`if |I_xx| < 1e-6 → 1.0`), and singular-matrix detection (`|det| < 1e-20`) are implemented at the integrator level.

### ⚠️ What Was Built Worse / Incorrectly
- **Gravity is J2-only, not J2/J3/J4.** Plan §3.1.1 states `F_gravity … includes J2/J3/J4`. `EarthModel.cc` implements only the J2 term (`grep J3|J4` ⇒ none anywhere in `gnc-core`). For long-range/high-apex trajectories this is a fidelity deviation from the stated model.
- **Aerodynamics are 2-D (Mach, α) only.** `AeroCoeffs::lookup(mach, alpha_deg)` ignores Reynolds number, sideslip β, and — critically — fin deflection δ. Plan §3.1.1 forces include `CN(M, α, δ)`, `CM(M, α, δ)`, `CY(M, β, δ)`. Because δ-dependence is absent from the table, **control effectiveness is not sourced from aero data at all** (the allocator hardcodes `Cm_delta = Cn_delta = 0.05`; see Control). The lookup also returns a hardcoded `Cd ≈ 0.4` fallback when data is missing.
- **Staging/separation is not simulated.** `SeparationTrigger.h` exists but is referenced nowhere in any integrator or the backend (`grep SeparationTrigger` ⇒ only its own header). There is no mass discontinuity at separation, no per-stage aero/inertia switch, no fairing jettison. The multi-stage selling point ("any `num_stages`") has no physics realization; the backend `MissionSequencer` does phase *triggers* (time/altitude/mach/accel) but explicitly notes the library/sim hookup is incomplete and performs no mass-drop.
- **Atmospheric anomaly / wind / turbulence not modeled in the loop.** Plan §3.1 calls for ±5–10% ISA density anomaly (`mission.replay.atmosphere_seed`) and the nav discipline implies Dryden/von Kármán. `Full6DOFIntegrator::step` uses a *simple exponential* density fallback (`rho = 1.225·exp(-alt/8500)`) for the allocator path and there is no wind/turbulence injection.

### ❌ What Is Missing (Was in the Plan, Not Built)
- **Validation against reference trajectories / golden logs.** `rockets/BA/golden/README.md` states the directory is **empty** ("Status: empty (initial bootstrap)"). There are zero golden flight logs, so the simulation has never been validated against the Appendix C BA reference dataset.
- **Structural load / max-Q margin modeling.** No structural loads, bending, or max-Q margin computation exists anywhere in `gnc-core`.
- **Trajectory optimization interface.** Not present.
- **Multi-stage architecture (Appendix G).** Not realized in physics (see above).

### 🔍 What the Plan Missed (Plan-Level Gaps)
- **The plan asserts J2/J3/J4 and δ-dependent aero as if free, but never specifies the data-provenance burden.** Producing δ-swept aero tables (CN/CM/CY vs M×α×β×δ) per vehicle is a major wind-tunnel/CFD effort; the plan's "1-hour onboarding" criterion is physically incompatible with generating high-order aero decks, and the plan does not reconcile this.
- **No defined fidelity-vs-certification mapping.** The plan wants SIL "certification confidence" but never states the minimum physics fidelity (gravity order, aero dimensionality, wind model) required before a SIL pass is meaningful. This omission is exactly why a J2-only, δ-independent sim can still be called "the canonical sim" in `release_manifest`.

### 📊 Discipline Verdict
The 6-DOF rigid-body core is the most credible flight-physics artifact in the repo and is genuinely well-engineered. But fidelity falls materially short of the plan (J2-only gravity, δ-independent 2-D aero, no staging, no wind), and with an empty golden set the sim is unvalidated. **Worst open gap severity: HIGH** (δ-independent aero + unsimulated staging undermine any SIL claim for guided or multi-stage vehicles).

---

# 3. CONTROL SYSTEMS ENGINEER

### ✅ What Was Built Correctly (As Planned)
- **The controller-factory + interface topology is correct.** `ControllerFactory::create(TuningParams)` returns `{IController, IControlAllocator}` and dispatches on `params.algorithm` to 12 named classes, with a `FallbackController` default and TVC-vs-fin allocator selection on `controller_type`. The control loop is wired into `Full6DOFIntegrator::step` (`controller->calculate_control(...)` → `allocator->allocate(...)` → actuator rate/position limiting).
- **PID is a real, correctly-structured controller.** `PIDController.cc` implements a cascaded outer-attitude/inner-rate loop with `wrap_pi` angle wrapping, integral anti-windup clamping (±10), and discrete derivative. This matches a legitimate attitude autopilot.
- **Actuator rate + position limiting is enforced at the integrator.** `Full6DOFIntegrator::step` applies `ACTUATOR_RATE_LIMIT_RAD_S` and `ACTUATOR_POS_LIMIT_RAD` slew/clamp and rescales achieved moment by actual-vs-commanded ratio — a correct treatment of actuator saturation feedback.

### 🚀 What Was Built Better Than Planned
- **Achieved-moment back-computation under saturation.** Both `FinAllocator` and `TVCAllocator` return `allocated_aero_moment` / `allocated_thrust_moment` reflecting *saturated* deflections, and the integrator scales by the realized fraction. This closes the saturation loop more honestly than many first implementations.

### ⚠️ What Was Built Worse / Incorrectly
- **9 of 12 "control algorithms" are self-labeled stubs that collapse to PD.** `LQR`, `LQG`, `H_infinity`, `SDRE`, `SlidingMode`, `Backstepping`, `MPC_linear`, `MPC_nonlinear`, `MRAC`, `L1_adaptive` all contain the comment `// This is a math stub implementation` (or "Placeholder") and compute a fixed-gain PD law. Examples:
  - `LQRController.cc`: no Riccati solve; uses a 2-element `K=[k_angle,k_rate]` supplied by the UI as a plain proportional+rate law (`effort = k_angle·e + k_rate·rate`). It is not LQR.
  - `MPCNonlinearController.cc`: comment "Solves finite horizon NLP (stubbed out)"; actual law is `kp=8.5·cos(θ)`, `kd=2.5` PD.
  - `MPCLinearController.cc`: "Solves finite horizon QP (stubbed out)."
  This is the single largest control defect: the plan (§Phase 5, line 354: "`gnc-core` with all 12 control algorithms … day-1") claims a controller library that does not exist beyond PID.
- **Fin allocation is hardcoded 4-fin, not the template-driven M_mix.** Plan §5.3 specifies an `n×3` mixing matrix supporting 4/8/12-fin configs (BA canard sign-inversion, GH 8-fin 30/70 finset weights, SA 12-fin weighted least-squares). `ControlAllocator.cc::FinAllocator` instead hardcodes 4 fins, fixed `Cn_delta/Cm_delta=0.05`, a fixed ±20° clamp, and a fixed cross-fin mixing pattern. Over-actuated vehicles (GH, SA) are not supported; canard sign inversion is absent.
- **No real guidance law.** In `Full6DOFIntegrator::step` the control target is hardcoded `target.euler_angles_rad = {0, 90°, 0}` (vertical hold), and the log field is set via "Guidance stubs" (`guidance_mode = 0`). None of the plan's 5 autopilot modes (`auto_shape`, `fixed_pitch`, `waypoint`, `terminal_homing`, etc.) are implemented.
- **TVC allocation runs against `thrust_n = 0`.** `Full6DOFIntegrator::step` sets `a_state.thrust_n = 0.0` ("keep 0 for aero fins"), so the TVC allocator's `denom = thrust·lever` is ~0 and TVC output is forced to zero. TVC is effectively non-functional in the sim.

### ❌ What Is Missing (Was in the Plan, Not Built)
- **Gain scheduling across flight regimes** (max-Q/MECO/coast/reentry). `PID_GSController` is itself a stub; no scheduling tables are wired.
- **Monte Carlo dispersions.** No MC harness exists (the sim seeds `SensorModel` with a fixed `12345`); no dispersion bounds are computed or certified.
- **In-loop fault detection / control reconfiguration.** None.
- **Phase/gain-margin or latency-budget analysis.** No artifacts.

### 🔍 What the Plan Missed (Plan-Level Gaps)
- **The plan treats "12 algorithms × 7 controller types × 5 autopilot modes, day-1" as a checklist item** (line 354) without acknowledging that LQR/H∞/MPC/MRAC/L1 each require substantial design+tuning+verification per vehicle and per flight regime. The plan's day-1 scope is unrealistic and directly produced the "stub everything to satisfy the registry" outcome.
- **No control-law verification standard.** The plan never defines how a controller is proven adequate (margins, MC pass rate, saturation budget) before a vehicle flies, so a PD-stub labeled "LQR" can pass the registry's C19 "implementation registered" check trivially.

### 📊 Discipline Verdict
Only PID is a genuine controller; the other eleven are PD stubs mislabeled as advanced control, guidance is a hardcoded vertical hold, TVC is inert, and the allocator cannot handle the over-actuated vehicles the plan centers on. The control loop *plumbing* is correct, but the control *content* is placeholder. **Worst open gap severity: CRITICAL** (advertised control library is non-existent; no guidance).

---

# 4. NAVIGATION ENGINEER

### ✅ What Was Built Correctly (As Planned)
- **A coherent estimator class hierarchy exists.** `AbstractFilter`, `AbstractProcessModel`, `AbstractMeasurementModel`, `IEstimator`, with concrete `GenericESKF`, `GenericUKF`, `IMMFilter`, `FallbackEKF`, and an MHE solver (`LevenbergMarquardtMheSolver`). The interfaces are clean and the IMM in particular is a faithful implementation (mixing probabilities, mode-conditioned filtering, Gaussian-likelihood mode update, moment-matched combination) — `IMMFilter.cpp` is correct textbook IMM.
- **A sensor error model exists.** `SensorModel.cc` injects accel/gyro white noise (density/√dt), bias random-walk (bias-instability·√dt), and GPS position/velocity noise — a reasonable first-order IMU/GPS model.

### 🚀 What Was Built Better Than Planned
- **The MHE solver is a real sparse Gauss-Newton/Levenberg-Marquardt batch solver** (`LevenbergMarquardtMheSolver.cpp`): assembles dynamics + measurement residuals, builds a sparse Jacobian via triplets, solves `(JᵀJ + λ·diag)Δx = -Jᵀr` with `SimplicialLDLT`. That is more than the plan strictly required to specify, and it is structurally sound.

### ⚠️ What Was Built Worse / Incorrectly
- **The entire estimation stack is dead code — navigation is never in the loop.** `grep` for `GenericESKF|GenericUKF|IMMFilter|MheSolver|FallbackEKF|Rocket6DOFProcessModel` across `gnc-core/src/sim` and all of `gnc-backend` returns **only the files' own definitions** — no instantiation anywhere. `Full6DOFIntegrator::step` states explicitly: *"the controller uses the direct measured states (in a real system, an Estimator would sit here)."* The controlled attitude (`c_state.euler_angles_rad`) is taken from **true** sim state (`frame_.roll/pitch/yaw_deg`), not from any filter. Only `gyro_measured` is fed through from the sensor model; attitude/position estimation is bypassed entirely. **There is no navigation filter in either the sim or any flight path.**
- **`GenericESKF` is not actually an error-state KF.** `GenericESKF.cpp` injects the correction additively (`nominal_state_ += error_state`) with the comment "Assuming simple additive error state for now." The defining feature of an ESKF — SO(3)/quaternion error injection on the manifold — is absent, so attitude estimation would be incorrect under large attitude error even if it were wired in.
- **The process model the estimators depend on is a position-only Euler stub.** `Rocket6DOFProcessModel::propagate` only does `x_pos += x_vel·dt` and comments "should call RK4 physics engine"; velocity, quaternion, and rate dynamics are not propagated. The Jacobian is a numerical derivative *of this broken propagate*. So even if the ESKF/MHE were instantiated, they would predict on non-physical dynamics.
- **MHE applies all measurements at the terminal node.** `computeResiduals`/`computeJacobian` evaluate every measurement against `x[N]` ("simplified: assuming all measurements happen at current time N for this scaffold"), defeating the horizon-distributed-measurement purpose of MHE.

### ❌ What Is Missing (Was in the Plan, Not Built)
- **Sensor fusion in practice** (time alignment, outlier rejection, measurement gating): none — there is no fusion because the filters are unused.
- **IMU error completeness.** `SensorModel` omits scale-factor error, axis misalignment, g-sensitivity, temperature drift, and vibration — all named in the navigation focus. No barometric altimeter or magnetometer model exists (and `q_b_n_true` is explicitly unused in `compute_measurements`, so there is no attitude aiding source).
- **GPS-denied/INS-coasting strategy, navigation initialization (alignment/initial covariance), latency/buffering, observability analysis:** none implemented (and the GPS model applies no latency despite the plan's 100 ms default).

### 🔍 What the Plan Missed (Plan-Level Gaps)
- **The plan specifies IPOPT (sim) and acados (flight) as the MHE solvers** (and ships `third_party/casadi`, `third_party/acados`), but the built solver is a bespoke LM solver — a reasonable simplification the plan never sanctioned, and one that changes the numerical guarantees the plan assumed. The plan should have defined a solver-abstraction contract and an equivalence test, not named specific heavyweight solvers it then didn't use.
- **No "estimator-in-the-loop is mandatory for SIL" requirement.** The plan never states that SIL must close the loop on *estimated* (not truth) state. That omission is exactly what allowed the integrator to ship with truth-state feedback and still be called the SIL engine — which makes the SIL fundamentally non-representative for navigation.

### 📊 Discipline Verdict
The estimator *library* (especially IMM) is the second-most-credible algorithmic asset, but it is entirely disconnected: no filter runs in any loop, the ESKF isn't a true ESKF, and its process model is a position-only stub. The SIL therefore flies on perfect truth state, so navigation accuracy/observability are completely unverified. **Worst open gap severity: CRITICAL** (no navigation anywhere in the executable system).

---

# 5. BACKEND ENGINEER

### ✅ What Was Built Correctly (As Planned)
- **Clean Drogon service with auto-registered controllers.** `main.cc` boots Drogon, initializes the HAL stack (never `flight_build`), installs CORS + audit middleware, and serves on 8080. Controllers (`Templates`, `Missions`, `Simulations`, `Hardware`, `Libraries`, `Health`, `Audit`) use `ADD_METHOD_TO` route macros with a consistent `/api/v1/...` surface.
- **In-process SIL orchestration exists.** `SimulationController` + `SimRunRegistry` (456 LOC) spawn `SimRun`s, expose `start/stop/load-rocket/update-params/log/download`, and return a `runId` + `ws_url` for live telemetry over WebSocket (`ws/SimulationWs`, `ws/TelemetryWs`, `ws/HardwareWs`). The REST-for-control + WS-for-stream split is the right API choice for this use case.
- **A real, well-commented relational schema** (`db/migrations/001_init.sql`): versioned `templates`/`missions` ((id,version), never overwrite), `runs`, and `audit_log`, idempotent `IF NOT EXISTS`, schema-version metadata. TimescaleDB image selected in compose for time-series telemetry.
- **RBAC role model is defined** (`KeycloakAuth.h`: `Role{Anonymous,Viewer,Engineer,Operator,Admin}`, `MinRoleFilter`, `ViewerOnly/EngineerOnly/OperatorOnly/AdminOnly`).

### 🚀 What Was Built Better Than Planned
- **Audit-as-middleware with operator headers.** The CORS/audit advice threads `X-Operator-ID`/`X-Reason` and writes one audit row per mutation via a pluggable `AuditWriter` (JSONL now, Postgres later). The pluggable writer + documented DB invariant is a clean design.
- **Graceful degradation when persistence isn't wired.** Audit falls back to `./var/audit.jsonl`; templates are read from disk. The system runs without the DB, which is good for incremental bring-up (though it hides how much is unfinished).

### ⚠️ What Was Built Worse / Incorrectly
- **Authentication is a spoofable dev stub.** `KeycloakAuth.cc` is "Skeleton JWT verification": if `GNC_AUTH_DISABLED=1` everything is `Admin`; otherwise it reads the role from an **`X-Dev-Role` HTTP header** with no signature verification, no JWKS, no `exp/iss/aud` checks. Any client can set `X-Dev-Role: admin`.
- **RBAC filters are defined but attached to nothing.** Every `ADD_METHOD_TO(...)` in the controller headers omits the filter argument. So `MinRoleFilter`/`OperatorOnly` etc. are never applied to any route — including mutating ones (`PUT /hardware/assignments`, `PATCH /controller-library`, `POST /simulation/start`, `POST /missions/{id}/lock`). Backend authorization is effectively absent; the only RBAC that exists is in the frontend (`utils/rbac`), which is trivially bypassed by calling the API directly.
- **Template lifecycle (import/version/rollback) is not implemented.** `TemplatesController` returns 501/503 "not yet implemented (Block 3 persistence)" for `POST/PUT/PATCH/DELETE/duplicate`; only `GET` (from disk) and `validate` work. The plan's core "import a new rocket via the platform" flow does not exist over the API.
- **Persistence layer not wired.** `main.cc` notes audit runs "until libpqxx is wired"; the schema exists but the app reads templates from disk and stores audit to a flat file. Multi-mission/time-series query performance, versioning, and rollback are therefore untested against the actual store.

### ❌ What Is Missing (Was in the Plan, Not Built)
- **Real telemetry-ingestion pipeline with backpressure.** Telemetry is sim-sourced over WS; there is no ingestion from flight hardware, no backpressure/buffering strategy, no throughput/latency budget.
- **Multi-vehicle parallel SIL / job queueing at scale.** `SimRunRegistry` is in-process; no queue, no result store beyond CSV/log files, no multi-node.
- **gRPC.** Plan mentions REST/WS/gRPC trade-offs; only REST + WS exist (which is arguably correct — see below).

### 🔍 What the Plan Missed (Plan-Level Gaps)
- **The plan never specifies that frontend RBAC must be mirrored and enforced server-side.** Because the plan treats RBAC as a feature rather than a server-enforced boundary, the implementation shipped UI-only gating on a launch-arming control — a dangerous default the plan should have forbidden explicitly.
- **No API contract/versioning test.** The `/api/v1` prefix implies versioning, but the plan defines no contract test (OpenAPI, schema round-trip) to keep FE/BE in sync beyond a code-gen script.

### 📊 Discipline Verdict
The backend is structurally the most "production-shaped" subsystem — clean Drogon, sensible API split, real schema, audit middleware — but authentication is a spoofable header, authorization filters are wired to nothing, and the template-management core returns 503. **Worst open gap severity: CRITICAL** (no real auth + unenforced RBAC on mutating/launch endpoints).

---

# 6. FRONTEND ENGINEER

### ✅ What Was Built Correctly (As Planned)
- **Broad operator UI coverage.** 30 `S*.tsx` screens (login, dashboard, rocket library, mission config, SIL setup/monitor, 3D telemetry, control design, fault injection, pre-launch checklist, launch control, live flight, post-flight). This matches the plan's Phase 6 screen inventory closely.
- **Modern, appropriate stack.** React 19 + Redux Toolkit + Vite + TypeScript + Tailwind 4; 3D via three/@react-three/fiber/drei + Cesium/resium; data grids via AG Grid + Handsontable; charts via uPlot/Plotly/Recharts/d3; maps via Leaflet; i18n via i18next with RTL (the RUN_GUIDE and UI strings are bilingual EN/AR). This is a capable, real frontend, not a mockup.
- **Type generation from backend** (`scripts/generate_types.mjs`, `gen:types`) keeps FE types aligned to BE shapes; `rocketSlice.ts` matches the validator `Verdict`/`Report` JSON 1:1.
- **The validation report UI renders all 25 clauses** as designed (the "complete report" backend pattern pays off here).

### 🚀 What Was Built Better Than Planned
- **High-stress launch ergonomics are considered.** `S15_LaunchControl.tsx` implements an ARM→LAUNCH state machine with role-gated arming (`canArm`), a `hardwareKeyPresent` interlock ("Cannot arm: Hardware Key is missing"), audit-write on ARM, T-minus handling, and visually distinct ARMED/LAUNCHED states (pulsing/colors). This is more safety-conscious UX than the plan specified.
- **uPlot inclusion for high-rate telemetry** is a smart performance choice (canvas, low-overhead) alongside the heavier Plotly for analysis.

### ⚠️ What Was Built Worse / Incorrectly
- **Library redundancy → bundle bloat risk.** Four charting libs (uPlot, Plotly, Recharts, d3) and overlapping 3D/geo stacks (three + Cesium + Leaflet) are all dependencies. Cesium + Plotly alone are very large; with no CI/bundle-budget there is no guard on bundle size (a plan-stated frontend concern).
- **The launch interlock is UI-state only.** `hardwareKeyPresent` is a Redux boolean and ARM/abort dispatch to `systemSlice` with no authenticated server command (the backend has no arm/launch endpoint and no RBAC). The safety-critical control is cosmetic with respect to the actual system.
- **Committed `.bak` files in source** (`S6c_SimFull.tsx.bak`, `Layout.tsx.bak`) indicate manual-edit churn in the screen layer.

### ❌ What Is Missing (Was in the Plan, Not Built)
- **Live flight telemetry from real hardware** (only sim WS exists).
- **Bundle/build-budget + deployment artifact.** There is a `build` script but no CI build, no bundle analysis, no served artifact pipeline (frontend has no Dockerfile).

### 🔍 What the Plan Missed (Plan-Level Gaps)
- **Accessibility under stress is named but not specified.** The plan asks for "operator ergonomics under high-stress conditions" without concrete requirements (color-blind-safe palettes, confirm-timeouts, mis-click guards), leaving it to ad-hoc implementation.

### 📊 Discipline Verdict
The frontend is broad, modern, and the best-realized "as-planned" subsystem, with genuinely thoughtful launch-control UX. Its main weaknesses are bundle-weight risk and that its safety interlocks are UI-only because the backend can't enforce them. **Worst open gap severity: MEDIUM** (UI-only safety gating + bundle governance).

---

# 7. EMBEDDED ENGINEER

### ✅ What Was Built Correctly (As Planned)
- **The HAL contracts that firmware would implement exist** (`IFinDriver`, `ISeeker`, CAN/thermal/USB interfaces) with a stub set (`hal/stub/StubHals.cc`) and a registration factory. This is the correct seam for a future flight target.

### 🚀 What Was Built Better Than Planned
- **`build_default(flight_build)` + `any_stubbed` reporting** is a good guard: a flight build that forgets to register a native driver would surface `any_stubbed = true` at boot rather than silently flying on stubs. (The mechanism exists; nothing flight-side uses it yet.)

### ⚠️ What Was Built Worse / Incorrectly
- **There is no firmware for either flight path.** `gnc-stm32`, `gnc-android`, `gnc-flight`, and `gnc-bench` directories **do not exist** in the repo. The only "native" HAL is desktop Windows (`gnc-backend/src/hal/native/`: `UsbScan`, `WindowsCan`, `WindowsThermal`) used by the ground backend — not flight code. Plan line 354 lists "both path wrappers (`gnc-android`, `gnc-stm32`) … HAL for both paths … CI on both paths from day 1"; none of this is built.

### ❌ What Is Missing (Was in the Plan, Not Built)
- **Everything embedded:** MCU/SoC target projects, RTOS task model (FreeRTOS on Path B), WCET/deadline analysis, sensor drivers (SPI/I²C/UART, DMA vs IRQ), actuator outputs (PWM/CAN/RS-422 for TVC/fins/pyro), memory layout/stack sizing/static allocation, boot + safe-mode entry (plan §7.10), watchdog/health monitoring, and firmware update/rollback/version-locking (plan §10). The plan's COBS-framed USB-CDC peripheral protocol (§7, 921600 bps, CRC-16/CCITT) has no firmware endpoint.
- **DO-178C / software-assurance compliance:** not referenced anywhere.

### 🔍 What the Plan Missed (Plan-Level Gaps)
- **"CI on both paths from day 1" presumes hardware/toolchains/HIL rigs that the plan never resources.** Cross-compiling, on-target WCET, and HIL benches are multi-month efforts; the plan's day-1 framing for embedded is not credible and there is no schedule/risk entry acknowledging the firmware lift.
- **Single-flight-computer SPOF is accepted but the mitigations are themselves firmware** (burn-in, thermal monitoring, brown-out, black-box). With no firmware, none of the accepted-risk mitigations exist, so the residual risk is higher than the Risk Register assumes.

### 📊 Discipline Verdict
The embedded discipline is essentially 0% built: there is a clean HAL seam but no firmware, no RTOS, no drivers, no flight target for either path. The plan's "dual-path, day-1" embedded claim is the largest scope/reality gap in the program. **Worst open gap severity: CRITICAL** (no flight software exists for a system whose purpose is to fly).

---

# 8. MOBILE ENGINEER

### ✅ What Was Built Correctly (As Planned)
- **The plan's "mobile" is the Path A Snapdragon/Android flight computer wrapper (`gnc-android`), not an operator phone app** — and the architecture correctly treats it as a HAL target rather than a separate codebase. The HAL seam is the right place for it.

### 🚀 What Was Built Better Than Planned
- None applicable (nothing built).

### ⚠️ What Was Built Worse / Incorrectly
- **`gnc-android` does not exist** (see Embedded). The Android USB-role contract is specified (`schemas/android_usb_roles*`) but unimplemented.

### ❌ What Is Missing (Was in the Plan, Not Built)
- The entire Path A Android flight wrapper: USB host/accessory role handling, the STM32L431 peripheral link over USB-CDC, on-device GNC loop hosting, and any field/operator mobile tooling (no operator mobile app was planned, and none exists — correctly).

### 🔍 What the Plan Missed (Plan-Level Gaps)
- **Android real-time suitability is asserted, not analyzed.** Running a 100 Hz hard-real-time GNC loop on Android/Linux on Snapdragon has scheduling-jitter and thermal-throttling implications the plan does not analyze (no RT patch, cgroup, or core-isolation strategy). This is a substantive plan gap for Path A.

### 📊 Discipline Verdict
"Mobile" = the Android flight path, which is entirely unbuilt and whose hard-real-time feasibility is unexamined in the plan. As a discipline it is a neutral gap (not yet built) layered on a plan-level feasibility risk. **Worst open gap severity: HIGH** (Path A viability is unproven and unbuilt).

---

# 9. HARDWARE ENGINEER

### ✅ What Was Built Correctly (As Planned)
- **The hardware *interface* contracts are documented as artifacts**, not silicon: `schemas/hardware_mapping*.yaml` defines CAN node IDs, pyro events, and per-fin servo mapping; per-rocket `rockets/<id>/hardware_mapping.yaml` files exist; clause C11/C21 (mapping resolves, node IDs unique, counts match fins) are part of the contract.
- **`HardwareController` + USB scan** (`hal/native/UsbScan`) provides a ground-side device-discovery surface (`/api/v1/hardware/scan`, `/assignments`) consistent with the plan's hardware-mapping UI (S5).

### 🚀 What Was Built Better Than Planned
- **Hardware mapping is treated as validated configuration** (vid/pid + role assignment, uniqueness checks in `HardwareController`), which is the right way to keep the core hardware-agnostic.

### ⚠️ What Was Built Worse / Incorrectly
- **C11 (hardware mapping) is the only mapping clause partially implemented**, and only as "the merged doc has a `hardware` key"; C21 (per-stage CAN/pyro resolution) and C25 (CAN bus utilization < 70%) are stubs. So the hardware-mapping contract is asserted in YAML but not enforced.

### ❌ What Is Missing (Was in the Plan, Not Built)
- **All physical-hardware engineering:** flight-computer board (power budget, thermal envelope, EMI/EMC), connector/harness design and pin-outs, sensor mechanical placement, **pyrotechnic fire-circuit isolation/safing/arming**, regulated power rails + battery sizing, environmental qualification (shock/vibe/thermal/humidity), hardware redundancy (dual IMU/FC), and PCB SI review. None of these exist as artifacts (the repo is software-only; no schematics, no BOM, no qual plan).
- **Register maps / version-locking** for HW↔SW interfaces: not present.

### 🔍 What the Plan Missed (Plan-Level Gaps)
- **The plan leans on COTS (Snapdragon dev board, STM32 Nucleo-class) but never addresses qualification/obsolescence/EMI** for flight use. Pyrotechnic circuit safety (independent inhibits, no-fire/all-fire margins, ESD) is a regulated hardware domain the plan mentions only at the message/event level (`nail_pyro_events`), never at the circuit-safety level.

### 📊 Discipline Verdict
Hardware exists only as interface configuration (CAN/pyro/servo mapping schemas), which is appropriate for a software repo, but the mapping clauses that would enforce it are stubs and there is zero physical-hardware/pyro-safety engineering. **Worst open gap severity: HIGH** (pyro/arming circuit safety and HW interface enforcement absent).

---

# 10. QUALITY & TEST ENGINEER

### ✅ What Was Built Correctly (As Planned)
- **Test scaffolding spans all three layers:** core (`gnc-core/tests/` Catch2: `sim_test.cc`, `smoke_test.cc`), backend (`gnc-backend/tests/`: `smoke_test.cc`, `validator_test.cc`), frontend unit (Vitest: `authSlice`, `missionSlice`, `systemSlice`, `rbac`) and E2E (Playwright: `login`, `mission`, `rbac`).
- **The RBAC Playwright suite is meaningful**: it asserts the ARM button is disabled for engineer/viewer and enabled for operator/admin — a real behavioral test of a safety control (in the UI).
- **The plan defines a serious test strategy**: SIL scenario tolerances (Appendix C), 103-column flight-log schema, golden-log regression, ≥8 envelope cells, dual-path parity ≥90%, Valgrind/ASan, no-regression gates.

### 🚀 What Was Built Better Than Planned
- **`validator_test.cc` exists alongside the validator**, giving the one truly safety-relevant backend module direct unit coverage (the right place to invest first).

### ⚠️ What Was Built Worse / Incorrectly
- **The flagship sim regression test references deleted code.** `sim_test.cc` `#include "gnc-core/sim/PointMassSim.h"` and tests `PointMassSim`, but **no `PointMassSim` exists** anywhere in `gnc-core/include` or `src` (the integrators are `ThreeDOF`/`Tuning`/`Full6DOF`/`UnifiedSim`). The core's primary physics regression test cannot compile against the current tree — a broken/stale test, i.e. an active defect in the test suite.
- **There is no test of the actual GNC loop.** No test exercises `Full6DOFIntegrator` + a controller + allocator end-to-end, no closed-loop attitude-tracking test, no estimator test (the estimators are untested *and* unused).
- **Coverage of the validation contract is ~16% by construction.** Only C1/C2/C15/C17 are real; the SIL/golden/parity machinery has no inputs (empty `golden/`, no Path A/B binaries), so none of the plan's acceptance gates can actually run.

### ❌ What Is Missing (Was in the Plan, Not Built)
- **SIL scenario library, golden logs, dual-path parity harness, Monte Carlo, HIL** — all absent. `rockets/BA/golden/` is empty; `rockets/BA/tolerances.yaml`/`scenarios.yaml` are referenced by a malformed manifest.
- **Traceability matrix** (requirements→design→impl→test): none.
- **Defect tracking / known-open-defect register with risk classification:** none in-repo.

### 🔍 What the Plan Missed (Plan-Level Gaps)
- **No "tests must match current code" hygiene gate.** Because there is no CI, the stale `PointMassSim` test went undetected. The plan's heavy reliance on golden/parity gates presumes a CI that compiles and runs them — which does not exist (see DevOps).
- **"Pass" for SIL is defined as tolerance bands but not as functional adequacy.** The plan never requires that the SIL exercise estimated state, real guidance, or staging — so a "passing" SIL on truth-state vertical-hold ballistics would be meaningless for a guided multi-stage vehicle.

### 📊 Discipline Verdict
Test *intent* is strong and the RBAC/validator tests are well-placed, but the core sim test is broken (references non-existent `PointMassSim`), the GNC loop and estimators are untested, and every plan-level acceptance gate (golden/parity/MC/HIL) lacks inputs to run. **Worst open gap severity: HIGH** (no executable acceptance gate; broken core regression test).

---

# 11. SAFETY ENGINEER

### ✅ What Was Built Correctly (As Planned)
- **The plan is honest about its biggest safety posture decisions** and records them: single flight computer per path is an explicitly **accepted SPOF** (plan §1.1, Risk Register row "Single flight computer = SPOF", RPN 15) with named mitigations; in-flight abort after liftoff is explicitly **not available** (Phase 12 Q2); FTS is **not built**, declared only when supplied externally (Phase 12 Q1, Decision 17).
- **A Risk Register exists** with likelihood×severity×RPN scoring and includes "loss of control → off-range impact" (RPN 10) with predicted-impact tracking + optional FTS.
- **Arming has layered intent in the design**: per-stage `abort_policy` (C24, WARN at onboarding / FAIL at flight), `nail_count`/`nail_pyro_events` per separation (C17), and a safe-mode entry on missed peripheral cadence ×3 (plan §7.10).

### 🚀 What Was Built Better Than Planned
- **The "FAIL at flight if abort policy absent" escalation (C24)** is a good safety-gradient idea: tolerate missing policy during onboarding, hard-block at flight.

### ⚠️ What Was Built Worse / Incorrectly
- **Every safety-relevant validation clause is a stub** (C7 static stability, C8 thrust integrity, C9 fin authority, C18 timing reachability, C24 abort policy, C25 CAN bandwidth) and, because `NotApplicable` doesn't block, **a template with no abort policy and unstable CP can report overall PASS.** The safety gate the plan designed is not enforcing anything safety-related.
- **Safe-mode/abort logic has no implementation substrate.** Safe mode (§7.10), peripheral-loss detection, and abort command paths are firmware behaviors; with no firmware they don't exist. The C405 CAN abort message (plan §12) has no endpoint.
- **The launch ARM interlock is UI-only and server-unauthenticated** (see Frontend/Backend): the one built safety control can be bypassed by a direct API call, and there is no backend arm/launch/abort endpoint at all.

### ❌ What Is Missing (Was in the Plan, Not Built)
- **Formal safety analyses: FHA, SSA, FMEA/FMECA, fault trees — none exist** in plan or repo (`grep` for FMEA/FHA/SSA/fault tree across the plan ⇒ no hits). 
- **Pyrotechnic inhibit architecture** (how many independent inhibits, no-fire/all-fire margins): not specified at circuit level, not built.
- **Range-safety/FTS integration and personnel ground-safety interlocks** (fueling/arming): not built (FTS explicitly out of scope).

### 🔍 What the Plan Missed (Plan-Level Gaps)
- **No formal hazard analysis at all.** For a vehicle that can fly to high altitude/range, the absence of any FHA/FMEA/SSA and of a referenced standard (MIL-STD-882, ECSS-Q-ST-40, DO-178C, range-safety regs — none appear in the plan) is the most serious *plan-level* safety omission. Safety is handled as scattered risk-register rows and validator clauses rather than a systematic, traceable safety case.
- **"No in-flight abort + no FTS" is a program-level safety decision the plan under-justifies.** It is stated as a scope cut, not analyzed against off-range-impact hazard severity; the mitigation ("predicted-impact tracking") is itself unbuilt and depends on the (absent) navigation solution.

### 📊 Discipline Verdict
The plan is commendably explicit about accepted risks, but there is no formal safety case (no FHA/FMEA/SSA, no standard invoked), every safety-critical validation clause is a non-blocking stub, abort/safe-mode require firmware that doesn't exist, and the lone built interlock (ARM) is UI-only and server-unenforced. For a flight-capable system this is the highest-consequence area. **Worst open gap severity: CRITICAL** (no enforced safety gating; no safety case; no abort/FTS path).

---

# 12. DEVOPS ENGINEER

### ✅ What Was Built Correctly (As Planned)
- **A real multi-service deployment topology exists.** `gnc-backend/docker-compose.yml` brings up nginx → backend → TimescaleDB → MinIO → Keycloak, bound to `127.0.0.1` only (honors the plan's §1.6 "on-prem, no public exposure"), mounting `rockets/`, `schemas/`, and the libraries read-only.
- **Reproducible backend build is intended via Conan + CMake + Ninja**, captured in a multi-stage `Dockerfile` (builder → stripped runtime) and `conanfile.txt`.
- **Dependency pinning on the frontend** is reasonable (explicit versions in `package.json`), and a type-gen step keeps the API contract in sync.

### 🚀 What Was Built Better Than Planned
- **Localhost-only port bindings throughout compose** is a good secure-by-default posture that matches the on-prem mandate without extra config.

### ⚠️ What Was Built Worse / Incorrectly
- **There is no CI/CD pipeline at all.** No `.github/workflows`, no GitLab CI, no Jenkinsfile — nothing. The plan repeatedly relies on CI (three-tier SIL parametrized over `release_manifest`, HAL-leak detection, Valgrind/ASan, golden-log regression, "CI on both paths from day 1", artifact signing). None of it runs. The `check_hal_leak.cmake` guard exists but nothing invokes it.
- **The backend Dockerfile cannot build as written.** It does `COPY ../gnc-core /src/gnc-core` — a path **outside the build context**, which Docker forbids. Combined with `context: ..` in compose and `COPY . /src/gnc-backend`, the build is broken/contradictory.
- **`release_manifest.yaml` (the release/compatibility source of truth) is malformed YAML.** `committed_rockets` is not a valid list (mis-indented keys `type`/`required_artefacts`/`golden`), and it contains junk entries `- dfg`, stray `_copy` lines, and a duplicate `notes`. The file the plan says "CI's Tier 3 SIL is parametrised over" would not parse.
- **Repository hygiene is poor.** Committed at root: `fix.py`, `fix_s6c.js`, `patch_s5.py`, `patch_s5_dropdowns.py`, `plot_traj.py`, `test_api.js`, `req1..4.json`, `build_log.txt`, a **16 MB** `sim_run_BA_67.csv`, plus `.bak` files in `gnc-frontend/src`. These are dev-scratch artifacts that should not be in version control.

### ❌ What Is Missing (Was in the Plan, Not Built)
- **Artifact signing / firmware signing** (`release_manifest` has null `path_a/path_b firmware_sha256` + `signing_key_id`): no signing pipeline.
- **Secrets management** (only dev creds in compose: `POSTGRES_PASSWORD: dev`, `minioadmin`, Keycloak `admin/admin`): no vault/secret strategy.
- **Observability** (logs/metrics/traces): only `std::cout` + a JSONL audit file; no metrics/tracing stack.
- **IaC, multi-target build orchestration, rollback automation**: none.

### 🔍 What the Plan Missed (Plan-Level Gaps)
- **The plan assumes CI as the enforcement backbone for nearly every quality/safety gate, but treats standing up that CI (with cross-compilers, HIL runners, signing infrastructure) as implicit.** The single most leveraged missing artifact in the whole program is a CI pipeline, and the plan never scopes it as a deliverable with an owner and timeline.

### 📊 Discipline Verdict
Deployment topology and build intent are reasonable and secure-by-default, but there is literally no CI, the backend Docker build is broken, and the release manifest that drives the plan's acceptance machinery is malformed — so none of the plan's automated gates can execute. **Worst open gap severity: HIGH** (no CI; broken release/build inputs that block every downstream gate).

---

# 13. CROSS-DISCIPLINE SYNTHESIS

## 13.1 — Top 5 Critical Risks

1. **Navigation does not exist in any executable path; SIL flies on truth state.**
   - *Disciplines:* Navigation, Aerospace, Quality, Systems.
   - *Consequence:* Every SIL result is non-representative — controller tracking, attitude accuracy, and observability are validated against perfect state. Any "SIL pass" gives false confidence; a real vehicle with real IMU/GPS noise has never been simulated end-to-end. The estimators (ESKF/UKF/IMM/MHE) are dead code with a position-only process model.
   - *Mitigation priority:* P0 — wire one estimator into `Full6DOFIntegrator` (replace truth-state feedback), fix `Rocket6DOFProcessModel::propagate` to real dynamics, and make estimator-in-the-loop a SIL prerequisite.

2. **The validation gate returns false PASS on safety-critical templates.**
   - *Disciplines:* Systems, Safety, Quality.
   - *Consequence:* `NotApplicable` clauses don't block, so 21/25 clauses (including static stability C7, thrust integrity C8, abort policy C24, CAN budget C25) are skipped and a template is declared valid. The platform can certify an aerodynamically unstable, abort-policy-less vehicle as "ready."
   - *Mitigation priority:* P0 — change `aggregate()` so any un-implemented safety clause blocks (treat `NotApplicable` as FAIL for required clauses), then implement the physics/safety clauses.

3. **No authentication and no enforced authorization on the backend, including launch-relevant endpoints.**
   - *Disciplines:* Backend, Safety, Frontend.
   - *Consequence:* Role is read from a spoofable `X-Dev-Role` header (or fully bypassed via `GNC_AUTH_DISABLED=1`), and `MinRoleFilter`s are attached to no routes. All RBAC is UI-only and bypassable by direct API calls; the ARM interlock is cosmetic.
   - *Mitigation priority:* P0 — implement real JWT/JWKS verification, attach `MinRoleFilter` to every mutating route, and add server-side arm/launch authorization.

4. **No flight software exists for either path; the program's purpose is unbuilt.**
   - *Disciplines:* Embedded, Mobile, Hardware, Safety.
   - *Consequence:* `gnc-stm32`/`gnc-android` don't exist; there is no RTOS, no drivers, no safe-mode/abort, no watchdog, no firmware signing. Dual-path parity (a top success criterion) compares binaries that don't exist; SPOF mitigations (firmware-based) are absent.
   - *Mitigation priority:* P1 — stand up one minimal flight target (Path B/STM32H7 bare-loop) hosting the shared `gnc-core` over the existing HAL, even before full driver coverage.

5. **No CI pipeline + malformed release/build inputs block every automated gate.**
   - *Disciplines:* DevOps, Quality, Systems.
   - *Consequence:* The plan's golden-log/parity/Valgrind/HAL-leak gates can't run; the core sim test references a non-existent `PointMassSim`; the Docker build (`COPY ../gnc-core`) is broken; `release_manifest.yaml` won't parse. Quality regressions are undetectable.
   - *Mitigation priority:* P1 — add CI that builds all three targets, runs the existing tests, fixes/repoints the stale test, validates `release_manifest` schema, and runs `check_hal_leak.cmake`.

## 13.2 — Systemic Strengths
- **Clean seams and abstractions.** The HAL factory, the layered module boundaries, the controller/estimator interface hierarchies, and the template-as-config model are consistently well-designed across disciplines. The *shape* of the system is right.
- **Honest, complete interface surfaces.** The 25-row validation report, the 103-column log schema, the `/api/v1` controller surface, and FE↔BE type-gen show a discipline of "define the full contract, even where internals are pending."
- **Modern, capable ground software.** The Drogon backend and React/Redux frontend (30 screens, real 3D/telemetry/charting) are production-shaped and the most complete realized layers.
- **Genuine 6-DOF physics + correct IMM.** Where algorithms are real (`Full6DOFIntegrator`, `IMMFilter`, `PIDController`), they are implemented competently.

## 13.3 — Systemic Weaknesses
- **"Interface-real, internals-stub" everywhere it matters.** Controllers (9/12 stubs), validation (21/25 stubs), estimators (dead code), guidance (hardcoded), staging (unwired), firmware (absent). The pattern repeats across control, nav, safety, embedded.
- **Gaps are masked rather than surfaced.** False-PASS validation, UI-only RBAC over no-auth backend, stub controllers named after advanced algorithms, and a stale-but-present test create an impression of completeness that the internals don't support — the most dangerous failure mode for a safety-critical program.
- **No enforcement backbone.** No CI means nothing prevents drift (broken test, broken Dockerfile, malformed manifest, contract-number desync all coexist).
- **Plan over-scopes "day-1" breadth.** "12 controllers × 7 types × 5 modes × 3 estimators × both paths × CI, day 1" is the root cause of stub-driven breadth instead of depth.

## 13.4 — Plan vs. Reality Gap Summary
**Rating: CONCERNING.**
The macro-architecture and ground software track the plan well, and a few core algorithms (6-DOF physics, IMM, PID) are genuinely implemented. But the flight- and safety-critical heart of the system is placeholder: navigation never runs, 9/12 controllers and 21/25 validation clauses are stubs, guidance/staging are unimplemented, there is no firmware for either path, no enforced auth, and no CI. Crucially, several gaps are presented as functional (false-PASS validation, advanced-control class names, UI-only safety interlocks), so the *apparent* fidelity overstates the *actual* fidelity. This is a credible v0.1.0-dev skeleton, not the certifiable dual-path flight platform the plan describes, and the distance between the two is large in exactly the areas where it matters most.

## 13.5 — Recommended Priority Order for Next Development Sprint

- **[PRIORITY 1] SAFETY/SYSTEMS — Make the validator fail-safe: treat un-implemented required clauses as blocking, not `NotApplicable`.** — *Why now:* a one-function change in `Verdict.h::aggregate()` immediately stops false-PASS certification of unstable/abort-less vehicles; everything downstream trusts this gate.
- **[PRIORITY 2] BACKEND/SAFETY — Implement real JWT verification and attach RBAC filters to all mutating routes.** — *Why now:* current auth is a spoofable header with filters wired to nothing; this is a trivially exploitable hole on launch-relevant endpoints and blocks any trustworthy operation.
- **[PRIORITY 3] NAVIGATION — Wire one estimator into the sim loop and fix `Rocket6DOFProcessModel::propagate`; feed the controller from estimated (noisy) state.** — *Why now:* without nav-in-the-loop, all SIL is meaningless; this unblocks honest control/SIL verification.
- **[PRIORITY 4] DEVOPS/QUALITY — Stand up CI (build all 3 targets + run tests + HAL-leak + manifest schema-check); fix the stale `PointMassSim` test and the broken Dockerfile.** — *Why now:* CI is the enforcement backbone every other gate in the plan assumes; nothing stays fixed without it.
- **[PRIORITY 5] CONTROL — Replace the 4-fin hardcoded allocator with the template-driven `M_mix` (4/8/12 fins, canard sign, weighted LS) and source `C*_delta` from aero data.** — *Why now:* the allocator currently can't fly the over-actuated GH/SA vehicles the plan centers on; this unblocks multi-fin templates.
- **[PRIORITY 6] AEROSPACE — Add δ-dependence (and β, ideally Re) to the aero tables/lookup and implement staging mass/inertia discontinuities via the existing `SeparationTrigger`.** — *Why now:* control effectiveness and multi-stage flight both depend on this; required before any guided or multi-stage SIL is credible.
- **[PRIORITY 7] QUALITY — Generate the BA golden set (≥8 envelope cells) and add a closed-loop GNC-loop regression test.** — *Why now:* gives the program its first real acceptance baseline once nav + control above are real; converts the SIL machinery from aspirational to executable.
- **[PRIORITY 8] EMBEDDED — Bring up a minimal single-path flight target (Path B/STM32H7) hosting `gnc-core` over the HAL, with watchdog + safe-mode.** — *Why now:* establishes the second execution substrate the entire dual-path/parity thesis depends on, and grounds the (currently fictional) firmware-based SPOF mitigations.

---

### Appendix — Key Evidence Index
- Control stubs: `gnc-core/src/control/{LQR,LQG,HInfinity,SDRE,SlidingMode,Backstepping,MPCLinear,MPCNonlinear,MRAC,L1Adaptive}Controller.cc` ("math stub"); allocator `ControlAllocator.cc` (hardcoded 4-fin, `Cn_delta=0.05`).
- Nav dead code / truth-state loop: `Full6DOFIntegrator.cc` (controller fed from `frame_.{roll,pitch,yaw}_deg`; "an Estimator would sit here"); `Rocket6DOFProcessModel.cpp::propagate` (pos-only Euler); `GenericESKF.cpp` (additive injection).
- Validation: `gnc-backend/src/validator/Validator.cc` (C1/C2/C15/C17 real, C3–C25 mostly `stub()`), `Verdict.h::aggregate()` (`NotApplicable` ignored).
- Auth: `gnc-backend/src/auth/KeycloakAuth.cc` (`X-Dev-Role`, `GNC_AUTH_DISABLED`); controller headers `ADD_METHOD_TO(... )` with no filters.
- Embedded: absence of `gnc-stm32`/`gnc-android`; only `gnc-backend/src/hal/native/Windows*`.
- DevOps: no `.github/workflows`; `gnc-backend/Dockerfile` `COPY ../gnc-core`; malformed `release_manifest.yaml`; empty `rockets/BA/golden/`; stale `gnc-core/tests/sim_test.cc` (`PointMassSim.h`); root scratch files + 16 MB CSV.
- Physics fidelity: `EarthModel.cc` (J2 only); `Tables.cc::AeroCoeffs::lookup(mach, alpha)` (no δ/β/Re).

*End of audit.*
