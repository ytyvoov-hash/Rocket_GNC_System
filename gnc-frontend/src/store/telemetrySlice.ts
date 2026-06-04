import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type FlightPhase = 'PRELAUNCH' | 'BOOST_S1' | 'COAST_S1' | 'SEP_1_to_2' | 'BOOST_S2' | 'COAST_S2' | 'TERMINAL';
export type GpsFixQuality = 'NO_FIX' | 'GPS' | 'SBAS' | 'RTK';
export type FlightPath = 'A' | 'B';

export interface StageTransition {
  time: number;
  from: number;
  to: number;
  trigger: string;
}

export interface MheStatus {
  converged: boolean;
  iterations: number;
  residual: number;
}

interface TelemetryState {
  time: number;
  altitude: number;
  velocity: number;
  mach: number;
  q: number;
  posX: number;
  posY: number;
  attitude: {
    pitch: number;
    yaw: number;
    roll: number;
  };
  actuators: Record<string, number>;
  phase: string;
  dynamicPhase: string | null;
  isSimRunning: boolean;

  path: FlightPath | null;
  currentStage: number;
  stageTransitionLog: StageTransition[];
  saturationBitmask: number;
  immProbabilities: number[];
  mheStatus: MheStatus | null;
  gpsFix: GpsFixQuality | null;
  gpsSatellites: number;
  canUtilisationPct: number;
  cpuTemp: number | null;
  cpuLoadPct: number | null;
  heapFreeKb: number | null;

  latitude?: number;
  longitude?: number;
}

const initialState: TelemetryState = {
  time: 0,
  altitude: 0,
  velocity: 0,
  mach: 0,
  q: 0,
  posX: 0,
  posY: 0,
  attitude: { pitch: 0, yaw: 0, roll: 0 },
  actuators: {},
  phase: 'PRELAUNCH',
  dynamicPhase: null,
  isSimRunning: false,
  path: null,
  currentStage: 0,
  stageTransitionLog: [],
  saturationBitmask: 0,
  immProbabilities: [],
  mheStatus: null,
  gpsFix: null,
  gpsSatellites: 0,
  canUtilisationPct: 0,
  cpuTemp: null,
  cpuLoadPct: null,
  heapFreeKb: null,
  latitude: undefined,
  longitude: undefined,
};

export const telemetrySlice = createSlice({
  name: 'telemetry',
  initialState,
  reducers: {
    updateTelemetry: (state, action: PayloadAction<Partial<TelemetryState>>) => {
      return { ...state, ...action.payload };
    },
    setSimRunning: (state, action: PayloadAction<boolean>) => {
      state.isSimRunning = action.payload;
    },
    setPhase: (state, action: PayloadAction<string>) => {
      state.dynamicPhase = action.payload;
    },
    resetTelemetry: () => {
      return { ...initialState };
    },
    pushStageTransition: (state, action: PayloadAction<StageTransition>) => {
      state.stageTransitionLog.push(action.payload);
      state.currentStage = action.payload.to;
    },
    setSaturationBitmask: (state, action: PayloadAction<number>) => {
      state.saturationBitmask = action.payload;
    },
    tickSimulation: (_state) => {
      console.warn('[telemetrySlice] tickSimulation is a no-op stub. Live telemetry comes from connectTelemetry() (services/telemetryWs.ts). Do not call this reducer in production.');
    },
  },
});

export const {
  updateTelemetry,
  setSimRunning,
  setPhase,
  resetTelemetry,
  pushStageTransition,
  setSaturationBitmask,
  tickSimulation,
} = telemetrySlice.actions;
export default telemetrySlice.reducer;
