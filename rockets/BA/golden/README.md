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

**Status:** empty (initial bootstrap). Logs are filled by Phase γ.
