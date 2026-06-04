# GNC Frontend — Implementation Plan
### Completion & Error-Fix Roadmap (based on compatibility analysis vs Plan v5.4)

**Date:** 2026-05-14
**Source analysis:** `gnc-frontend_compatibility_analysis.md`
**Plan reference:** `Rocket_GNC_System_Plan_v5.4.md`

---

## How to Read This Document

Tasks are grouped into **8 phases** ordered by dependency. Each phase must be substantially complete before the next begins. Tasks within a phase that have no dependencies can be parallelised across team members.

Priority codes mirror the plan: **[P0]** blocks operator workflow · **[P1]** required for plan-accurate behaviour · **[P2]** production readiness.

Owner codes: **FE** = Frontend Engineer · **BE** = Backend Engineer · **SA** = Systems Architect.

---

## Phase 0 — Critical Pre-Requisites (do first, unblocks everything else)

These are single-file fixes or additions that unblock all subsequent phases.

### Task 0.1 — Fix missing `/settings` route [P0] [FE]

**Problem:** `S20_SystemSettings.tsx` is imported in `App.tsx` but no `<Route>` is registered. The screen is unreachable.

**Fix:** In `src/App.tsx`, add inside the `<Layout>` route block:
```tsx
<Route path="/settings" element={<S20_SystemSettings />} />
```

**Also:** In `src/Layout.tsx` the bottom Settings button navigates nowhere — change it to `<NavLink to="/settings">`.

---

### Task 0.2 — Correct BA mock data in `rocketSlice.ts` [P0] [FE]

**Problem:** `initialState` has `mass: 42.5 kg`, `length: 1.2 m`. Plan §2.2 specifies `mass_dry_kg: 286.245`, `propellant_mass_kg: 285.515` (total ~572 kg), `ref_length_m: 5.453 m`.

**Fix:** Update the BA entry in `src/store/rocketSlice.ts`:
```ts
mass: 571.76,     // dry + propellant per §2.2
length: 5.453,    // ref_length_m
diameter: 0.273,  // ref_diameter_m
cgPosition: 2.93, // cg_full_body_m[0] (approximate)
cpPosition: 3.15, // computed from CN/CM tables
```

---

### Task 0.3 — Remove hardcoded password in `S15_LaunchControl.tsx` [P0] [FE]

**Problem:** `if (password === 'flight')` is a security vulnerability. Plan §1.7 requires Keycloak RBAC.

**Interim fix (until Phase 6 Keycloak integration):** Replace hardcoded comparison with a check against `state.auth.role`:
```ts
// ARM only if role is 'operator' or 'admin' AND password matches a server-validated token
// Temporary: require role === 'operator' from Redux auth state; actual credential check deferred to Phase 6
if (auth.role === 'operator' || auth.role === 'admin') { dispatch(armLaunch(true)); }
```

Add `'operator'` to the `AuthState.role` union in `authSlice.ts`.

---

### Task 0.4 — Add `'operator'` role to `authSlice.ts` [P0] [FE]

**Problem:** Plan §1.7 defines RBAC roles: `viewer`, `engineer`, `operator`, `admin`. The current `role` union is missing `'operator'`.

**Fix:** In `src/store/authSlice.ts`:
```ts
role: 'admin' | 'engineer' | 'operator' | 'viewer' | null;
```
Update `login` action payload type to match.

---

## Phase 1 — Library Installation

Install all missing dependencies before writing any new screen code. All are `npm install` commands.

### Task 1.1 — Production dependencies [P0] [FE]

```bash
npm install uplot react-uplot
npm install ag-grid-react ag-grid-community
npm install handsontable @handsontable/react
npm install plotly.js react-plotly.js
npm install leaflet react-leaflet @types/leaflet
npm install d3 @types/d3
npm install vis-timeline @types/vis-timeline
npm install react-dropzone
npm install i18next react-i18next i18next-browser-languagedetector
npm install axios
```

### Task 1.2 — Development / testing dependencies [P1] [FE]

```bash
npm install --save-dev vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event
npm install --save-dev @playwright/test
```

### Task 1.3 — shadcn/ui setup [P2] [FE]

Follow the shadcn/ui Vite + Tailwind v4 setup guide. Install the component primitives used across screens (Button, Dialog, Select, Tabs, Badge, Table).

---

## Phase 2 — Redux Store Overhaul

All data model changes before any screen work. Screens depend on these types.

### Task 2.1 — Redesign `RocketTemplate` interface in `rocketSlice.ts` [P0] [FE/BE]

Replace the flat 11-field interface with a multi-stage structure matching plan §2.2:

```ts
interface PhysicalProps {
  mass_dry_kg: number;
  propellant_mass_kg: number;
  cg_dry_body_m: [number, number, number];
  cg_full_body_m: [number, number, number];
  inertia_dry_kgm2: [number, number, number];
  inertia_full_kgm2: [number, number, number];
}

interface StageTemplate {
  id: string;
  name: string;
  is_terminal: boolean;
  has_warhead: boolean;
  physical: PhysicalProps;
  geometry: { ref_diameter_m: number; ref_length_m: number; ref_area_m2: number };
  controller_type: 'fins' | 'tvc' | 'hybrid' | 'cold_gas' | 'aerospike' | 'roll_canards' | 'none';
  controller_ref: string;
  seeker_capable: boolean;
  autopilot: { enabled: boolean; capable_modes: AutopilotMode[] };
  fin_config?: { sets: FinSet[] };
  separation?: SeparationBlock; // non-terminal stages only
}

interface RocketTemplate {
  id: string;
  display_name: string;
  type: string;
  status: 'flight-ready' | 'draft' | 'archived';
  num_stages: number;
  stages: StageTemplate[];
  hardware_mapping_file: string;
  validation?: { clauses: Record<string, 'PASS' | 'WARN' | 'FAIL'>; overall: 'PASS' | 'WARN' | 'FAIL' };
  cad_model?: string;
}
```

Keep `RocketState.library` and `activeRocket` as before but typed to the new interface. Update mock BA data to match plan values.

---

### Task 2.2 — Redesign `TelemetryState` in `telemetrySlice.ts` [P0] [FE]

Add all missing fields from MisPlot frame definitions (§7.3.5) and plan S16 requirements:

```ts
interface TelemetryState {
  // existing fields (keep)
  time: number;
  altitude: number;
  velocity: number;
  mach: number;
  q: number;
  attitude: { pitch: number; yaw: number; roll: number };
  phase: string; // now a free string to allow 'BOOST_S1', 'COAST_S1', 'SEP_1_to_2', 'TERMINAL'
  isSimRunning: boolean;

  // new fields
  path: 'A' | 'B' | null;
  currentStage: number;           // 0-indexed
  stageTransitionLog: { time: number; from: number; to: number; trigger: string }[];
  saturationBitmask: number;      // uint16 — cols 102-103; bit i = fin i+1
  immProbabilities: number[];     // MisPlot block 15, up to 6 modes
  mheStatus: { converged: boolean; iterations: number; residual: number } | null;
  gpsFix: 'NO_FIX' | 'GPS' | 'SBAS' | 'RTK' | null;
  actuators: Record<string, number>; // keyed by fin index string, not fixed 4-servo
}
```

Remove `tickSimulation` (replaced by WebSocket service in Phase 4). Keep it as a stub that dispatches a warning until WebSocket is live.

---

### Task 2.3 — Create `missionSlice.ts` [P0] [FE]

New file `src/store/missionSlice.ts`. Must model the full mission YAML schema (§2.7.2):

```ts
type AutopilotMode = 'auto_shape' | 'fixed_pitch' | 'passive_ballistic' | 'waypoint' | 'terminal_homing';
type EstimatorApproach = 'single_filter' | 'sequential' | 'imm';
type FlightPath = 'A' | 'B';

interface MissionState {
  missionId: string | null;
  rocketId: string | null;
  path: FlightPath;
  loop_rate_hz: number;
  locked: boolean;           // true after pre-launch lock (rate frozen)
  stages: PerStageMission[];
  estimator: { approach: EstimatorApproach };
  mhe: { enabled: boolean; horizon: number; rate_hz: number; budget_overrun_mode: string };
  seeker: SeekerConfig;
  optional_devices: OptionalDevices;
  logging_profile: 'FULL' | 'FLIGHT' | 'MINIMAL';
  safety_zone: SafetyZone;
  validation: { status: 'not_run' | 'valid' | 'invalid'; errors: string[] };
  yamlOutput: string | null;
}
```

Reducers: `setMissionField`, `setStageMode`, `lockMission`, `unlockMission`, `setValidation`, `setYamlOutput`.

---

### Task 2.4 — Create `hardwareSlice.ts` [P0] [FE]

New file `src/store/hardwareSlice.ts`. Models live hardware topology from S13/S13a:

```ts
interface PortStatus {
  name: string;
  dev: string;
  vid: string;
  pid: string;
  suggestedRole: string;
  assignedRole: string;
  rxBps: number;
  txBps: number;
  status: 'OK' | 'WARN' | 'ERROR' | 'OFFLINE';
}

interface HardwareState {
  path: 'A' | 'B' | null;
  ports: PortStatus[];
  lastRescan: number | null;   // unix timestamp ms
  cpuTemp: number | null;
  cpuLoad: number | null;
  heapFreeKb: number | null;
  canUtilPct: number | null;
  routingManagerOpen: boolean;
  deviceAssignments: Record<string, string>; // vid:pid -> role
  yamlPatchPending: boolean;
}
```

Reducers: `updatePorts`, `setRoutingManagerOpen`, `saveDeviceAssignments`, `triggerRescan`.

---

### Task 2.5 — Create `actuatorLibrarySlice.ts` [P1] [FE]

New file `src/store/actuatorLibrarySlice.ts`. Models all 4 model types from §2.8.3 (second_order_with_delay, first_order, ideal, electromechanical). Reducers: `addEntry`, `updateEntry`, `removeEntry`, `setLibrary`.

---

### Task 2.6 — Create `controllerLibrarySlice.ts` [P1] [FE]

New file `src/store/controllerLibrarySlice.ts`. Models gain sets per the 12 algorithms from §5.2. Reducers: `addGainSet`, `updateGainSet`, `removeGainSet`, `setLibrary`.

---

### Task 2.7 — Expand `systemSlice.ts` [P0] [FE]

Add state for the full launch state machine (plan §11, §6.4.6):

```ts
type LaunchState = 'IDLE' | 'CHECKLIST' | 'ARMED' | 'COUNTDOWN' | 'LAUNCHED' | 'ABORTED';

interface SystemState {
  // existing
  hardwareKeyPresent: boolean;
  launchArmed: boolean;
  launchInitiated: boolean;
  checklistProgress: number;
  // new
  launchState: LaunchState;
  tMinusSeconds: number | null;
  abortReason: string | null;
  auditLog: { ts: number; operator: string; action: string }[];
}
```

Add `writeAudit`, `setLaunchState`, `setTMinus`, `abort` reducers. Every ARM, LAUNCH, ABORT dispatches `writeAudit`.

---

### Task 2.8 — Register new slices in `store.ts` [P0] [FE]

Update `src/store/store.ts` to include all new slices:

```ts
import missionReducer from './missionSlice';
import hardwareReducer from './hardwareSlice';
import actuatorLibraryReducer from './actuatorLibrarySlice';
import controllerLibraryReducer from './controllerLibrarySlice';
// add to combineReducers
```

---

## Phase 3 — Backend Integration Layer

All API and WebSocket connections. Screens depend on these services.

### Task 3.1 — Create REST API client `src/services/api.ts` [P0] [FE/BE]

Thin `axios`-based client wrapping the endpoints from §2.9. Base URL from env variable `VITE_API_BASE_URL`.

```ts
// Templates
export const getTemplates = () => api.get('/api/v1/templates');
export const getTemplate = (id: string) => api.get(`/api/v1/templates/${id}`);
export const importTemplate = (form: FormData) => api.post('/api/v1/templates', form);
export const validateTemplate = (id: string) => api.post(`/api/v1/templates/${id}/validate`);
export const patchTemplate = (id: string, patch: JsonPatch) => api.patch(`/api/v1/templates/${id}`, patch);

// Libraries
export const getActuatorLibrary = () => api.get('/api/v1/actuator-library');
export const patchActuatorLibrary = (patch: JsonPatch) => api.patch('/api/v1/actuator-library', patch);
export const getControllerLibrary = () => api.get('/api/v1/controller-library');
export const patchControllerLibrary = (patch: JsonPatch) => api.patch('/api/v1/controller-library', patch);

// Missions
export const getMissions = () => api.get('/api/v1/missions');
export const createMission = (yaml: string) => api.post('/api/v1/missions', { yaml });
export const lockMission = (id: string) => api.post(`/api/v1/missions/${id}/lock`);

// Hardware
export const getDeviceScan = () => api.get('/api/v1/hardware/scan');
export const getDeviceAssignments = () => api.get('/api/v1/hardware/assignments');
export const saveDeviceAssignments = (body: object) => api.put('/api/v1/hardware/assignments', body);
```

Attach Bearer token from `state.auth` (interceptor pattern).

---

### Task 3.2 — Create WebSocket telemetry service `src/services/telemetryWs.ts` [P0] [FE]

Connects to `ws://<host>/ws/telemetry`. On each message, parses the MisPlot frame fields (§7.3.5) and dispatches `updateTelemetry`. Handles reconnect with exponential back-off.

```ts
export function startTelemetryStream(dispatch: AppDispatch) {
  const ws = new WebSocket(`${import.meta.env.VITE_WS_URL}/ws/telemetry`);
  ws.onmessage = (event) => {
    const frame = parseMisPlotFrame(event.data);  // deserialise 77-byte frame
    dispatch(updateTelemetry({
      time: frame.timestamp_ms / 1000,
      altitude: frame.payload_alt,
      velocity: frame.payload_vel,
      mach: frame.payload_mach,
      attitude: { pitch: frame.payload_pitch, yaw: frame.payload_yaw, roll: frame.payload_roll },
      saturationBitmask: (frame.payload[0] | (frame.payload[1] << 8)),
      currentStage: frame.block17?.current_stage ?? 0,
      immProbabilities: frame.block15?.mu ?? [],
      mheStatus: frame.block16 ?? null,
    }));
  };
  // reconnect logic ...
}
```

Call `startTelemetryStream(dispatch)` from `S16_LiveFlightMonitor` and `S15_LaunchControl` `useEffect`.

---

### Task 3.3 — Create hardware WebSocket service `src/services/hardwareWs.ts` [P0] [FE]

Connects to `ws://<host>/ws/hardware`. Dispatches `updatePorts` at 1 Hz and `triggerRescan` responses. Used by S13 and S13a.

---

### Task 3.4 — Create simulation WebSocket service `src/services/simulationWs.ts` [P1] [FE]

Connects to `ws://<host>/ws/simulation`. Used by S6 for live progress during simulation runs.

---

## Phase 4 — Missing Screens

### Task 4.1 — Build `S5b_ActuatorLibraryEditor.tsx` [P0] [FE]

**Route:** `/actuators` · **Nav label:** `S5b: Actuator Library`

Key UI elements (plan §2.8, §6.2):
- Table of all actuator entries with `model_type` badge (colour-coded: second_order=blue, first_order=teal, ideal=grey, electromechanical=purple).
- `+ New Entry` button opens a side-panel form. Fields adapt per `model_type`:
  - **second_order_with_delay:** `wn_rad_s`, `zeta`, `delay_s`, `rate_max_deg_s`, `delta_max_deg`, `delta_min_deg`, `deadband_deg`, `backlash_deg`, `config_type`.
  - **first_order:** `tau_s`, `rate_max_deg_s`, limits.
  - **ideal:** rate and limits only.
  - **electromechanical:** nested `motor` + `gearbox` sub-forms.
- Embedded **Datasheet Ingestion Guide** tab (renders `docs/actuator_datasheet_ingestion.md` from §2.8.6): bandwidth→ωₙ, step response→(ωₙ,ζ), slew rate, delay, deadband, backlash conversion rules.
- Edit / Delete with confirmation. All writes go via `patchActuatorLibrary` API call → then `dispatch(setLibrary(...))`.
- On mount: `dispatch(fetchActuatorLibrary())` RTK thunk.

**Add route to `App.tsx`:**
```tsx
<Route path="/actuators" element={<S5b_ActuatorLibraryEditor />} />
```
**Add nav entry to `Layout.tsx`** (between S5 and S6 entries).

---

### Task 4.2 — Build `S5c_ControllerLibraryEditor.tsx` [P0] [FE]

**Route:** `/controllers` · **Nav label:** `S5c: Controller Library`

Key UI elements (plan §6.2, §5.2):
- Accordion grouped by `controller_type` (fins / tvc / hybrid / cold_gas / roll_canards / none).
- Each entry shows the gain set: per-axis PID gains (or LQR Q/R matrices, etc.) as an editable table.
- Algorithm selector per entry from the 12 algorithms: `PID`, `PID_GS`, `LQR`, `LQG`, `H_infinity`, `SlidingMode`, `Backstepping`, `MPC_linear`, `MPC_nonlinear`, `MRAC`, `L1_adaptive` (plan §5.2).
- `+ New Gain Set` button with name, algorithm, controller_type fields.
- All writes go via `patchControllerLibrary` API call.

**Add route to `App.tsx`** and nav entry to `Layout.tsx`.

---

### Task 4.3 — Build `S13a_RoutingManager.tsx` as a modal [P0] [FE]

**No new route** — opens as a `<Dialog>` from S13's "Open Routing Manager" button.

Key UI elements (plan §6.4.7):
- Table: `Device`, `Node`, `VID`, `PID`, `Suggested Role`, `Assigned Role (dropdown)`, `Accept` button.
- `+ Add Row` for manual VID:PID bypass entries.
- "Conflicts with `hardware_mapping.yaml`" diff panel (red rows for mismatches).
- "Show unrecognised devices" expander — hidden by default (plan Drop-table item 5).
- Operator acknowledgement block: checkbox + `Operator ID` + `Reason` text field (required when any row differs from canonical mapping).
- `[Save and stage YAML patch]` button: calls `saveDeviceAssignments()` API, dispatches `setYamlPatchPending(true)`, closes dialog.
- **Disabled** entirely when `state.system.launchState === 'ARMED'` or beyond (plan §6.4.7 rule 5).

Wire into `S13_HardwareHealth.tsx`:
```tsx
import S13a_RoutingManager from './S13a_RoutingManager';
// Replace the button with:
<button onClick={() => dispatch(setRoutingManagerOpen(true))}>Open Routing Manager (S13a)</button>
{state.hardware.routingManagerOpen && <S13a_RoutingManager />}
```

---

## Phase 5 — Screen Completions

### Task 5.1 — S5 Mission Configuration [P0] [FE]

Complete all missing fields from plan §2.7.2 and §6.4.5. Work inside existing `S5_MissionConfig.tsx`:

| Missing element | Implementation |
|----------------|----------------|
| Rocket picker | `<select>` populated from `GET /api/v1/templates` response (RTK query); no hardcoded label |
| Loop rate field | Numeric input with path-aware min/max (A: 50–200, B: 100–500); lock shown after `state.mission.locked === true` |
| `waypoint` mode | Add 5th option to autopilot mode dropdown; conditionally show waypoints list input |
| `sequential` estimator | Add 3rd option to estimator approach dropdown |
| Seeker configuration | Collapsible card: `enabled`, `mode` (strapdown/gimbaled), `target_class`, `loss_of_lock_policy`, `pn_variant`, `pn_gain_N`, `inference_target` |
| MHE settings | Collapsible card: `enabled`, `horizon`, `rate_hz`, `budget_overrun_mode`; inputs validate against path-aware ranges |
| Safety zone editor | Tab with Leaflet map + polygon/circle/vlos draw tools; `abort_on_breach` toggle |
| `logging_profile` selector | Radio group: FULL / FLIGHT / MINIMAL |
| YAML export | "Generate & Validate" button calls `POST /api/v1/missions` with current state, displays returned validation errors and YAML preview |
| Links to S5b/S5c | "Manage Actuator Library →" and "Manage Controller Library →" NavLink buttons at bottom of panel |
| Loop rate lock | After lock, show a lock icon and prevent edits; driven by `state.mission.locked` |

---

### Task 5.2 — S4 Rocket Editor [P1] [FE]

| Missing element | Implementation |
|----------------|----------------|
| `Estimation` tab | New tab: estimator approach selector, per-stage IMM mode set preview derived from `stages[]`, `mhe` defaults |
| `Mission Compatibility` tab | New tab: runs C1–C25 clause list from `POST /api/v1/templates/{id}/validate`; colour-coded PASS/WARN/FAIL per row |
| AG Grid | Replace current `recharts`-only table views (physical, geometry) with `<AgGridReact>` with `columnDefs` matching schema fields |
| Handsontable | Aero tab: replace or augment the line chart with `<HotTable>` spreadsheet for coefficient block editing |
| Live CP vs CG | Add a small SVG bar chart below the aero table: CG position (green dot), CP position (red dot), margin (shaded). Updates on every `CA_multiplier` / `thrust_multiplier` change |
| C1–C25 live validation | Debounced call to `POST /api/v1/templates/{id}/validate` on each tab switch; badges on each tab header (green/yellow/red count) |
| Multi-stage `stages[]` | "Stages & Fins" tab: driven by `state.rocket.activeRocket.stages[]`; add/remove stages with `num_stages` control |

---

### Task 5.3 — S13 Hardware Health [P0] [FE]

| Missing element | Implementation |
|----------------|----------------|
| Live data | Replace static `ports` array with `useAppSelector(state => state.hardware.ports)`. On mount: `startHardwareStream(dispatch)` (Task 3.3) |
| Path-aware header | Show "Snapdragon 845 (Path A)" or "STM32H743 (Path B)" based on `state.mission.path` |
| CAN utilisation | Add a gauge row below CPU: reads `state.hardware.canUtilPct`; warn > 70% (C25) |
| S13a modal wire-up | As described in Task 4.3 |
| Rescan timestamp | Show "Last scan: N s ago" counter from `state.hardware.lastRescan` |

---

### Task 5.4 — S14 Pre-Launch Checklist [P0] [FE]

**Expand to all 24 steps** (plan Phase 11). Define full step list:

```ts
const ALL_STEPS = [
  { id: 'S01', title: 'Hardware Path Verification', desc: 'Actual hardware matches declared flight_computer_path in mission file.' },
  { id: 'S02', title: 'Mission File Lock', desc: 'Mission YAML locked; SHA-256 recorded.' },
  { id: 'S03', title: 'Telemetry Uplink', desc: 'LoRa link quality > 90 %.' },
  { id: 'S04', title: 'GPS RTK Fix', desc: 'Fix quality = RTK or SBAS; ≥ 6 satellites.' },
  { id: 'S05', title: 'IMU Alignment', desc: 'Gyro bias convergence; bias < threshold.' },
  { id: 'S06', title: 'Loop Rate Confirmed', desc: 'Locked loop rate matches mission file.' },
  { id: 'S07', title: 'Actuator Sweep (broadcast)', desc: 'Broadcast 3 s sweep; per-fin pass/fail logged.' },
  { id: 'S08', title: 'CAN Bus Health', desc: 'Bus utilisation < 70 %; all node IDs responding.' },
  { id: 'S09', title: 'Servo Midpoint Set', desc: 'All servos commanded to zero; feedback confirmed.' },
  { id: 'S10', title: 'Igniter Continuity', desc: 'E-match resistance within spec.' },
  { id: 'S11', title: 'Pyro ARM', desc: 'Arm command sent; STM32 confirms armed state.' },
  { id: 'S12', title: 'Mission File Upload', desc: 'mission.yaml pushed to flight computer.' },
  { id: 'S13', title: 'Thermal Check', desc: 'All temperatures within limits.' },
  { id: 'S14', title: 'Battery Voltages', desc: 'All packs above minimum voltage.' },
  { id: 'S15', title: 'Safety Zone Active', desc: 'Safety zone loaded; abort_on_breach armed.' },
  { id: 'S16', title: 'USB Routing Confirmed', desc: 'No topology change since last rescan; S13a closed.' },
  { id: 'S17', title: 'ESKF Initialised', desc: 'ESKF running; covariance converged.' },
  { id: 'S18', title: 'Launch Rail Level', desc: 'Rail clinometer within ±0.5°.' },
  { id: 'S19', title: 'Wind Check', desc: 'Surface wind within mission abort policy limits.' },
  { id: 'S20', title: 'Seeker Check', desc: 'Seeker status = READY (or IDLE if seeker disabled).' },
  { id: 'S21', title: 'Flight Log Initialised', desc: 'Log file open; header written; 0 rows.' },
  { id: 'S22', title: 'No Hot-Plug Since T-3 min', desc: 'S13 rescan reports same topology as S16.' },
  { id: 'S23', title: 'Operator GO/NO-GO', desc: 'All discipline leads confirm GO.' },
  { id: 'S24', title: 'Pre-Launch Complete', desc: 'All 23 previous steps passed; proceed authorised.' },
];
```

Each step's `status` comes from `state.system.checklistProgress`. Gate button: all 24 = green → enable "Proceed to Launch Control".

Path-aware steps: S07 (seeker check) hidden if `state.mission.seeker.enabled === false`. S22 reads `state.hardware.lastRescan`.

---

### Task 5.5 — S15 Launch Control [P1] [FE]

| Missing element | Implementation |
|----------------|----------------|
| T-minus countdown | Subscribe to `state.system.tMinusSeconds`; backend pushes countdown via hardware WebSocket |
| System health panel | Wire each row to `state.hardware.ports` and `state.telemetry.gpsFix` |
| ABORT state machine | `dispatch(abort('operator_initiated'))` → transitions `launchState` to `ABORTED`; logs to `auditLog` |
| Password removal | Completed in Task 0.3 + Phase 6 Keycloak integration |

---

### Task 5.6 — S16 Live Flight Monitor [P0] [FE]

| Missing element | Implementation |
|----------------|----------------|
| Replace fake `tickSimulation` | Remove `setInterval`. Data comes from `startTelemetryStream` (Task 3.2) |
| Replace `recharts` time-series | Use `uPlot` for the attitude error chart; target < 30 ms render per §0.3.1 |
| Saturation flags (cols 102–103) | Replace the 4 scalar bars with a bitmask renderer: iterate bits 0–11 of `state.telemetry.saturationBitmask`, render one indicator per bit |
| Stage transition log | New panel below the phase bar: scrollable list of `state.telemetry.stageTransitionLog` entries |
| Multi-stage phase bar | Dynamically size bars based on `state.rocket.activeRocket.num_stages`; render `BOOST_Sn`, `COAST_Sn`, `SEP_n` segments |
| IMM mode probabilities | Add a stacked bar chart (MisPlot block 15): one bar per mode, heights = `immProbabilities[]` |

---

## Phase 6 — Security and Authentication

### Task 6.1 — Keycloak OIDC integration [P2] [FE/BE]

Install `keycloak-js` or `@react-keycloak/web`. In `main.tsx`:
```tsx
import Keycloak from 'keycloak-js';
const keycloak = new Keycloak({ url: import.meta.env.VITE_KEYCLOAK_URL, realm: 'gnc', clientId: 'gnc-frontend' });
keycloak.init({ onLoad: 'login-required' }).then(() => {
  store.dispatch(login({ operatorId: keycloak.tokenParsed?.preferred_username, role: keycloak.realmAccess?.roles[0] }));
});
```

Map Keycloak realm roles (`viewer`, `engineer`, `operator`, `admin`) to `state.auth.role`. Replace `S1_LoginScreen.tsx` form with the Keycloak redirect flow.

---

### Task 6.2 — RBAC guards [P2] [FE]

Create `src/utils/rbac.ts`:
```ts
export const canArm = (role: string | null) => role === 'operator' || role === 'admin';
export const canEditTemplate = (role: string | null) => role === 'engineer' || role === 'admin';
export const canViewOnly = (role: string | null) => role === 'viewer';
```

Apply guards: ARM button in S15 checks `canArm(role)`; all `PATCH`/`POST` API calls check `canEditTemplate(role)`.

---

### Task 6.3 — Audit trail writes [P2] [FE]

Every safety-critical action dispatches `writeAudit`:
- Login / logout
- Mission lock / unlock
- ARM, LAUNCH, ABORT
- S13a device assignment save
- Template PATCH / DELETE

`auditLog` entries are also `POST`ed to `POST /api/v1/audit` so the server-side PostgreSQL log (§1.7) is the authoritative record.

---

## Phase 7 — Localisation (Arabic + English RTL)

### Task 7.1 — i18n setup [P2] [FE]

Create `src/i18n/index.ts` initialising `i18next` with `i18next-browser-languagedetector`. Create two translation files:
- `src/i18n/locales/en.json`
- `src/i18n/locales/ar.json`

Add a language toggle to `Layout.tsx` header bar. When Arabic selected, add `dir="rtl"` to `<html>` and include Tailwind RTL utilities.

### Task 7.2 — Externalise all screen strings [P2] [FE]

Replace every literal string in all 25 screen components with `t('key')` calls. This is a mechanical pass; recommended approach: add keys to `en.json` first, then translate to `ar.json` in parallel.

---

## Phase 8 — Testing

### Task 8.1 — Vitest unit tests (Tier 1 CI) [P1] [FE]

Create `gnc-frontend/tests/unit/` directory. Write unit tests for:
- All Redux slices (`missionSlice`, `hardwareSlice`, `telemetrySlice`, `rocketSlice`, `systemSlice`).
- `src/services/api.ts` (mock axios adapter).
- `src/utils/rbac.ts`.
- `parseMisPlotFrame` from Task 3.2.

Target: > 80 % coverage on `src/store/` and `src/services/` per §0.3.1.

### Task 8.2 — Playwright E2E tests (Tier 3 CI) [P1] [FE/DO]

Create `gnc-frontend/tests/playwright/` directory. Write one suite per screen per plan §6.7. Priority suites:
- `s5_mission_config.spec.ts` — full mission YAML generation flow.
- `s14_checklist.spec.ts` — all 24 steps progress gate.
- `s15_launch_control.spec.ts` — ARM → LAUNCH → ABORT flow.
- `s13_hardware_health.spec.ts` — Routing Manager open/save flow.

---

## Dependency Graph

```
Phase 0  ──────────────────────────────────────────> unblocks Phases 1–8
Phase 1 (libraries) ───────────────────────────────> unblocks Phases 2, 4
Phase 2 (data models) ─────────────────────────────> unblocks Phases 3, 4, 5
Phase 3 (backend services) ────────────────────────> unblocks Phase 5 live data
Phase 4 (missing screens S5b, S5c, S13a) ──────────> unblocks S5 links, S13 button
Phase 5 (screen completions) ──────────────────────> unblocks Phase 6 (guards have real data)
Phase 6 (security) ────────────────────────────────> unblocks Phase 7 (user identity for RTL pref)
Phase 7 (i18n) ────────────────────────────────────> unblocks Phase 8 string coverage
Phase 8 (testing) ─────────────────────────────────> Tier 1 + Tier 3 CI gate
```

---

## Summary Task Table

| # | Task | Phase | Priority | Owner | Files created / modified |
|---|------|-------|----------|-------|--------------------------|
| 0.1 | Fix `/settings` route | 0 | P0 | FE | `App.tsx`, `Layout.tsx` |
| 0.2 | Correct BA mock data | 0 | P0 | FE | `store/rocketSlice.ts` |
| 0.3 | Remove hardcoded password | 0 | P0 | FE | `S15_LaunchControl.tsx` |
| 0.4 | Add `operator` role | 0 | P0 | FE | `store/authSlice.ts` |
| 1.1 | Install prod libraries | 1 | P0 | FE | `package.json` |
| 1.2 | Install dev/test libraries | 1 | P1 | FE | `package.json` |
| 1.3 | shadcn/ui setup | 1 | P2 | FE | config files |
| 2.1 | Redesign `RocketTemplate` | 2 | P0 | FE | `store/rocketSlice.ts` |
| 2.2 | Redesign `TelemetryState` | 2 | P0 | FE | `store/telemetrySlice.ts` |
| 2.3 | Create `missionSlice` | 2 | P0 | FE | `store/missionSlice.ts` (new) |
| 2.4 | Create `hardwareSlice` | 2 | P0 | FE | `store/hardwareSlice.ts` (new) |
| 2.5 | Create `actuatorLibrarySlice` | 2 | P1 | FE | `store/actuatorLibrarySlice.ts` (new) |
| 2.6 | Create `controllerLibrarySlice` | 2 | P1 | FE | `store/controllerLibrarySlice.ts` (new) |
| 2.7 | Expand `systemSlice` | 2 | P0 | FE | `store/systemSlice.ts` |
| 2.8 | Register slices in `store.ts` | 2 | P0 | FE | `store/store.ts` |
| 3.1 | REST API client | 3 | P0 | FE/BE | `services/api.ts` (new) |
| 3.2 | Telemetry WebSocket service | 3 | P0 | FE | `services/telemetryWs.ts` (new) |
| 3.3 | Hardware WebSocket service | 3 | P0 | FE | `services/hardwareWs.ts` (new) |
| 3.4 | Simulation WebSocket service | 3 | P1 | FE | `services/simulationWs.ts` (new) |
| 4.1 | Build `S5b_ActuatorLibraryEditor` | 4 | P0 | FE | `S5b_ActuatorLibraryEditor.tsx` (new) |
| 4.2 | Build `S5c_ControllerLibraryEditor` | 4 | P0 | FE | `S5c_ControllerLibraryEditor.tsx` (new) |
| 4.3 | Build `S13a_RoutingManager` modal | 4 | P0 | FE | `S13a_RoutingManager.tsx` (new) |
| 5.1 | Complete S5 Mission Config | 5 | P0 | FE | `S5_MissionConfig.tsx` |
| 5.2 | Complete S4 Rocket Editor | 5 | P1 | FE | `S4_RocketEditor.tsx` |
| 5.3 | Complete S13 Hardware Health | 5 | P0 | FE | `S13_HardwareHealth.tsx` |
| 5.4 | Expand S14 to 24 steps | 5 | P0 | FE | `S14_PreLaunchChecklist.tsx` |
| 5.5 | Complete S15 Launch Control | 5 | P1 | FE | `S15_LaunchControl.tsx` |
| 5.6 | Complete S16 Flight Monitor | 5 | P0 | FE | `S16_LiveFlightMonitor.tsx` |
| 6.1 | Keycloak integration | 6 | P2 | FE/BE | `main.tsx`, `LoginScreen.tsx` |
| 6.2 | RBAC guards | 6 | P2 | FE | `utils/rbac.ts` (new) |
| 6.3 | Audit trail writes | 6 | P2 | FE | `store/systemSlice.ts`, API calls |
| 7.1 | i18n setup | 7 | P2 | FE | `i18n/index.ts` (new), locale files |
| 7.2 | Externalise all strings | 7 | P2 | FE | all screen `.tsx` files |
| 8.1 | Vitest unit tests | 8 | P1 | FE | `tests/unit/` (new) |
| 8.2 | Playwright E2E tests | 8 | P1 | FE/DO | `tests/playwright/` (new) |
