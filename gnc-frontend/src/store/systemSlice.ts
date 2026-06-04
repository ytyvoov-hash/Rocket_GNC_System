import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type LaunchState = 'IDLE' | 'CHECKLIST' | 'ARMED' | 'COUNTDOWN' | 'LAUNCHED' | 'ABORTED';

export interface AuditEntry {
  ts: number;
  operator: string;
  action: string;
}

interface SystemState {
  hardwareKeyPresent: boolean;
  launchArmed: boolean;
  launchInitiated: boolean;
  checklistProgress: number;
  launchState: LaunchState;
  tMinusSeconds: number | null;
  abortReason: string | null;
  auditLog: AuditEntry[];
}

const initialState: SystemState = {
  hardwareKeyPresent: false,
  launchArmed: false,
  launchInitiated: false,
  checklistProgress: 2,
  launchState: 'IDLE',
  tMinusSeconds: null,
  abortReason: null,
  auditLog: [],
};

export const systemSlice = createSlice({
  name: 'system',
  initialState,
  reducers: {
    setHardwareKey: (state, action: PayloadAction<boolean>) => {
      state.hardwareKeyPresent = action.payload;
    },
    armLaunch: (state, action: PayloadAction<boolean>) => {
      state.launchArmed = action.payload;
      if (action.payload) {
        state.launchState = 'ARMED';
      }
    },
    initiateLaunch: (state) => {
      state.launchInitiated = true;
      state.launchState = 'LAUNCHED';
    },
    updateChecklist: (state, action: PayloadAction<number>) => {
      state.checklistProgress = action.payload;
      if (action.payload >= 24) {
        state.launchState = 'CHECKLIST';
      }
    },
    setLaunchState: (state, action: PayloadAction<LaunchState>) => {
      state.launchState = action.payload;
    },
    setTMinus: (state, action: PayloadAction<number | null>) => {
      state.tMinusSeconds = action.payload;
      if (action.payload !== null && action.payload > 0) {
        state.launchState = 'COUNTDOWN';
      }
    },
    abort: (state, action: PayloadAction<string>) => {
      state.launchState = 'ABORTED';
      state.abortReason = action.payload;
      state.launchArmed = false;
    },
    writeAudit: (state, action: PayloadAction<AuditEntry>) => {
      state.auditLog.push(action.payload);
    },
    resetSystem: () => {
      return { ...initialState };
    },
  },
});

export const {
  setHardwareKey,
  armLaunch,
  initiateLaunch,
  updateChecklist,
  setLaunchState,
  setTMinus,
  abort,
  writeAudit,
  resetSystem,
} = systemSlice.actions;
export default systemSlice.reducer;
