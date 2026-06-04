# GNC Schemas

Single source of truth for every YAML / JSON contract exchanged across the system.
Backend C++ structs, frontend TypeScript types, parser logic, and the C1–C25 validator
all derive from these files.

| File | Validates | Plan ref |
|------|-----------|----------|
| `rocket_template.schema.yaml` | `rockets/<id>/rocket_properties.yaml` | §2.2, clause C1 |
| `mission_file.schema.yaml` | `mission/<mission_id>.yaml` | §2.7 |
| `actuator_library.schema.yaml` | `actuator_library.yaml` (project root) | §2.8 |
| `controller_library.schema.yaml` | `controller_library.yaml` (project root) | §2.9 |
| `hardware_mapping.schema.yaml` | `rockets/<id>/hardware_mapping.yaml` | §A.6 |
| `android_usb_roles.yaml` | VID:PID → role lookup table (data, not a schema) | §6.4.7 |
| `flight_log_103_columns.yaml` | Frozen column order for HDF5 flight logs | Appendix C |

**Append-only rule:** `rocket_template.schema.yaml` and `flight_log_103_columns.yaml`
are frozen per Decision 6. New optional fields may be added; existing fields may not
be renamed, retyped, or removed.

**Code generation:** Run `tools/generate_types.sh` to produce backend C++ structs
(`gnc-backend/src/generated/`) and validate the frontend TS types
(`gnc-frontend/src/store/*.ts`) match. Tier 1 CI runs this check.
