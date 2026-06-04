import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ControllerModelType = 'pid' | 'lqr' | 'acados' | 'casadi';

export interface GainSet {
  id: string;
  name: string;
  algorithm: string;
  controller_type: string;
  type: ControllerModelType;
  description: string;
  gains: Record<string, number | number[]>;
}

export type ControllerEntry = GainSet;

interface ControllerLibraryState {
  entries: Record<string, ControllerEntry>;
  loading: boolean;
  error: string | null;
}

const initialState: ControllerLibraryState = {
  entries: {
    'ctrl_pid_base': { id: 'ctrl_pid_base', name: 'Base PID Controller', algorithm: 'PID', controller_type: 'pid', type: 'pid', description: 'Standard PID for low-speed', gains: { kp: 1.5, ki: 0.1, kd: 0.5 } },
    'ctrl_lqr_coast': { id: 'ctrl_lqr_coast', name: 'Coast Phase LQR', algorithm: 'LQR', controller_type: 'lqr', type: 'lqr', description: 'Optimal LQR for exo-atmospheric flight', gains: { q_diag: [10, 10, 10], r_diag: [1, 1, 1] } },
  },
  loading: false,
  error: null,
};

export const controllerLibrarySlice = createSlice({
  name: 'controllerLibrary',
  initialState,
  reducers: {
    setLibrary: (state, action: PayloadAction<Record<string, ControllerEntry>>) => {
      state.entries = action.payload;
    },
    addControllerEntry: (state, action: PayloadAction<ControllerEntry>) => {
      state.entries[action.payload.id] = action.payload;
    },
    updateControllerEntry: (state, action: PayloadAction<{ id: string; updates: Partial<ControllerEntry> }>) => {
      if (state.entries[action.payload.id]) {
        state.entries[action.payload.id] = { ...state.entries[action.payload.id], ...action.payload.updates };
      }
    },
    removeControllerEntry: (state, action: PayloadAction<string>) => {
      delete state.entries[action.payload];
    },
  },
});

export const { setLibrary, addControllerEntry, updateControllerEntry, removeControllerEntry } = controllerLibrarySlice.actions;
export default controllerLibrarySlice.reducer;
