# BA Onboarding Report

Status: **DRAFT — initial bootstrap (v5.4 §A.2 onboarding workflow)**

This document is the human-readable acceptance record produced at the end
of the Appendix A.2 onboarding workflow. It is required by
`release_manifest.committed_rockets` (Tier 3 CI gate) before BA can ship
in a release.

## 1. Template summary

| Item | Value |
|------|-------|
| Template ID | `BA` |
| Type | Sounding rocket |
| Stages | 1 (terminal) |
| Reference diameter | 0.273 m |
| Reference length | 5.453 m |
| Dry mass | 291 kg |
| Propellant mass | 285 kg |
| Fins | 4, X-configuration, ±20°, 300 °/s |
| Default controller | `pid_fins_baseline` |
| Default actuator | `default_4020` |
| Launcher | 5.45 m rail, 65° elevation |

## 2. Source of data

The template is a one-to-one transformation of
`Reference-data/BA(rocket_data_example)/stage1/` into the canonical multi-stage
layout described in the build plan §4.1.

CSV files copied verbatim:

- `aero_coeffs.csv` — CN, CM
- `ca_3d_coeffs_motor_on.csv`, `ca_3d_coeffs_motor_off.csv` — CA hypercubes
- `atmosphere_table.csv` — local atmosphere model
- `damping_coeffs.csv` — pitch/yaw damping
- `fin_deflection_coeffs.csv` — fin effectiveness
- `fin_loads.csv` — fin force coefficients
- `roll_aero_coeffs.csv` — roll damping + induced moment
- `thrust_curve.csv` — burn profile

## 3. Validator results (C1–C25)

**STATUS: NOT YET RUN.** The Stream B validator (Phase β) has not been
implemented at the time of this bootstrap. Expected verdicts when it lands:

| Clauses | Expected |
|---------|----------|
| C1 (schema), C2 (mass>0), C5 (geometry>0), C11 (HW map exists), C15 (num_stages), C17 (terminal+separation) | **PASS** |
| C3 (CG/inertia coupling) | **WARN** — `cg_full_body_m` label is correct but value `2.90539 m` is pending AE value-semantic check (see §10 Q6b in plan) |
| C13 (seeker block) | **N/A** — no seeker on BA |
| C20 (controller_ref resolves), C22 (gain set complete) | **PASS** |
| C24 (abort_policy present) | **PASS** (soft-required at onboarding) |
| C25 (CAN utilisation budget) | **PASS** at design time |

## 4. Outstanding items before promotion to `flight-ready`

1. **Resolve plan §10 Q6b (value-semantic check).** Field `cg_full_body_m` is
   declared (label resolved 2026-05-14). The value `2.90539 m` was originally
   the propellant CG; the mass-weighted blend implied by the declared masses
   is `(291*2.485 + 285*2.90539) / 576 ≈ 2.6925 m`. AE must confirm whether
   (a) the value should be recomputed to the blend, or (b) the file's
   `cg_full_body_m` is the loaded-rocket CG measured separately.
2. **Compute `burn_time_s`, `total_impulse_Ns`, `isp_s`** from
   `thrust_curve.csv` during Phase β parsing; replace the `null`s in
   `rocket_properties.yaml`.
3. **Wind-tunnel cross-check** of CA hypercubes against the production rocket
   (currently using CFD data only).
4. **HIL bench acceptance** (Phase ζ.1, Path A and Path B) before any
   `flight_build = true` binary is signed. **Currently blocked**: no hardware
   is on hand (plan §10 Q3 ANSWERED 2026-05-15). Procurement on critical path.

## 5. Golden-log inventory

`rockets/BA/golden/` is currently empty. Tier 3 CI requires >= 8 envelope
cells before promotion. The expected cells correspond one-to-one with the
entries in `rockets/BA/scenarios.yaml`.

## 6. Sign-off (pending)

- [ ] Aerodynamics lead — CFD coefficient table accepted
- [ ] Propulsion lead — thrust curve confirmed against motor lot data
- [ ] Avionics lead — `hardware_mapping.yaml` matches as-built wiring
- [ ] GNC lead — controller gains accepted on bench HIL
- [ ] Project lead — final commit to `release_manifest.committed_rockets`
