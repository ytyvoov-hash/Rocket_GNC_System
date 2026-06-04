import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface EstimatorEntry {
  id: string;
  name: string;
  approach: 'single_filter' | 'sequential' | 'imm';
  primary_filter: 'eskf' | 'ukf' | 'ekf';
  process_noise_q: number;
  measurement_noise_r: number;
  mhe_horizon?: number;
  mhe_solver?: 'acados' | 'casadi' | 'lm';
}

interface EstimatorLibraryState {
  entries: Record<string, EstimatorEntry>;
}

const initialState: EstimatorLibraryState = {
  entries: {
    'default_eskf': {
      id: 'default_eskf',
      name: 'Baseline ESKF',
      approach: 'single_filter',
      primary_filter: 'eskf',
      process_noise_q: 0.1,
      measurement_noise_r: 0.05,
    },
    'imm_high_maneuver': {
      id: 'imm_high_maneuver',
      name: 'IMM High-G',
      approach: 'imm',
      primary_filter: 'ukf',
      process_noise_q: 1.0,
      measurement_noise_r: 0.1,
    }
  }
};

const estimatorLibrarySlice = createSlice({
  name: 'estimatorLibrary',
  initialState,
  reducers: {
    setEstimatorLibrary(state, action: PayloadAction<Record<string, EstimatorEntry>>) {
      state.entries = action.payload;
    },
    addEstimatorEntry(state, action: PayloadAction<EstimatorEntry>) {
      state.entries[action.payload.id] = action.payload;
    },
    updateEstimatorEntry(state, action: PayloadAction<{ id: string; patch: Partial<EstimatorEntry> }>) {
      if (state.entries[action.payload.id]) {
        state.entries[action.payload.id] = { ...state.entries[action.payload.id], ...action.payload.patch };
      }
    },
    removeEstimatorEntry(state, action: PayloadAction<string>) {
      delete state.entries[action.payload];
    }
  }
});

export const { setEstimatorLibrary, addEstimatorEntry, updateEstimatorEntry, removeEstimatorEntry } = estimatorLibrarySlice.actions;
export default estimatorLibrarySlice.reducer;
