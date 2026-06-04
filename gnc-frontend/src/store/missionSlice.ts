import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AutopilotMode } from './rocketSlice';

// === Types ===

export type EstimatorApproach = 'single_filter' | 'sequential' | 'imm';
export type FilterType = 'eskf' | 'ukf' | 'ekf';
export type MheSolverBackend = 'acados' | 'casadi' | 'lm';
export type FlightComputerPath = 'A' | 'B';
export type LoggingProfile = 'FULL' | 'FLIGHT' | 'MINIMAL';
export type SeekerMode = 'strapdown' | 'gimbaled';
export type LossOfLockPolicy = 'revert_trajectory' | 'continue_PN' | 'abort' | 'operator_prompt';
export type PnVariant = 'pure' | 'true' | 'augmented';
export type InferenceTarget = 'gpu' | 'cpu' | 'hexagon';
export type LosRateMethod = 'savitzky_golay' | 'first_order' | 'state_observer';
export type MountIsolation = 'rigid' | 'rubber' | 'gel' | 'gimbal_2axis';
export type MheOverrunMode = 'skip' | 'reduce_horizon' | 'reduce_trust';
export type SafetyZoneType = 'polygon' | 'circle' | 'vlos_or_tethered';
export type FixQualityRequired = 'RTK_OR_SBAS' | 'RTK' | 'SBAS' | 'GPS' | 'ANY';
export type SaturationAbortMode = 'cruise_percent' | 'continuous_block' | 'both';
export type ControlAllocationType = 'pseudo_inverse' | 'daisy_chain' | 'optimization' | 'direct';

// === Launch & Target Config ===

export interface InitialConditionsConfig {
  position: [number, number, number];
  velocity: [number, number, number];
  attitude: [number, number, number, number];
  attitude_degrees: [number, number, number];
}

export interface LaunchConfig {
  latitude: number;
  longitude: number;
  altitude: number;
}

export interface TargetConfig {
  range_m: number;
  bearing_deg: number;
  altitude: number;
}

// === Profiles Config ===

export interface EstimatorProfile {
  id: string;
  name: string;
  approach: EstimatorApproach;
  filter_type: FilterType;
}

export interface ControllerProfile {
  id: string;
  name: string;
  solver: 'pid' | 'lqr' | 'acados' | 'casadi';
  control_allocation: ControlAllocationType;
}

// === Flight Phase Config ===

export interface PhaseTrigger {
  type: 'simple' | 'complex';
  simple_var?: 'altitude' | 'time' | 'mach' | 'q' | 'accel';
  simple_op?: '>' | '<' | '==';
  simple_val?: number;
  complex_expr?: string;
}

export interface FlightPhase {
  phase_id: string;
  name: string;
  trigger: PhaseTrigger;
  guidance_mode: AutopilotMode;
  controller_profile_id: string | null;
  estimator_profile_id: string | null;
  abort_policy: {
    alpha_max_deg: number;
    rate_max_deg_s: number;
    estimator_divergence: number;
    link_loss_timeout_s: number;
    recurring_saturation: {
      enabled: boolean;
      mode: SaturationAbortMode;
      cruise_percent_threshold: number;
      continuous_block_ms: number;
    };
  };
}

// === Seeker Config ===

export interface SeekerConfig {
  enabled: boolean;
  mode: SeekerMode;
  target_class: string;
  loss_of_lock_policy: LossOfLockPolicy;
  camera_id: string;
  fov_deg: [number, number];
  mount_isolation: MountIsolation;
  los_rate_method: LosRateMethod;
  pn_variant: PnVariant;
  pn_gain_N: number;
  inference_target: InferenceTarget;
}

// === Optional Devices ===

export interface OptionalDevices {
  gps: {
    present: boolean;
    sensor_id: string;
    fix_quality_required: FixQualityRequired;
  };
  radio: {
    present: boolean;
    band: string;
    tx_power_dbm: number;
  };
  warhead_fuse: boolean;
  engine_starter_1: boolean;
  engine_starter_2: boolean;
  separating_nail_1: boolean;
  separating_nail_2: boolean;
  jamble: boolean;
  external_imu: {
    present: boolean;
  };
  flight_termination_system: {
    present: boolean;
  };
}

// === Safety Zone ===

export interface SafetyZone {
  type: SafetyZoneType;
  vertices?: [number, number][];
  center?: [number, number];
  radius_m?: number;
  abort_on_breach: boolean;
}

// === State ===

interface MissionState {
  missionId: string | null;
  rocketId: string | null;
  path: FlightComputerPath;
  loop_rate_hz: number;
  locked: boolean;
  target_ground_range_m: number;
  cep_target_m: number;
  guidance_reference_pitch_deg: number;
  initial_conditions: InitialConditionsConfig;
  launch: LaunchConfig;
  target: TargetConfig;
  phases: FlightPhase[];
  estimator_profiles: EstimatorProfile[];
  controller_profiles: ControllerProfile[];
  mhe: {
    enabled: boolean;
    horizon: number;
    rate_hz: number;
    budget_overrun_mode: MheOverrunMode;
    backend: MheSolverBackend;
  };
  seeker: SeekerConfig;
  optional_devices: OptionalDevices;
  logging_profile: LoggingProfile;
  logging_completeness_target: number;
  safety_zone: SafetyZone;
  validation: {
    status: 'not_run' | 'valid' | 'invalid';
    errors: string[];
  };
  yamlOutput: string | null;
}

const initialState: MissionState = {
  missionId: null,
  rocketId: 'BA',
  path: 'A',
  loop_rate_hz: 100,
  locked: false,
  target_ground_range_m: 50000,
  cep_target_m: 10,
  guidance_reference_pitch_deg: 45,
  initial_conditions: {
    position: [0.0, 0.0, 0.0],
    velocity: [0.0, 0.0, 0.0],
    attitude: [1.0, 0.0, 0.0, 0.0],
    attitude_degrees: [0, 90, 0]
  },
  launch: {
    latitude: 16.457472,
    longitude: 44.115361,
    altitude: 1200
  },
  target: {
    range_m: 100000,
    bearing_deg: 0,
    altitude: 1180
  },
  phases: [{
    phase_id: 'phase_1',
    name: 'Boost Phase',
    trigger: {
      type: 'simple',
      simple_var: 'time',
      simple_op: '>',
      simple_val: 0
    },
    guidance_mode: 'auto_shape',
    controller_profile_id: null,
    estimator_profile_id: null,
    abort_policy: {
      alpha_max_deg: 25,
      rate_max_deg_s: 1000,
      estimator_divergence: 100,
      link_loss_timeout_s: 5,
      recurring_saturation: {
        enabled: true,
        mode: 'both',
        cruise_percent_threshold: 80,
        continuous_block_ms: 500
      }
    }
  }],
  estimator_profiles: [
    { id: 'est_boost', name: 'High-Vibration ESKF (Low IMU Trust)', approach: 'single_filter', filter_type: 'eskf' },
    { id: 'est_coast', name: 'Smooth Flight ESKF (High IMU Trust)', approach: 'single_filter', filter_type: 'eskf' },
    { id: 'est_terminal', name: 'Default ESKF', approach: 'single_filter', filter_type: 'eskf' },
  ],
  controller_profiles: [
    {
      id: 'cp_1',
      name: 'Boost PID',
      solver: 'pid',
      control_allocation: 'pseudo_inverse'
    },
    { id: 'prof_coast_lqr', name: 'Coast Phase LQR', solver: 'lqr', control_allocation: 'pseudo_inverse' },
    { id: 'prof_acados_mpc', name: 'Exo-atmospheric ACADOS MPC', solver: 'acados', control_allocation: 'optimization' },
  ],
  mhe: {
    enabled: false,
    horizon: 10,
    rate_hz: 10,
    budget_overrun_mode: 'skip',
    backend: 'acados',
  },
  seeker: {
    enabled: false,
    mode: 'strapdown',
    target_class: 'vehicle',
    loss_of_lock_policy: 'revert_trajectory',
    camera_id: 'builtin',
    fov_deg: [45.0, 30.0],
    mount_isolation: 'rigid',
    los_rate_method: 'savitzky_golay',
    pn_variant: 'true',
    pn_gain_N: 4.0,
    inference_target: 'gpu',
  },
  optional_devices: {
    gps: { present: true, sensor_id: 'u-blox-ZED-F9P', fix_quality_required: 'RTK_OR_SBAS' },
    radio: { present: true, band: 'LoRa-418MHz', tx_power_dbm: 14 },
    warhead_fuse: false,
    engine_starter_1: false,
    engine_starter_2: false,
    separating_nail_1: false,
    separating_nail_2: false,
    jamble: false,
    external_imu: { present: false },
    flight_termination_system: { present: false },
  },
  logging_profile: 'FULL',
  logging_completeness_target: 1.0,
  safety_zone: {
    type: 'polygon',
    vertices: [[16.450, 44.110], [16.460, 44.115], [17.580, 44.120]],
    abort_on_breach: true,
  },
  validation: { status: 'not_run', errors: [] },
  yamlOutput: null,
};

// === Slice ===

export const missionSlice = createSlice({
  name: 'mission',
  initialState,
  reducers: {
    setMissionField: (state, action: PayloadAction<Partial<MissionState>>) => {
      Object.assign(state, action.payload);
    },
    setPath: (state, action: PayloadAction<FlightComputerPath>) => {
      state.path = action.payload;
      state.loop_rate_hz = action.payload === 'A' ? 100 : 200;
    },
    addPhase: (state, action: PayloadAction<FlightPhase>) => {
      state.phases.push(action.payload);
    },
    removePhase: (state, action: PayloadAction<string>) => {
      state.phases = state.phases.filter(p => p.phase_id !== action.payload);
    },
    updatePhase: (state, action: PayloadAction<{ phase_id: string; updates: Partial<FlightPhase> }>) => {
      const { phase_id, updates } = action.payload;
      const phase = state.phases.find(p => p.phase_id === phase_id);
      if (phase) {
        Object.assign(phase, updates);
      }
    },
    addEstimatorProfile: (state, action: PayloadAction<EstimatorProfile>) => {
      state.estimator_profiles.push(action.payload);
    },
    removeEstimatorProfile: (state, action: PayloadAction<string>) => {
      state.estimator_profiles = state.estimator_profiles.filter(p => p.id !== action.payload);
    },
    updateEstimatorProfile: (state, action: PayloadAction<{ id: string; updates: Partial<EstimatorProfile> }>) => {
      const { id, updates } = action.payload;
      const profile = state.estimator_profiles.find(p => p.id === id);
      if (profile) Object.assign(profile, updates);
    },
    addControllerProfile: (state, action: PayloadAction<ControllerProfile>) => {
      state.controller_profiles.push(action.payload);
    },
    removeControllerProfile: (state, action: PayloadAction<string>) => {
      state.controller_profiles = state.controller_profiles.filter(p => p.id !== action.payload);
    },
    updateControllerProfile: (state, action: PayloadAction<{ id: string; updates: Partial<ControllerProfile> }>) => {
      const { id, updates } = action.payload;
      const profile = state.controller_profiles.find(p => p.id === id);
      if (profile) Object.assign(profile, updates);
    },
    lockMission: (state) => {
      state.locked = true;
    },
    unlockMission: (state) => {
      state.locked = false;
    },
    setValidation: (state, action: PayloadAction<{ status: 'valid' | 'invalid'; errors: string[] }>) => {
      state.validation = action.payload;
    },
    setYamlOutput(state, action: PayloadAction<string>) {
      state.yamlOutput = action.payload;
    },
    setInitialConditions(state, action: PayloadAction<Partial<InitialConditionsConfig>>) {
      state.initial_conditions = { ...state.initial_conditions, ...action.payload };
    },
    setLaunchConfig(state, action: PayloadAction<Partial<LaunchConfig>>) {
      state.launch = { ...state.launch, ...action.payload };
    },
    setTargetConfig(state, action: PayloadAction<Partial<TargetConfig>>) {
      state.target = { ...state.target, ...action.payload };
    },
    resetMission(state) {
      return initialState;
    },
  },
});

export const {
  setMissionField,
  setPath,
  addPhase,
  removePhase,
  updatePhase,
  lockMission,
  unlockMission,
  setValidation,
  setYamlOutput,
  setInitialConditions,
  setLaunchConfig,
  setTargetConfig,
  resetMission,
  addEstimatorProfile,
  removeEstimatorProfile,
  updateEstimatorProfile,
  addControllerProfile,
  removeControllerProfile,
  updateControllerProfile,
} = missionSlice.actions;
export default missionSlice.reducer;
