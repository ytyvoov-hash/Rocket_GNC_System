# Rocket GNC System — Audit-to-Implementation Report

**Repo:** https://github.com/ytyvoov-hash/Rocket_GNC_System
**Scope:** Multi-discipline audit of Plan v5.4 → reality-aligned Plan v8 → implementation of the full P0→P5 priority sprint as 9 reviewable, stacked PRs.
**Status:** All deliverables merged (PRs #1–#10).

---

## 1. Engagement at a glance

| Phase | Deliverable | PR | State |
|------|-------------|----|-------|
| Audit | 13-discipline brutal-honesty audit (`GNC_System_Audit_v5.4.md`) | — | delivered |
| Plan | `Rocket_GNC_System_Plan_v8.md` + `IMPLEMENTATION_CHECKLIST.md` | #1 | merged |
| P0.1 | Fail-safe template validator | #2 | merged |
| P0.2 | Real JWT/JWKS auth + RBAC + server ARM/LAUNCH/ABORT | #3 | merged |
| P1.1 | Estimator-in-the-loop (close SIL on estimated state) | #4 | merged |
| P2.1 | CI design + fix broken build inputs | #5 | merged |
| P3.1 | Template-driven M_mix control allocator | #6 | merged |
| P3.2 | δ-dependent control-surface aero | #7 | merged |
| P3.3 | Staging/separation events | #8 | merged |
| P4.1 | BA golden acceptance set + closed-loop GNC regression | #9 | merged |
| P5.1 | Minimal Path B / STM32H7 flight target (`gnc-stm32`) | #10 | merged |

---

## 2. The audit (v5.4): headline findings

Overall plan-vs-reality verdict: **CONCERNING** — roughly 30–40% of the advertised system was genuinely built. Macro-architecture and ground software were strong (Drogon backend, ~30-screen React app, HAL abstraction, real 6-DOF physics + IMM filter), but the **flight- and safety-critical internals were largely scaffolding**, and the most dangerous pattern was **gaps masked as functional**:

- **Navigation was dead code.** ESKF/UKF/IMM/MHE were never instantiated; the sim closed the loop on **true** state ("an Estimator would sit here"). All SIL was non-representative.
- **Validator returned false PASS.** Only 4 of 25 clauses were real; the other 21 returned `NotApplicable`, which aggregation ignored — an unstable, abort-policy-less template could be certified "PASS."
- **9 of 12 controllers were self-labeled "math stub" PD laws** (LQR with no Riccati solve, MPC "stubbed out"); guidance hardcoded to pitch=90°; allocator hardcoded 4-fin (couldn't fly the 8/12-fin vehicles the plan centered on).
- **No real auth.** Role came from a spoofable `X-Dev-Role` header; RBAC filters defined but attached to no routes. ARM interlock was UI-only Redux.
- **No firmware for either path**, **no CI**, broken backend Dockerfile (`COPY ../gnc-core`), malformed `release_manifest.yaml`, empty BA `golden/`, and a stale `sim_test.cc` referencing a deleted `PointMassSim`.
- **No safety case** (no FHA/FMEA/SSA, no standard invoked).

---

## 3. Plan v8: what changed

v8 supersedes v5.4 by recording the *true* as-built state, un-masking the gaps, and sequencing the fix work. It introduced six mandatory invariants that the PRs implement:

- **INV-1 Fail-closed validation** — `PASS` iff every *Required* clause is implemented + PASS; `NotApplicable` on a required clause ⇒ FAIL.
- **INV-2 Server-enforced authority** — arming/launch decided server-side, never by the client.
- **INV-3 Estimated-state SIL** — the loop closes on the navigation estimate, not ground truth.
- **INV-4 No mislabeled algorithms** — a controller named "LQR" must actually solve the Riccati equation, etc.
- **INV-5 CI-gated truth** — claims are backed by automated build/test.
- **INV-6 Flight-build hardening** — a flight binary refuses to run if any HAL is stubbed, the auth bypass is compiled in, or the firmware is unsigned.

Priority order followed the audit's §13.5 sprint: P0 (safety gate + auth) → P1 (nav in loop) → P2 (CI/build) → P3 (allocator + aero + staging) → P4 (golden + closed-loop) → P5 (firmware).

---

## 4. What was implemented (per PR)

### P0.1 — Fail-safe validator (PR #2)
**Problem:** aggregation ignored `NotApplicable`, so 4/25 real clauses ⇒ overall PASS.
**Delivered:** fail-closed `aggregate()` (a required clause that is un-implemented/N-A ⇒ FAIL); a single-source-of-truth clause-spec table with a `required` flag (surfaced to the frontend); fail-closed aggregation tests + a spec-table freeze test. BA now correctly aggregates to **FAIL** while its 4 real clauses still pass individually.

### P0.2 — Auth + RBAC + launch authority (PR #3)
**Problem:** role from spoofable `X-Dev-Role`; filters attached to nothing; ARM was UI-only.
**Delivered:**
- `JwtVerifier` — RS256 verification via JWKS (kid→x5c→pubkey; exp/nbf/iss/aud), highest realm role wins, unconfigured ⇒ reject (fail-closed).
- `KeycloakAuth` filters attached to **every mutating route** (Templates/Hardware/Missions/Libraries/Simulation/Audit): GET→Viewer, writes→Engineer, lock/PUT/audit→Operator, delete→Admin.
- `LaunchAuthority` — server-side state machine (`Idle→Armed→Launched`, `Abort` from any state), constant-time hardware-key compare, fail-closed if no key provisioned; endpoints `/api/v1/launch/{state,arm,launch,abort,reset}`.
- Audit trail now records the **verified JWT identity**, not spoofable headers.
- INV-6: the dev bypass only exists when compiled with `-DGNC_ALLOW_AUTH_BYPASS=ON`; release/flight builds omit it from the binary.
- 24 unit tests (13 JWT + 11 launch).

### P1.1 — Estimator-in-the-loop (PR #4)
**Problem:** SIL fed the controller true state; navigation library never ran.
**Delivered:** `ErrorStateKF` — 15-state error-state Kalman filter with multiplicative quaternion injection (SO(3)), IMU predict + GPS update; wired into `Full6DOFIntegrator::step()` between sensors and controller; `SimConfig::feedback_source` codifies INV-3 (`Estimated` default, `Truth` debug-only). `Rocket6DOFProcessModel` upgraded from a position-only Euler stub to real RK4. Nav-accuracy test bounds estimate error vs truth (pos ~0.6 m at GPS σ=1.5 m; 10°→~4° attitude convergence).

### P2.1 — CI + build fixes (PR #5)
**Delivered:** fixed the Dockerfile escaped-context `COPY`; repaired the unparseable `release_manifest.yaml`; repointed the stale `sim_test.cc` to `UnifiedSim`; added a missing `<algorithm>`; removed ~15 MB of root dev-scratch; new `scripts/validate_release_manifest.py`. A 4-job CI workflow was designed and verified green locally but **not committed** — the git token lacks the GitHub `workflow` scope (it remains attached to PR #5 awaiting that scope).

### P3.1 — Template-driven allocator (PR #6)
**Problem:** hardcoded 4-fin allocator couldn't fly 8/12-fin vehicles.
**Delivered:** `FinGeometry` (n fins, per-fin {Cl,Cm,Cn} effectiveness + limits; `cruciform4`/`ring(n)`/`canard4` builders) and `FinAllocator` solving B·δ = m via regularised pseudo-inverse (exact when unsaturated, true over-actuated WLS for n>3, canard sign-inversion). `ActuatorCommands.fins_rad` generalised to 12 + `n_fins`. Tests for 4/8/12-fin + canard + saturation + zero-q.

### P3.2 — δ-dependent aero (PR #7)
**Problem:** fin deflections didn't feed back into aero forces/moments (decks indexed at hardcoded δ=0).
**Delivered:** `FinAllocator::equivalentDeflections()` maps n-fin command → per-axis equivalent deflection; the plant indexes the δ-swept aero decks at the **commanded** deflection (zeroing matching axes of `allocated_aero_moment` to avoid double-counting). Gated by `SimConfig::delta_aero_from_table`, **default off** (BA's synthetic deck slope is ~1000× the placeholder; calibration is future work) — keeps existing runs byte-identical.

### P3.3 — Staging/separation (PR #8)
**Problem:** `SeparationTrigger.h` defined but referenced nowhere.
**Delivered:** `StageSeparation` + `SimConfig::stage_separations`; `evaluateStaging()` fires on Time/Altitude/Velocity/Burnout, applies the mass discontinuity, re-bases wet mass for upper-stage inertia/CG interpolation, switches inertia/thrust/aero decks; stage-aware phases + new telemetry. Tests: time/altitude fire once with correct mass drop, Event never auto-fires, empty list unchanged, two sequential separations in order.

### P4.1 — Golden set + closed-loop regression (PR #9)
**Problem:** empty `golden/`; no closed-loop GNC test.
**Delivered:** `closed_loop_test.cc` with (1) an **8-envelope-cell golden acceptance baseline** — deterministic ballistic ascents reduced to 6 metrics, byte-identical at -O0/-O2 — and (2) a **closed-loop pipeline on estimated state (INV-3)** asserting finite trajectory, full propellant burn, bounded rates, determinism. Data artifacts populated: `golden_metrics.csv`, 8-cell `scenarios.yaml`, realistic `envelope.yaml`, `tolerances.yaml` golden block. Attitude-tracking goldens deliberately omitted (control laws are still PD stubs).

### P5.1 — Path B / STM32H7 flight target (PR #10)
**Problem:** no firmware on either path; `gnc-core` had no execution substrate.
**Delivered:** new `gnc-stm32/` hosting the gnc-core GNC stack over the HAL:
- `FlightLoop` — fixed-rate cycle on estimated state (INV-3): IMU→ESKF→controller→allocator→fins + watchdog kick.
- `FlightState` machine with a `SAFE_MODE` fail-stop (pyros disarmed, fins neutralised, terminal until reboot).
- `Watchdog` deadline monitor (binds STM32 IWDG on-target); miss → SafeMode.
- `FlightBuildGuard` (INV-6) — flight build refuses to run if any_stubbed / auth bypass compiled / unsigned image.
- Firmware signing hook: dependency-free SHA-256 (FIPS 180-4) + `sign_firmware.py` → `release_manifest.yaml:path_b`, recomputed and compared at boot (C++ digest == Python hashlib).
- Native STM32H7 `IClock` (DWT) via the registrar pattern; `arm-none-eabi` cross-toolchain; host bench build + Catch2 host tests run the on-target control flow.
- Firmware↔backend ICD; `release_manifest.yaml:path_b` firmware fields.

---

## 5. Verification status & caveats

- **No CI in the repo** and the Conan/Drogon and Catch2 toolchains are not installed in the working environment. Every PR was therefore verified with **standalone harnesses** (g++) that mirror the committed Catch2/gtest assertions, plus full TU compile checks. Representative results: validator fail-closed checks; 24 auth/launch cases; nav-accuracy bounds; allocator 4/8/12+canard; staging 21/21; closed-loop 58/58; flight target 47/47.
- This means the committed test files have **not** been executed by an automated CI runner — they are verified-by-mirror, not verified-in-CI. Standing up CI (P2.1's deferred workflow) is the single highest-leverage way to convert "verified here" into "continuously gated."

---

## 6. What remains (deferred / not done)

**Tracked follow-ups inside delivered items:**
- **CI workflow not committed** — needs a git token with the GitHub `workflow` scope (the YAML is attached to PR #5).
- **Controller graduation (INV-4)** — the 9 stubbed PD controllers still need real LQR/MPC/etc. implementations; until then, no attitude-*tracking* goldens.
- **δ-aero calibration** — `delta_aero_from_table` stays off until BA's aero deck slope is calibrated against the allocator.
- **Frontend → launch endpoints** — migrate the UI off local Redux onto the new `/api/v1/launch/*` authority.
- **Firmware bring-up** — native IMU/GPS/fin/pyro drivers, physical link layer (radio/CAN framing/CRC), full 103-column telemetry + HDF5 Path A/B parity logs, asymmetric (ed25519) firmware signatures.

**Not yet started (next priorities):**
- **P5.2 — Path A / Android** mobile app (the other missing execution path).
- **Cross-cutting safety case** — FHA / FMEA / SSA and a named standard (MIL-STD-882 / ECSS-Q-ST-40), which the audit flagged as entirely absent.
- **Tier-3 SIL promotion** — full HDF5 golden logs + ≥90% Path A/B parity gate.

---

## 7. Bottom line

The full audit-driven P0→P5 sprint is implemented and merged. The system moved from "interfaces real, safety/flight internals stubbed and partly masked as working" to: a fail-closed certification gate, server-enforced auth and launch authority, a navigation filter actually in the loop, repaired build inputs, a vehicle-agnostic allocator with aero coupling and staging, a deterministic regression baseline, and a real second execution substrate (flight firmware skeleton) with INV-6 hardening. The biggest remaining levers are **standing up CI**, **graduating the stub controllers**, and **starting the safety case** — none of which are blocked by the work delivered here.
