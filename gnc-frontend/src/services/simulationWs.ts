import type { store } from '../store/store';
import { updateTelemetry, setSimRunning, resetTelemetry, setPhase } from '../store/telemetrySlice';

type AppStore = typeof store;

let ws: WebSocket | null = null;
let storeRef: AppStore | null = null;

interface SimFrame {
  time: number;
  altitude: number;
  velocity: number;
  mach: number;
  q: number;
  pitch: number;
  yaw: number;
  roll: number;
  posX: number;
  posY: number;
  phase: string;
  currentStage: number;
  actuators: Record<string, number>;
  saturationBitmask: number;
  latitude?: number;
  longitude?: number;
}

export type FrameCallback = (frame: SimFrame) => void;
const listeners: FrameCallback[] = [];

export function onSimFrame(cb: FrameCallback) {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx > -1) listeners.splice(idx, 1);
  };
}

let lastFrame: SimFrame | null = null;
let throttleTimer: any = null;

function parseSimFrame(data: ArrayBuffer): SimFrame {
  const view = new DataView(data);
  return {
    time: view.getFloat32(0, true),
    altitude: view.getFloat32(4, true),
    velocity: view.getFloat32(8, true),
    mach: view.getFloat32(12, true),
    q: view.getFloat32(16, true),
    pitch: view.getFloat32(20, true),
    yaw: view.getFloat32(24, true),
    roll: view.getFloat32(28, true),
    posX: view.getFloat32(32, true),
    posY: view.getFloat32(36, true),
    phase: (view.getUint8(40) === 0 ? 'PRELAUNCH' : view.getUint8(40) === 1 ? 'BOOST_S1' : 'COAST_S1'),
    currentStage: view.getUint8(41),
    actuators: { '0': view.getFloat32(42, true), '1': view.getFloat32(46, true), '2': view.getFloat32(50, true), '3': view.getFloat32(54, true) },
    saturationBitmask: view.getUint16(58, true),
    latitude: view.byteLength >= 68 ? view.getFloat32(60, true) : undefined,
    longitude: view.byteLength >= 68 ? view.getFloat32(64, true) : undefined,
  };
}

export function connectSimulation(url: string, storeInstance: AppStore = storeRef!) {
  storeRef = storeInstance;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  storeRef.dispatch(resetTelemetry());
  storeRef.dispatch(setSimRunning(true));

  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
    if (typeof event.data === 'string') {
      try {
        const payload = JSON.parse(event.data);
        if (payload.active_phase && storeRef) {
          storeRef.dispatch(setPhase(payload.active_phase));
        }
      } catch (e) {
        // ignore
      }
      return;
    }

    const frame = parseSimFrame(event.data as ArrayBuffer);
    for (const cb of listeners) cb(frame);
    
    lastFrame = frame;
    if (!throttleTimer) {
      throttleTimer = setTimeout(() => {
        if (storeRef && lastFrame) {
          storeRef.dispatch(updateTelemetry({
            time: lastFrame.time,
            altitude: lastFrame.altitude,
            velocity: lastFrame.velocity,
            mach: lastFrame.mach,
            q: lastFrame.q,
            posX: lastFrame.posX,
            posY: lastFrame.posY,
            attitude: { pitch: lastFrame.pitch, yaw: lastFrame.yaw, roll: lastFrame.roll },
            phase: lastFrame.phase,
            currentStage: lastFrame.currentStage,
            actuators: lastFrame.actuators,
            saturationBitmask: lastFrame.saturationBitmask,
            latitude: lastFrame.latitude,
            longitude: lastFrame.longitude,
          }));
        }
        throttleTimer = null;
      }, 16);
    }
  };

  ws.onclose = () => {
    if (storeRef) storeRef.dispatch(setSimRunning(false));
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function disconnectSimulation() {
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  if (storeRef) {
    storeRef.dispatch(setSimRunning(false));
  }
}
