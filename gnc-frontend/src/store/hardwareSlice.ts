import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { FlightPath } from './telemetrySlice';

// === Types ===

export type PortStatus = 'OK' | 'WARN' | 'ERROR' | 'OFFLINE';

// Roles the backend may report. `UNKNOWN` is the sentinel returned when
// a USB device's VID:PID is not in `schemas/android_usb_roles.schema.yaml`.
// The Routing Manager UI lets the operator pick a real role for those.
export type UsbDeviceRole =
  | 'GPS_TLM_PL2303'
  | 'RUDDER_CP2102'
  | 'CAN_CH340'
  | 'SEEK_CARTRACK'
  | 'EXT_IMU'
  | 'UNKNOWN';

export interface HardwarePort {
  name: string;
  dev: string;
  vid: string;
  pid: string;
  suggestedRole: UsbDeviceRole;
  assignedRole: UsbDeviceRole;
  rxBps: number;
  txBps: number;
  status: PortStatus;
}

export interface DeviceAssignment {
  vidPid: string;
  role: UsbDeviceRole;
  operatorId: string;
  reason: string;
  timestamp: string;
}

interface HardwareState {
  path: FlightPath | null;
  ports: HardwarePort[];
  lastRescan: number | null;
  cpuTemp: number | null;
  cpuLoadPct: number | null;
  heapFreeKb: number | null;
  canUtilPct: number | null;
  routingManagerOpen: boolean;
  deviceAssignments: DeviceAssignment[];
  yamlPatchPending: boolean;
}

const initialState: HardwareState = {
  path: null,
  ports: [],
  lastRescan: null,
  cpuTemp: null,
  cpuLoadPct: null,
  heapFreeKb: null,
  canUtilPct: null,
  routingManagerOpen: false,
  deviceAssignments: [],
  yamlPatchPending: false,
};

// === Slice ===

export const hardwareSlice = createSlice({
  name: 'hardware',
  initialState,
  reducers: {
    updatePorts: (state, action: PayloadAction<HardwarePort[]>) => {
      state.ports = action.payload;
      state.lastRescan = Date.now();
    },
    setRoutingManagerOpen: (state, action: PayloadAction<boolean>) => {
      state.routingManagerOpen = action.payload;
    },
    saveDeviceAssignments: (state, action: PayloadAction<DeviceAssignment[]>) => {
      state.deviceAssignments = action.payload;
      state.yamlPatchPending = true;
    },
    clearYamlPatchPending: (state) => {
      state.yamlPatchPending = false;
    },
    triggerRescan: (state) => {
      // Clears the timestamp so the FE can show "scanning…" while the
      // backend processes the rescan request. setLastRescan resets it
      // when the rescan_ack frame arrives.
      state.lastRescan = null;
    },
    setLastRescan: (state, action: PayloadAction<number>) => {
      state.lastRescan = action.payload;
    },
    setPath: (state, action: PayloadAction<FlightPath>) => {
      state.path = action.payload;
    },
    updateCpuInfo: (state, action: PayloadAction<{ temp: number | null; loadPct: number | null; heapFreeKb: number | null }>) => {
      state.cpuTemp = action.payload.temp;
      state.cpuLoadPct = action.payload.loadPct;
      state.heapFreeKb = action.payload.heapFreeKb;
    },
    setCanUtilisation: (state, action: PayloadAction<number>) => {
      state.canUtilPct = action.payload;
    },
  },
});

export const {
  updatePorts,
  setRoutingManagerOpen,
  saveDeviceAssignments,
  clearYamlPatchPending,
  triggerRescan,
  setLastRescan,
  setPath,
  updateCpuInfo,
  setCanUtilisation,
} = hardwareSlice.actions;
export default hardwareSlice.reducer;
