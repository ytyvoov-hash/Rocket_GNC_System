import type { store } from '../store/store';
import {
  updateTelemetry,
  pushStageTransition,
  setSaturationBitmask,
  type FlightPhase,
  type GpsFixQuality,
  type MheStatus,
} from '../store/telemetrySlice';

type AppStore = typeof store;

const MISPLOT_FRAME_LEN = 77;
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentDelay = RECONNECT_DELAY_MS;
let storeRef: AppStore | null = null;

function parseMisPlot(buffer: ArrayBuffer): Partial<ReturnType<typeof store.getState>['telemetry']> {
  const view = new DataView(buffer);
  if (view.byteLength < MISPLOT_FRAME_LEN) return {};

  const time = view.getFloat32(0, true);
  const altitude = view.getFloat32(4, true);
  const velocity = view.getFloat32(8, true);
  const mach = view.getFloat32(12, true);
  const q = view.getFloat32(16, true);
  const pitch = view.getFloat32(20, true);
  const yaw = view.getFloat32(24, true);
  const roll = view.getFloat32(28, true);

  const phaseCode = view.getUint8(32);
  const phaseMap: Record<number, FlightPhase> = {
    0: 'PRELAUNCH', 1: 'BOOST_S1', 2: 'COAST_S1',
    3: 'SEP_1_to_2', 4: 'BOOST_S2', 5: 'COAST_S2', 6: 'TERMINAL',
  };
  const phase: FlightPhase = phaseMap[phaseCode] ?? 'PRELAUNCH';

  const currentStage = view.getUint8(33);
  const saturationBitmask = view.getUint16(34, true);

  const actuators: Record<string, number> = {};
  for (let i = 0; i < 12; i++) {
    const val = view.getInt16(36 + i * 2, true);
    if (val !== -32768) {
      actuators[String(i)] = val / 100;
    }
  }

  const gpsFixCode = view.getUint8(60);
  const gpsFixMap: Record<number, GpsFixQuality> = { 0: 'NO_FIX', 1: 'GPS', 2: 'SBAS', 3: 'RTK' };
  const gpsFix: GpsFixQuality = gpsFixMap[gpsFixCode] ?? 'NO_FIX';
  const gpsSatellites = view.getUint8(61);

  const cpuTemp = view.getInt16(62, true) / 10;
  const cpuLoadPct = view.getUint8(64);
  const heapFreeKb = view.getUint16(65, true);
  const canUtilisationPct = view.getUint8(67);

  const immCount = view.getUint8(68);
  const immProbabilities: number[] = [];
  for (let i = 0; i < Math.min(immCount, 5); i++) {
    immProbabilities.push(view.getFloat32(69 + i * 4, true));
  }

  const mheStatus: MheStatus | null = view.getUint8(73) !== 0
    ? { converged: view.getUint8(73) === 1, iterations: view.getUint8(74), residual: view.getFloat32(75, true) }
    : null;

  return {
    time, altitude, velocity, mach, q,
    attitude: { pitch, yaw, roll },
    actuators, phase, currentStage, saturationBitmask,
    gpsFix, gpsSatellites, cpuTemp, cpuLoadPct, heapFreeKb,
    canUtilisationPct, immProbabilities, mheStatus,
  };
}

function scheduleReconnect(url: string) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    currentDelay = Math.min(currentDelay * 1.5, MAX_RECONNECT_DELAY_MS);
    connectTelemetry(url);
  }, currentDelay);
}

export function connectTelemetry(url: string, storeInstance: AppStore = storeRef!) {
  storeRef = storeInstance;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    currentDelay = RECONNECT_DELAY_MS;
  };

  ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    const patch = parseMisPlot(event.data);
    if (storeRef) {
      storeRef.dispatch(updateTelemetry(patch));
      if (patch.saturationBitmask !== undefined) {
        storeRef.dispatch(setSaturationBitmask(patch.saturationBitmask));
      }
    }
  };

  ws.onclose = () => {
    scheduleReconnect(url);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function disconnectTelemetry() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  currentDelay = RECONNECT_DELAY_MS;
}

export function sendStageTransition(transition: { time: number; from: number; to: number; trigger: string }) {
  if (storeRef) {
    storeRef.dispatch(pushStageTransition(transition));
  }
}
