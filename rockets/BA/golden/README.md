# `golden/` — Reference flight logs

Tier 3 SIL requires **>= 8 envelope cells** (HDF5 files, one per envelope
combination) before BA can be promoted to `flight-ready` in
`release_manifest.yaml`.

Each file is produced by:

1. Phase γ simulation engine (using the canonical sim with full BA aero
   data and the locked controller / actuator library).
2. Result saved as `<scenario_id>.h5` with the 103-column schema described
   in `schemas/flight_log_103_columns.yaml`.

CI's Tier 3 then re-runs each cell on the Path A binary and the Path B
binary, comparing both against this golden under the tolerances in
`rockets/BA/tolerances.yaml`. Parity must exceed
`release_manifest.sil_acceptance.parity_threshold_pct` (currently 90%).

## Bootstrap acceptance baseline (v8 P4.1)

`golden_metrics.csv` is the **in-repo bootstrap** baseline: eight envelope cells
(`scenarios.yaml`) run as deterministic ballistic ascents of the canonical
`gnc-core` Full6DOF integrator (fixed seed, 5 ms step), reduced to per-cell
scalar metrics (apogee, time-to-apogee, peak speed, peak Mach, burnout time,
final mass). `gnc-core/tests/closed_loop_test.cc` re-runs each cell and asserts
the metrics match within `tolerances.yaml:golden_metrics`, so **a behavioural
regression in the integrator/physics now fails CI**. Verified byte-identical at
`-O0` and `-O2`.

The same test also exercises the full closed-loop GNC pipeline
(integrator + ErrorStateKF estimator + controller + allocator) on **estimated**
state (INV-3) and asserts integration-level invariants (finite trajectory, mass
depletion, bounded rates, run-to-run determinism). Quantitative attitude-tracking
goldens are intentionally **not** asserted yet: the control laws are still the
audited PD stubs, and per the plan a golden on stub internals would bake in wrong
behaviour — those land with controller graduation.

**Status:** bootstrap metrics present (`golden_metrics.csv`, 8 cells).
**Still pending for Tier-3 promotion:** the 103-column HDF5 logs and the
Path A / Path B parity re-run (needs the canonical sim binary + HDF5 tooling).
