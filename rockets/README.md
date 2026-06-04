# `rockets/` — Canonical rocket templates

Each subdirectory is a **complete rocket template** in the canonical multi-stage
layout described in §4.1 of the internal-system build plan.

## Folder layout (per rocket)

```
rockets/<rocket_id>/
├── rocket_properties.yaml     (canonical multi-stage template)
├── hardware_mapping.yaml      (per-rocket CAN node IDs, pyros, GPIOs)
├── tolerances.yaml            (Tier-3 SIL parity thresholds)
├── scenarios.yaml             (named flight scenarios)
├── envelope.yaml              (Mach/altitude/alpha grid -> envelope cells)
├── onboarding_report.md       (human-readable acceptance record)
├── golden/                    (HDF5 golden logs, >= 8 cells)
└── *.csv                      (aero, atmosphere, thrust tables)
```

## Validation

Every `rocket_properties.yaml` is validated by the Phase β parser against
`schemas/rocket_template.schema.yaml` and the C1–C25 validator clauses
(Appendix A.1 of the v5.4 plan). Failures block ingestion.

## Adding a new rocket

1. Run the Appendix A.2 onboarding workflow:
   1. Produce `rocket_properties.yaml` in the canonical layout (start from
      `rockets/BA/rocket_properties.yaml` as a template).
   2. Produce `hardware_mapping.yaml` (servo node IDs follow
      `0x25 + stage_index*12 + fin_index`).
   3. Author `tolerances.yaml`, `scenarios.yaml`, `envelope.yaml`.
   4. Drop aerodynamic / propulsion CSV files into the rocket folder.
   5. Author `onboarding_report.md` documenting the data source and any
      open semantic questions.
2. Add the rocket entry to `release_manifest.yaml`
   (`committed_rockets[]`).
3. CI's Tier 3 generates the envelope grid from `envelope.yaml`, runs the
   simulation engine, and writes goldens to `golden/`.
4. Once all four required artefacts exist
   (`golden/` ≥ 8 cells, `tolerances.yaml`, `scenarios.yaml`,
   `onboarding_report.md`) and the Path A / Path B parity gate passes,
   the rocket may be promoted from `status: draft` to `status: flight-ready`.

## Currently registered

- **BA** (sounding rocket, single stage, 4 fins X-config) — `status: draft`.
  Initial transformation of `Reference-data/BA(rocket_data_example)/stage1`.
  Awaits §10 Q6 confirmation of `cg_full_body_m` semantic.
