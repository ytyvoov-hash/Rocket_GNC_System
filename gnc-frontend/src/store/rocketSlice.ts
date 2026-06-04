import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// === Shared Enums ===

export type AutopilotMode = 'auto_shape' | 'fixed_pitch' | 'passive_ballistic' | 'waypoint' | 'terminal_homing';
export type ControllerType = 'fins' | 'tvc' | 'hybrid' | 'cold_gas' | 'aerospike' | 'roll_canards' | 'none';
export type SeparationTrigger = 'burnout' | 'time' | 'altitude' | 'velocity' | 'event';
export type TemplateStatus = 'flight-ready' | 'draft' | 'archived';
export type ValidationVerdict = 'PASS' | 'WARN' | 'FAIL';

// === Physical Properties (per stage) ===

export interface PhysicalProps {
  mass_dry_kg: number;
  propellant_mass_kg: number;
  insulation_mass_kg: number;
  cg_dry_body_m: [number, number, number];
  cg_full_body_m: [number, number, number];
  inertia_dry_kgm2: [number, number, number];
  inertia_full_kgm2: [number, number, number];
}

// === Geometry (per stage) ===

export interface GeometryProps {
  ref_diameter_m: number;
  ref_length_m: number;
  ref_area_m2: number;
}

// === Fin Configuration ===

export interface FinSet {
  set_index: number;
  fin_count: number;
  S_fin_m2: number;
  c_fin_m: number;
  x_fin_m: number;
  delta_max_deg: number;
  delta_dot_max_deg_s: number;
  actuator_ref: string;
  config_type: 'X' | 'plus';
}

// === Separation Block (non-terminal stages) ===

export interface SeparationBlock {
  trigger: SeparationTrigger;
  offset_s: number;
  timeout_s: number;
  arming_s: number;
  nail_count: number;
  nail_pyro_events: string[];
}

// === Stage Template ===

export interface StageTemplate {
  stage_id: string;
  name: string;
  stage_index: number;
  is_terminal: boolean;
  has_warhead: boolean;
  physical: PhysicalProps;
  geometry: GeometryProps;
  controller_type: ControllerType;
  controller_ref: string;
  seeker_capable: boolean;
  autopilot: {
    enabled: boolean;
    capable_modes: AutopilotMode[];
  };
  fin_config?: {
    sets: FinSet[];
  };
  separation?: SeparationBlock;
  propulsion?: {
    thrust_curve_file: string;
    total_impulse_Ns: number;
    burn_time_s: number;
    thrust_multiplier: number;
    nozzle_exit_area_m2: number;
    sea_level_pressure_Pa: number;
  };
}

// === Validation Clause Result ===

export interface ValidationClause {
  clause: string;
  verdict: ValidationVerdict;
  message?: string;
}

export interface ValidationReport {
  clauses: ValidationClause[];
  overall: ValidationVerdict;
  run_at: string | null;
}

// === Rocket Template (top-level) ===

export interface RocketTemplate {
  id: string;
  display_name: string;
  type: string;
  status: TemplateStatus;
  num_stages: number;
  stages: StageTemplate[];
  hardware_mapping_file: string;
  cad_model?: string;
  validation?: ValidationReport;

  // Flat convenience fields (aggregated from stage 0 for backward compat)
  name: string;
  mass: number;
  length: number;
  diameter: number;
  cgPosition: number;
  cpPosition: number;
}

// === Helpers ===

function buildFlatFields(stages: StageTemplate[]): Pick<RocketTemplate, 'mass' | 'length' | 'diameter' | 'cgPosition' | 'cpPosition'> {
  const s0 = stages[0];
  if (!s0) {
    return { mass: 0, length: 0, diameter: 0, cgPosition: 0, cpPosition: 0 };
  }
  const totalMass = stages.reduce((sum, s) => sum + s.physical.mass_dry_kg + s.physical.propellant_mass_kg, 0);
  return {
    mass: totalMass,
    length: s0.geometry.ref_length_m,
    diameter: s0.geometry.ref_diameter_m,
    cgPosition: s0.physical.cg_dry_body_m[0],
    cpPosition: s0.physical.cg_dry_body_m[0] + 0.22,
  };
}

// === State ===

interface RocketState {
  activeRocket: RocketTemplate | null;
  library: RocketTemplate[];
}

// === BA Stage 1 (plan §2.2 + Reference-data/rocket_properties.yaml) ===

const BA_STAGE_1: StageTemplate = {
  stage_id: 'BA_S1',
  name: 'Stage 1',
  stage_index: 0,
  is_terminal: true,
  has_warhead: false,
  physical: {
    mass_dry_kg: 281.89,
    propellant_mass_kg: 285.0,
    insulation_mass_kg: 2,
    cg_dry_body_m: [2.485, 0.0, 0.0],
    cg_full_body_m: [2.905, 0.0, 0.0],
    inertia_dry_kgm2: [4.04, 936.08, 936.08],
    inertia_full_kgm2: [6.77, 1290.08, 1290.08],
  },
  geometry: {
    ref_diameter_m: 0.273,
    ref_length_m: 5.45,
    ref_area_m2: 0.05853,
  },
  controller_type: 'fins',
  controller_ref: 'pid_fins_baseline',
  seeker_capable: false,
  autopilot: {
    enabled: true,
    capable_modes: ['auto_shape', 'fixed_pitch', 'passive_ballistic'],
  },
  fin_config: {
    sets: [{
      set_index: 0,
      fin_count: 4,
      S_fin_m2: 0.02273726,
      c_fin_m: 0.150,
      x_fin_m: 1.106,
      delta_max_deg: 20.0,
      delta_dot_max_deg_s: 300.0,
      actuator_ref: 'default_4020',
      config_type: 'X',
    }],
  },
  propulsion: {
    thrust_curve_file: 'thrust_curve.csv',
    total_impulse_Ns: 692734.07,
    burn_time_s: 13.1,
    thrust_multiplier: 1.0,
    nozzle_exit_area_m2: 0.05557,
    sea_level_pressure_Pa: 101325,
  },
};

function makeRocket(id: string, display_name: string, type: string, status: TemplateStatus, stages: StageTemplate[], hwFile: string): RocketTemplate {
  return {
    id,
    display_name,
    type,
    status,
    num_stages: stages.length,
    stages,
    hardware_mapping_file: hwFile,
    name: display_name,
    ...buildFlatFields(stages),
  };
}

const initialState: RocketState = {
  activeRocket: makeRocket('BA', 'BA Reference Rocket', 'Canard-Controlled Single-Stage', 'flight-ready', [BA_STAGE_1], 'hardware_mapping.yaml'),
  library: [
    makeRocket('BA', 'BA Reference Rocket', 'Canard-Controlled Single-Stage', 'flight-ready', [BA_STAGE_1], 'hardware_mapping.yaml'),
    makeRocket('GH', 'GH Two-Stage', 'Two-Stage / 8-Fin / Mach 15', 'draft', [], 'hardware_mapping_GH.yaml'),
    makeRocket('SA', 'SA Multi-Stage', 'Two-Stage / Unpowered Coast Stage 2', 'draft', [], 'hardware_mapping_SA.yaml'),
  ],
};

// === Slice ===

export const rocketSlice = createSlice({
  name: 'rocket',
  initialState,
  reducers: {
    syncLibrary: (state, action: PayloadAction<RocketTemplate[]>) => {
      state.library = action.payload;
      if (state.activeRocket) {
        const syncedActive = action.payload.find(r => r.id === state.activeRocket!.id);
        if (syncedActive) {
          state.activeRocket = syncedActive;
        } else {
          state.activeRocket = null;
        }
      }
    },
    setActiveRocket: (state, action: PayloadAction<string>) => {
      const rocket = state.library.find(r => r.id === action.payload);
      if (rocket) {
        state.activeRocket = rocket;
      }
    },
    updateActiveRocketParams: (state, action: PayloadAction<Partial<RocketTemplate>>) => {
      if (state.activeRocket) {
        state.activeRocket = { ...state.activeRocket, ...action.payload };
        const index = state.library.findIndex(r => r.id === state.activeRocket!.id);
        if (index !== -1) {
          state.library[index] = state.activeRocket;
        }
      }
    },
    updateStage: (state, action: PayloadAction<{ stageIndex: number; patch: Partial<StageTemplate> }>) => {
      if (state.activeRocket) {
        const { stageIndex, patch } = action.payload;
        if (state.activeRocket.stages[stageIndex]) {
          state.activeRocket.stages[stageIndex] = { ...state.activeRocket.stages[stageIndex], ...patch };
          const flat = buildFlatFields(state.activeRocket.stages);
          Object.assign(state.activeRocket, flat);
        }
      }
    },
    setValidationReport: (state, action: PayloadAction<ValidationReport>) => {
      if (state.activeRocket) {
        state.activeRocket.validation = action.payload;
      }
    },
    addRocketToLibrary: (state, action: PayloadAction<RocketTemplate>) => {
      state.library.push(action.payload);
    },
    removeRocketFromLibrary: (state, action: PayloadAction<string>) => {
      state.library = state.library.filter(r => r.id !== action.payload);
      if (state.activeRocket?.id === action.payload) {
        state.activeRocket = null;
      }
    },
  },
});

export const {
  syncLibrary,
  setActiveRocket,
  updateActiveRocketParams,
  updateStage,
  setValidationReport,
  addRocketToLibrary,
  removeRocketFromLibrary,
} = rocketSlice.actions;
export default rocketSlice.reducer;
