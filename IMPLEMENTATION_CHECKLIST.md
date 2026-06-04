# Rocket GNC System — Implementation Checklist (v8)

Companion to `Rocket_GNC_System_Plan_v8.md`. Evidence base: `GNC_System_Audit_v5.4.md`.

**Legend:** `[x]` done / real · `[~]` partial or stubbed (active defect or scaffolding only) ·
`[ ]` not built. Percentages are completion estimates from the audit.

**Overall fidelity: CONCERNING — ~30–40% of the advertised system is genuinely built.**

---

## A. Snapshot — what IS done vs what is NOT

### Genuinely built (real, working, matches plan)
- [x] 5-layer architecture + correct dependency direction (`gnc-core`→`gnc-backend`→`gnc-frontend`, `rockets/`, `schemas/`)
- [x] HAL factory / stub-default abstraction (`HalFactory.h/.cc`, `any_stubbed` boot report)
- [x] Template-as-config (YAML, not compiled in)
- [x] Real 6-DOF rigid-body integrator (`Full6DOFIntegrator.cc`: quaternion+renorm, asymmetric Euler, RK4, launch-rail, NaN/Inf guards, jet-damping)
- [x] Table-driven atmosphere/thrust/aero at sim boundary (`Tables.cc`); 3 fidelities (3DOF/Tuning/Full)
- [x] PID controller (cascaded attitude/rate, anti-windup, `wrap_pi`)
- [x] Actuator rate/pos limiting + achieved-moment back-computation under saturation
- [x] IMM filter (textbook-correct) + LM-MHE sparse solver (as a *library*)
- [x] Sensor noise model (accel/gyro white noise, bias random-walk, GPS pos/vel)
- [x] Drogon backend (`/api/v1`, CORS+audit middleware, in-process SIL orchestration, REST+WS split)
- [x] Relational schema (`001_init.sql`: versioned templates/missions, runs, audit_log; TimescaleDB)
- [x] 30-screen React frontend (modern stack, 25-clause validation UI, type-gen from backend, thoughtful launch UX)
- [x] Multi-service compose topology (nginx→backend→TimescaleDB→MinIO→Keycloak, localhost-bound)

### Built but WRONG / masked (active defects — look done, aren't)
- [~] Validator aggregation: **false-PASS** (`NotApplicable` ignored; 4/25 real clauses can yield overall PASS) — **P0.1**
- [~] Clause↔number labels desynced from contract (C7/C8/C14/C19–C23 mislabeled) — **P0.1**
- [~] Auth: spoofable `X-Dev-Role` header / `GNC_AUTH_DISABLED=1` ⇒ Admin (no JWT/JWKS) — **P0.2**
- [~] RBAC `MinRoleFilter`s defined but **attached to no routes** (UI-only, API-bypassable) — **P0.2**
- [~] Launch ARM interlock is Redux-only (no authenticated server command) — **P0.2**
- [~] 9/12 controllers are "math stub" PD laws mislabeled as LQR/H∞/MPC/MRAC/L1/etc. — cross-cutting
- [~] Guidance hardcoded to vertical hold (`pitch=90°`); no autopilot modes — **P1/P3**
- [~] TVC inert in sim (`thrust_n=0` ⇒ TVC output ≈ 0) — **P3**
- [~] Allocator hardcoded 4-fin (fixed `Cn/Cm_delta=0.05`); can't fly GH(8)/SA(12) — **P3.1**
- [~] Estimators are **dead code** — never instantiated; SIL closes loop on truth state — **P1.1**
- [~] `GenericESKF` injects additively (not error-state); `Rocket6DOFProcessModel::propagate` is pos-only Euler — **P1.1**
- [~] Aero 2-D (M,α) only — ignores δ/β/Re; control effectiveness not sourced from aero — **P3.2**
- [~] `sim_test.cc` references deleted `PointMassSim` (won't compile) — **P2.1**
- [~] Backend Dockerfile broken (`COPY ../gnc-core` outside build context) — **P2.1**
- [~] `release_manifest.yaml` malformed (invalid list, `- dfg`, `_copy`, dup `notes`) — **P2.1**
- [~] Validation clauses C7/C8/C9/C11/C18/C21/C24/C25 stubbed (safety/physics/HW) — **P0.1 + ongoing**

### NOT built (planned, absent)
- [ ] Navigation in any executable loop (no fusion, no gating, no nav init, no observability)
- [ ] Real guidance (5 autopilot modes), gain scheduling, Monte-Carlo dispersions, in-loop FDIR
- [ ] Staging physics (mass/inertia discontinuity, per-stage aero, fairing jettison)
- [ ] Wind/turbulence (Dryden/von Kármán); J3/J4 gravity; structural/max-Q margins
- [ ] Firmware — `gnc-stm32`, `gnc-android`, `gnc-flight`, `gnc-bench` (RTOS, drivers, WCET, watchdog, safe-mode, signing)
- [ ] Server-side auth/RBAC enforcement; ARM/LAUNCH/ABORT endpoints; template import/version/rollback (501/503 today)
- [ ] Persistence wired (libpqxx); real telemetry ingestion + backpressure
- [ ] CI/CD pipeline (build/test/lint/static-analysis/signing); HAL-leak/Valgrind/golden/parity gates can't run
- [ ] Golden logs (`rockets/BA/golden/` empty); SIL scenario library; dual-path parity harness; HIL
- [ ] Formal safety case: FHA, SSA, FMEA/FMECA, fault trees; pyro inhibit architecture; FTS/range-safety; ground interlocks
- [ ] All physical-HW engineering (board/harness/pyro circuit/power/qual/redundancy/PCB SI)
- [ ] Traceability matrix; defect register with risk classification

---

## B. Priority-ordered execution checklist (P0 → P5)

Tiers preserve the audit's authoritative 8-item sprint order (§13.5).

### P0 — Stop the bleeding (no "PASS"/"ready" is trustworthy until done)

**P0.1 — [Audit #1][SAFETY/SYSTEMS] Fail-safe validator** — status ~10%
- [ ] `Verdict.h::aggregate()`: any Required un-implemented/`NotApplicable`/errored clause ⇒ FAIL
- [ ] Tag every clause Required vs Optional in `schemas/`
- [ ] Fix clause↔number desync; freeze C-map as single source of truth
- [ ] `validator_test.cc`: assert C1/C2/C15/C17-only template ⇒ **FAIL**; add label-equality test
- *Deps:* none — **do first** · *Done when:* false-PASS is impossible and tested

**P0.2 — [Audit #2][BACKEND/SAFETY] Real auth + enforced RBAC + server ARM authority** — status ~15%
- [ ] JWT/JWKS verification (`exp/iss/aud`) replacing `X-Dev-Role`
- [ ] Attach `MinRoleFilter` to every mutating route (`simulation/start`, `hardware/assignments`, `missions/{id}/lock`, `controller-library`, …)
- [ ] Authenticated `ARM`/`LAUNCH`/`ABORT` endpoints + server-side hardware-key check
- [ ] `GNC_AUTH_DISABLED` impossible in flight/release build (INV-6)
- [ ] Extend Playwright RBAC suite to hit the API directly (not just UI)
- *Deps:* none (parallel w/ P0.1) · *Done when:* unauthorized direct API calls are rejected

### P1 — Make SIL representative

**P1.1 — [Audit #3][NAVIGATION] Estimator-in-the-loop + real process model** — status ~25%
- [ ] Instantiate one estimator (ESKF or IMM) in `Full6DOFIntegrator`
- [ ] Replace truth-state feedback with estimated state (codify INV-3: truth-state = debug only)
- [ ] Fix `Rocket6DOFProcessModel::propagate` → real RK4 (vel/quat/rate, not pos-only)
- [ ] Make `GenericESKF` a true error-state filter (quaternion/SO(3) injection)
- [ ] Nav-accuracy test bounding estimate error vs truth over an envelope cell
- *Deps:* P0 · *Done when:* SIL closes loop on noisy estimated state

### P2 — Enforcement backbone

**P2.1 — [Audit #4][DEVOPS/QUALITY] CI + fix broken build inputs** — status 0%
- [ ] CI builds core + backend + frontend; runs Catch2/Vitest/Playwright
- [ ] CI runs `check_hal_leak.cmake`, `release_manifest` schema-check, architecture-fitness (no backend includes in core), repo-hygiene gate
- [ ] Fix backend Dockerfile build-context (`COPY ../gnc-core`)
- [ ] Repair malformed `release_manifest.yaml`
- [ ] Repoint/fix stale `sim_test.cc` (`PointMassSim` → current integrators)
- [ ] Remove dev-scratch (`fix.py`, `fix_s6c.js`, `patch_s5*.py`, `plot_traj.py`, `test_api.js`, `req1..4.json`, `build_log.txt`, 16 MB `sim_run_BA_67.csv`, `*.bak`)
- *Deps:* none structurally; most valuable right after P0/P1 · *Done when:* CI green on `main`

### P3 — Control & physics content

**P3.1 — [Audit #5][CONTROL] Template-driven `M_mix` allocator** — status ~20%
- [ ] `n×3` mixing matrix for 4/8/12 fins
- [ ] Weighted least-squares for over-actuated GH(8)/SA(12); canard sign-inversion (BA)
- [ ] Source `C*_delta` from aero data (not hardcoded 0.05)
- [ ] Allocator unit test across fin counts; GH/SA allocate in SIL
- *Deps:* P3.2 (real `C*_delta`), P1 (closed-loop check)

**P3.2 — [Audit #6][AEROSPACE] δ-dependent aero + staging discontinuities** — status ~30%
- [ ] Extend aero tables + `AeroCoeffs::lookup` to `(M,α,δ)` (+β; Re if feasible)
- [ ] Staging mass/inertia discontinuity + per-stage aero switch via `SeparationTrigger`
- [ ] Wind/turbulence injection
- [ ] State fidelity-vs-certification mapping; decide J2 vs J3/J4
- *Deps:* P1 · *Done when:* control effectiveness aero-sourced; 2-stage SIL shows mass-drop

### P4 — Acceptance baseline

**P4.1 — [Audit #7][QUALITY] BA golden set + closed-loop GNC regression** — status 0%
- [ ] Generate ≥8 envelope-cell golden logs for BA (after nav+control real)
- [ ] Closed-loop attitude-tracking regression (integrator+estimator+controller+allocator)
- [ ] Populate `rockets/BA/{tolerances,scenarios}.yaml`
- *Deps:* P1, P3.1, P3.2 · *Done when:* CI runs a real acceptance baseline

### P5 — Flight substrate

**P5.1 — [Audit #8][EMBEDDED] Minimal Path B/STM32H7 flight target** — status 0%
- [ ] `gnc-stm32` project hosting `gnc-core` over HAL (FreeRTOS or bare loop)
- [ ] Watchdog + safe-mode entry + minimal driver set
- [ ] Firmware signing hook; firmware↔backend ICD
- [ ] INV-6 flight-build hardening (fail if `any_stubbed`/auth-disabled/unsigned)
- *Deps:* P1, P2, P0 · *Done when:* `gnc-core` runs on-target in HIL/bench w/ watchdog+safe-mode

### Cross-cutting (start now, run alongside all tiers)
- [ ] Safety case: FHA → FMEA/FMECA → SSA → fault trees under a selected standard (MIL-STD-882 / ECSS-Q-ST-40 / DO-178C-equiv)
- [ ] Pyro inhibit architecture (independent inhibits, no-fire/all-fire margins)
- [ ] Graduate stub controllers to real impls behind a control-law verification standard (flip `verification_status` per promotion)
- [ ] Persistence + template import/version/rollback (backend 501/503 → real; wire libpqxx)
- [ ] Implement validation clauses C7/C8/C9/C18/C24/C25 (physics/safety) + C11/C21/C25 (HW mapping)
- [ ] Path A (Android) hard-real-time feasibility spike before committing dual-path

---

## C. Staged Definition of Done (gates)
- [ ] **DoD-A (Trustworthy gate):** P0.1 + P0.2 + P2.1 green — *no "PASS" is meaningful before this*
- [ ] **DoD-B (Representative SIL):** P1.1 + ≥1 real guidance mode + P3.1 + P3.2 + P4.1
- [ ] **DoD-C (Flight substrate):** P5.1 + firmware signing + firmware↔backend ICD
- [ ] **DoD-D (Dual-path):** Path A spike resolved + both paths build in CI + parity ≥90% on real binaries + safety case complete
