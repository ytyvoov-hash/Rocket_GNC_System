# GNC Frontend — Plan v5.4 Compatibility Analysis

**Date:** 2026-05-14
**Plan reference:** `Rocket_GNC_System_Plan_v5.4.md`
**Frontend reference:** `gnc-frontend/` (React + TypeScript + Vite)
**Analyst scope:** Interface compatibility — routes, data models, technology stack, screen fidelity, backend integration contracts.

---

## 1. Executive Summary

The `gnc-frontend` codebase establishes a solid visual skeleton that matches the plan's dark-mode, screen-numbered UI philosophy. The routing structure (`App.tsx`) covers S1–S22, the layout, authentication shell, and Redux store are all in place. However, **the implementation is currently at prototype / mockup fidelity**: all data is hardcoded, no WebSocket or REST connections exist, and several P0-priority screens, data model fields, and required third-party libraries are absent. The gap analysis below is organized from highest to lowest architectural impact.

| Area | Compatibility |
|------|--------------|
| Screen routing (S1–S22) | ⚠️ Partial — 3 P0 screens missing |
| Technology stack | ⚠️ Partial — 7 required libraries absent |
| Redux data models | ❌ Insufficient — critical fields missing |
| Live data / WebSocket | ❌ Not implemented |
| Backend REST integration | ❌ Not implemented |
| Multi-stage architecture | ❌ Not reflected in any model or UI |
| Localisation (Arabic + RTL) | ❌ Not started |
| Auth / RBAC (Keycloak) | ⚠️ Shell only |

---

## 2. Missing Screens

The plan defines **25 screens** (S1–S22 + S5b + S5c + S13a). The frontend implements 22.

### 2.1 S5b — Actuator Library Editor (P0)

- **Plan reference:** §6.2, §2.8, §2.8.6
- **Status:** No file, no route, no nav entry.
- **Impact:** Operators cannot manage `actuator_library.yaml`. The S5 Mission Config screen references actuator entries (via `actuator_ref` and `per_fin_actuator_ref`) that have no editor surface. The datasheet ingestion guide (§2.8.6) is also unavailable.
- **Required fields to expose:** `model_type` (4 variants), `wn_rad_s`, `zeta`, `delay_s`, `rate_max_deg_s`, `delta_max_deg`, `delta_min_deg`, `deadband_deg`, `backlash_deg`, `config_type`; full `electromechanical` sub-model (`motor`, `gearbox`).

### 2.2 S5c — Controller Library Editor (P0)

- **Plan reference:** §6.2, §2.9 (controller library), §5.2
- **Status:** No file, no route, no nav entry.
- **Impact:** Gain sets for the 12 control algorithms (PID, LQR, LQG, H-infinity, Sliding Mode, Backstepping, MPC linear/nonlinear, MRAC, L1 adaptive) cannot be authored or edited from the GCS. The S5 per-stage `controller_ref` picker has nothing to draw from.

### 2.3 S13a — Routing Manager (P0)

- **Plan reference:** §6.2, §6.4.7, §7.3.13, Close-integration Table 1 #4
- **Status:** The `S13_HardwareHealth.tsx` renders an `Open Routing Manager (S13a)` button, but no modal component, no route, and no Redux state for it exist.
- **Required behaviour:** USB auto-scan pre-fill from `schemas/android_usb_roles.yaml`; manual VID:PID bypass; operator ID + reason for any deviation; write to `gnc_device_assignments.json` via REST; stage YAML patch against `hardware_mapping.yaml`; disabled after T-3 min (ARMED state).

---

## 3. Technology Stack Gaps

The plan's §6.3 technology stack table lists the following libraries. Several are **absent from `package.json`**:

| Library | Plan purpose | In `package.json` |
|---------|-------------|------------------|
| `plotly.js` | Bode / Nyquist / root locus (S8, S10) | ❌ Missing |
| `ag-grid-react` | Paginated, sortable parameter tables (S4) | ❌ Missing |
| `handsontable` | Spreadsheet-style aero coefficient edits (S4) | ❌ Missing |
| `leaflet` or `maplibre-gl` | Map-based target / safety-zone editor (S5, S15) | ❌ Missing |
| `uplot` | High-performance time-series charts (S16 telemetry) | ❌ Missing |
| `d3` | Aerodynamic coefficient heatmaps (Mach × α) in S4 | ❌ Missing |
| `vis-timeline` | Fault-injection Gantt timeline (S12) | ❌ Missing |
| `react-dropzone` | Drag-and-drop template import (S3) | ❌ Missing |
| `shadcn/ui` | Component primitives (plan §6.3) | ❌ Missing |
| `vitest` | Unit testing (Tier 1 CI) | ❌ Missing |
| `playwright` | E2E testing (Tier 3 CI) | ❌ Missing |
| `i18next` or equivalent | Arabic + English RTL localisation | ❌ Missing |

**Present and compatible:** `react`, `react-router-dom`, `@reduxjs/toolkit`, `react-redux`, `tailwindcss`, `three`, `@react-three/fiber`, `@react-three/drei`, `recharts`, `lucide-react`, `clsx`.

> **Observation:** `recharts` (present) partially covers time-series but the plan explicitly names `uPlot` for high-frequency telemetry (50 Hz). `recharts` re-renders on every data point and will not meet the `< 30 ms UI response time` success criterion (§0.3.1) under sustained 50 Hz load.

---

## 4. Redux Data Model Gaps

### 4.1 `rocketSlice.ts` — `RocketTemplate` interface

The plan's full template schema (§2.2) has approximately 80 fields across 11 files. The current interface has **11 fields**, all of which are flat and single-stage. Critical missing fields:

| Missing field | Plan reference | Impact |
|--------------|----------------|--------|
| `num_stages` / `stages[]` | §2.2, Decision 16 | Multi-stage architecture entirely absent from state |
| `controller_type`, `controller_ref` | §2.2, §5.2 | Cannot select or display controller per stage |
| `seeker_capable` | Decision 5, §2.2 | Seeker subsystem config cannot be surfaced |
| `fin_config.sets[]` | §2.2, §2.8 | Multi-finset rockets (GH: 8 fins, SA: 12 fins) unrepresentable |
| `autopilot.capable_modes[]` | Decision 10 | S5 cannot derive which modes are valid for a stage |
| `hardware_mapping_file` | §2.2 | S5 / S13 cannot link to hardware topology |
| Template validation status (C1–C25) | §2.5 | No validation result surfaced in UI state |

**Data accuracy issue:** The `initialState` in `rocketSlice.ts` references "BA Canard Mk IV" with `mass: 42.5 kg` and `length: 1.2 m`. The plan's BA template (§2.2) specifies `mass_dry_kg: 286.245`, `propellant_mass_kg: 285.515` (total ~572 kg), and `ref_length_m: 5.453 m`. These are off by **10–12×** and will produce misleading values in any display that references them.

### 4.2 `telemetrySlice.ts` — `TelemetryState` interface

| Issue | Plan requirement | Current state |
|-------|-----------------|---------------|
| Saturation flags as bitmask | Cols 102–103, `uint8`/`uint16` bitmask (bit `i` = fin `i+1`); up to 12 fins | 4 scalar servo percentages; no bitmask; max 4 fins hardcoded |
| Stage index / transition log | §6.2 S16: "stage transitions"; MisPlot block 17 | No `currentStage` or `stageLog` field |
| IMM mode probabilities | MisPlot block 15, §4.1 | Not present |
| MHE solver status | MisPlot block 16 | Not present |
| Phase enum values | IMM derives `BOOST_S1`, `COAST_S1`, `SEP_1_to_2`, `TERMINAL` | Enum has `PRELAUNCH \| BOOST \| COAST \| TERMINAL \| RECOVERY` — `RECOVERY` is not a plan phase; multi-stage phases absent |
| Path identifier | Drives path-aware rendering in S5, S13, S14 | No `path: 'A' \| 'B'` field |
| GPS fix quality | §0.3.1 success criterion, S14 S04 step | Not present |
| `tickSimulation` is local | Plan requires live WebSocket at 50 Hz from flight computer | Fake ±gravity arithmetic; disconnected from backend |

### 4.3 Missing Redux Slices

| Slice | Plan requirement |
|-------|-----------------|
| `missionSlice` | S5 must hold the in-progress mission YAML state, track lock status, and trigger validation |
| `hardwareSlice` | S13 / S13a need live device topology, port assignments, and rescan results |
| `launchSlice` (extend `systemSlice`) | The current `systemSlice` has `launchArmed` and `launchInitiated` but lacks abort state machine, T-minus counter, and checklist gate |
| `actuatorLibrarySlice` | S5b needs CRUD state for `actuator_library.yaml` entries |
| `controllerLibrarySlice` | S5c needs CRUD state for `controller_library.yaml` entries |

---

## 5. Screen-by-Screen Compatibility

### 5.1 S4 — Rocket Details Editor

| Plan requirement (§6.4.2) | Current implementation |
|--------------------------|----------------------|
| Tabs: Physical, Geometry, Aero, Propulsion, Fins, **Stages**, **Estimation**, **Mission Compatibility** | Only 5 tabs: Physical, Geometry, Aero, Propulsion, **Stages & Fins** — `Estimation` and `Mission Compatibility` tabs missing |
| AG Grid for paginated views | Uses `recharts` `LineChart` only; no AG Grid |
| Handsontable for aero-coefficient spreadsheet edits | Not implemented |
| Live CP vs CG display with stability colour bands | Not implemented |
| Live C1–C25 validation on every edit | Not implemented |
| 2D body-shape editor (`AXIBOD` array) | Not implemented |
| Multiple named configurations per rocket | Not implemented |
| Modification history with undo/redo and time-stamped audit | Not implemented |

### 5.2 S5 — Mission Configuration

| Plan requirement (§2.7, §6.4.5) | Current implementation |
|---------------------------------|----------------------|
| Rocket picker from `release_manifest.yaml` (dynamic) | Hardcoded "BA Canard" label |
| Loop rate field, path-aware defaults, lock enforced before pre-launch (§1.9) | Not present |
| All 5 autopilot modes including `waypoint` | Only 4 modes (`waypoint` missing from dropdown) |
| `sequential` estimator approach | Only `single_filter` and `imm` in dropdown |
| Per-stage seeker configuration | Not present |
| MHE enable/disable, horizon, rate, overrun mode | Not present |
| Safety zone editor (polygon/circle/vlos_or_tethered) | Not present |
| `logging_profile` selector (FULL / FLIGHT / MINIMAL) | Not present |
| YAML validation on save + re-import | Not implemented; button reads "Generate mission.yaml" but no export logic |
| Links to S5b (Actuator Library) and S5c (Controller Library) | No links |

### 5.3 S13 — Hardware Health Monitor

| Plan requirement (§6.2, §11.3) | Current implementation |
|--------------------------------|----------------------|
| Per-port TX/RX bytes/s column | ✅ Present (static mock data) |
| 5 s rescan ticker | ✅ Spinner present (no real backend call) |
| Path-aware display (different topology for Path A vs B) | Hardcoded Path B only (`STM32H743`) |
| Live data via WebSocket at 1 Hz | Static hardcoded array |
| `Open Routing Manager (S13a)` button | ✅ Button rendered — no modal behind it |
| CAN bus error rate / utilisation (C25 < 70 %) | Not present |

### 5.4 S14 — Pre-Launch Checklist

| Plan requirement (§6.2, Phase 11) | Current implementation |
|-----------------------------------|----------------------|
| 24 steps (S01–S24) | Only 7 steps |
| Path-aware steps | Not path-aware |
| Step S22 enforces NO-GO on topology change after T-3 min | Not implemented |
| Gate to S15 requires all 24 green | Gate checks `2 / 24` (hardcoded label) but only 7 steps can ever pass |

### 5.5 S15 — Launch Control Centre (Kiosk Mode)

| Plan requirement (§6.4.6) | Current implementation |
|--------------------------|----------------------|
| Full-screen kiosk mode (no OS chrome) | ✅ `fixed inset-0` full-screen layout |
| ARM requires password + physical key | ✅ Password check + `hardwareKeyPresent` state |
| LAUNCH requires 2nd confirmation | ✅ Implemented in `systemSlice` |
| ABORT always single-press available | Requires verification in full file |
| System health panel (battery, GPS, servos, CAN) | Health items shown but hardcoded static text |
| T-minus countdown driven by backend | Hardcoded string `T- 00:14:22` |
| Password hardcoded as `'flight'` | **Security risk** — plan requires Keycloak/RBAC authentication |
| Every action logged to audit trail | `systemSlice` does not write to an audit log |

### 5.6 S16 — Live Flight Monitor

| Plan requirement (§6.2, §6.5, §0.3.1) | Current implementation |
|----------------------------------------|----------------------|
| Real-time 50 Hz WebSocket telemetry | `tickSimulation` Redux action on 50 ms `setInterval` (fake) |
| Stage transition log | Not present |
| Saturation flags cols 102–103 as bitmask | 4 scalar servo percentages (no cols 102/103 concept) |
| Multi-stage phase bar | Hardcoded 4-phase bar (`BOOST/COAST/RECOVERY/TERMINAL`); multi-stage phases absent |
| UI response < 30 ms (§0.3.1) | Cannot be met with `recharts` under real 50 Hz data |
| Attitude error chart (real data) | Decorative SVG path using `Math.sin(telemetry.time)` |

---

## 6. Backend Integration Gaps

The plan defines three transport layers the frontend must consume:

| Transport | Plan reference | Frontend status |
|-----------|---------------|-----------------|
| **WebSocket** — telemetry at 50 Hz, simulation progress (S6, S16) | §6.5 S6 / S16 | ❌ No WebSocket client anywhere |
| **TCP-5900 MCTU bridge** — NAV frame + control frame from flight computer (§7.3.9) | §6.5 S15, S16 | ❌ No TCP client |
| **REST API** — template CRUD, mission file lifecycle, hardware scan, audit log, actuator/controller libraries | §0.2, §1.7, §6.5 | ❌ No API client layer (`axios`, `fetch` wrappers, or RTK Query) |

No `services/` or `api/` directory exists in `gnc-frontend/src/`. Every data value in the UI is either hardcoded or derived from the fake `tickSimulation` reducer.

---

## 7. Localisation Gap

The plan mandates **Arabic + English with RTL support from day 1** (§1.1, §6.3). There is no `i18n` configuration, no RTL CSS provision, and no language-switching mechanism anywhere in the frontend. This affects every string in all 22 implemented screens.

---

## 8. Routing Issue

`S20_SystemSettings.tsx` exists as a file and is imported in `App.tsx` line 23, but **no route is registered for it** in `App.tsx`. The `Layout.tsx` sidebar links to `/settings` (line 88 via the Settings button at the bottom), but `<Route path="/settings">` is missing from `App.tsx`. The screen is unreachable.

---

## 9. Prioritised Recommendations

### P0 — Blocking for any operator workflow

1. **Add S5b and S5c routes and components.** These are prerequisite for any mission that references a non-default actuator or controller.
2. **Implement S13a modal.** Wire the existing button in `S13_HardwareHealth.tsx` to a real modal; connect to `gnc_device_assignments.json` REST endpoint.
3. **Introduce a WebSocket service layer** (`src/services/telemetryWs.ts`) that dispatches `updateTelemetry` with real frames. Replace `tickSimulation` with this.
4. **Fix `RocketTemplate` interface** to include `num_stages`, `stages[]`, `controller_type`, `seeker_capable`, `fin_config.sets[]`. Correct BA mock data values.
5. **Add `missionSlice`** to hold the in-progress mission YAML, lock status, and validation results.
6. **Add `waypoint` to S5 autopilot mode dropdown** and `sequential` to the estimator approach dropdown.
7. **Register `/settings` route** in `App.tsx` for `S20_SystemSettings`.

### P1 — Required for plan-accurate behaviour

8. **Extend `TelemetryState`** with `currentStage`, `saturationBitmask` (uint16), `immProbabilities`, `mheStatus`, `path`, `gpsFix`.
9. **Expand S14 checklist** to all 24 steps (S01–S24) with path-aware conditionals.
10. **Add S5 missing fields:** loop rate, seeker config, MHE settings, safety zone editor, `logging_profile` selector.
11. **Replace `recharts` time-series in S16** with `uPlot` to satisfy the `< 30 ms UI response` criterion under 50 Hz load.
12. **Install missing libraries:** `ag-grid-react`, `handsontable`, `plotly.js`, `uplot`, `leaflet`/`maplibre-gl`, `d3`, `vis-timeline`, `react-dropzone`.

### P2 — Required for production readiness

13. **Implement i18n** (e.g. `i18next` + `react-i18next`) with Arabic RTL stylesheet. All screen strings must be externalised.
14. **Replace hardcoded password `'flight'`** in `S15_LaunchControl.tsx` with Keycloak token validation.
15. **Add `hardwareSlice`** for live device topology driven by WebSocket/REST.
16. **Add audit trail writes** from `systemSlice` actions (ARM, LAUNCH, ABORT, login/logout).
17. **Add S4 missing tabs:** `Estimation` and `Mission Compatibility`; integrate AG Grid and Handsontable.
18. **Correct BA mock data** in `rocketSlice.ts` initialState to match plan values (mass ~572 kg, length 5.453 m).

---

## 10. Compatibility Matrix Summary

| Screen | Routes exists | Data model correct | Live data | Plan-complete |
|--------|:---:|:---:|:---:|:---:|
| S1 Login | ✅ | ⚠️ (no Keycloak/RBAC) | — | ⚠️ |
| S2 Dashboard | ✅ | ⚠️ (mock) | ❌ | ⚠️ |
| S3 Rocket Library | ✅ | ❌ (wrong data shape) | ❌ | ⚠️ |
| S4 Rocket Editor | ✅ | ❌ (missing tabs, no AG Grid) | ❌ | ❌ |
| S5 Mission Config | ✅ | ❌ (missing fields, hardcoded rocket) | ❌ | ❌ |
| **S5b Actuator Library** | ❌ | ❌ | ❌ | ❌ |
| **S5c Controller Library** | ❌ | ❌ | ❌ | ❌ |
| S6 Simulation Runner | ✅ | ⚠️ | ❌ | ⚠️ |
| S7 3D Telemetry | ✅ | ⚠️ | ❌ | ⚠️ |
| S8 Control Design Lab | ✅ | ⚠️ (no Plotly) | ❌ | ⚠️ |
| S9 Gain Schedule Editor | ✅ | ⚠️ | ❌ | ⚠️ |
| S10 Stability Analysis | ✅ | ⚠️ (no Plotly) | ❌ | ⚠️ |
| S11 Monte Carlo | ✅ | ⚠️ | ❌ | ⚠️ |
| S12 Fault Injection | ✅ | ⚠️ (no vis-timeline) | ❌ | ⚠️ |
| S13 Hardware Health | ✅ | ⚠️ (mock, Path B only) | ❌ | ⚠️ |
| **S13a Routing Manager** | ❌ | ❌ | ❌ | ❌ |
| S14 Pre-Launch Checklist | ✅ | ❌ (7/24 steps) | ❌ | ❌ |
| S15 Launch Control | ✅ | ⚠️ (hardcoded pwd) | ❌ | ⚠️ |
| S16 Live Flight Monitor | ✅ | ❌ (no cols 102/103, fake sim) | ❌ | ❌ |
| S17 Post-Flight Analysis | ✅ | ⚠️ | ❌ | ⚠️ |
| S18 Flight Replay | ✅ | ⚠️ | ❌ | ⚠️ |
| S19 Firmware Update | ✅ | ⚠️ | ❌ | ⚠️ |
| S20 System Settings | ⚠️ (no route) | ⚠️ | ❌ | ❌ |
| S21 Audit Trail | ✅ | ⚠️ | ❌ | ⚠️ |
| S22 Comparison Tool | ✅ | ⚠️ | ❌ | ⚠️ |

**Legend:** ✅ Satisfactory · ⚠️ Partial / prototype · ❌ Missing or incompatible
