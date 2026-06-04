import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface GuidanceEntry {
  id: string;
  name: string;
  algorithm: 'APEX' | 'PEG' | 'ZEM';
  update_rate_hz: number;
  energy_management: boolean;
  waypoint_tolerance_m: number;
}

interface GuidanceLibraryState {
  entries: Record<string, GuidanceEntry>;
}

const initialState: GuidanceLibraryState = {
  entries: {
    'default_apex': {
      id: 'default_apex',
      name: 'Baseline APEX',
      algorithm: 'APEX',
      update_rate_hz: 50,
      energy_management: true,
      waypoint_tolerance_m: 100,
    },
    'default_peg': {
      id: 'default_peg',
      name: 'PEG Ascent',
      algorithm: 'PEG',
      update_rate_hz: 100,
      energy_management: false,
      waypoint_tolerance_m: 50,
    }
  }
};

const guidanceLibrarySlice = createSlice({
  name: 'guidanceLibrary',
  initialState,
  reducers: {
    setGuidanceLibrary(state, action: PayloadAction<Record<string, GuidanceEntry>>) {
      state.entries = action.payload;
    },
    addGuidanceEntry(state, action: PayloadAction<GuidanceEntry>) {
      state.entries[action.payload.id] = action.payload;
    },
    updateGuidanceEntry(state, action: PayloadAction<{ id: string; patch: Partial<GuidanceEntry> }>) {
      if (state.entries[action.payload.id]) {
        state.entries[action.payload.id] = { ...state.entries[action.payload.id], ...action.payload.patch };
      }
    },
    removeGuidanceEntry(state, action: PayloadAction<string>) {
      delete state.entries[action.payload];
    }
  }
});

export const { setGuidanceLibrary, addGuidanceEntry, updateGuidanceEntry, removeGuidanceEntry } = guidanceLibrarySlice.actions;
export default guidanceLibrarySlice.reducer;
