import type { store } from '../store/store';
import {
  updatePorts,
  updateCpuInfo,
  setCanUtilisation,
  setLastRescan,
  type HardwarePort,
  type PortStatus,
  type UsbDeviceRole,
} from '../store/hardwareSlice';

type AppStore = typeof store;

const RECONNECT_DELAY_MS = 3000;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let storeRef: AppStore | null = null;

interface HwWsMessage {
  type: 'ports' | 'cpu' | 'can' | 'rescan_ack';
  payload: unknown;
}

function parsePorts(payload: unknown): HardwarePort[] {
  const arr = payload as Array<Record<string, unknown>>;
  if (!Array.isArray(arr)) return [];
  return arr.map((p) => {
    const suggested = String(p.suggestedRole ?? 'UNKNOWN') as UsbDeviceRole;
    const assigned  = String(p.assignedRole ?? p.suggestedRole ?? 'UNKNOWN') as UsbDeviceRole;
    return {
      name: String(p.name ?? ''),
      dev: String(p.dev ?? ''),
      vid: String(p.vid ?? ''),
      pid: String(p.pid ?? ''),
      suggestedRole: suggested,
      assignedRole: assigned,
      rxBps: Number(p.rxBps ?? 0),
      txBps: Number(p.txBps ?? 0),
      status: String(p.status ?? 'OFFLINE') as PortStatus,
    };
  });
}

export function connectHardware(url: string, storeInstance: AppStore = storeRef!) {
  storeRef = storeInstance;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(url);

  ws.onopen = () => { /* connected — backend immediately seeds a 'ports' frame */ };

  ws.onmessage = (event: MessageEvent<string>) => {
    try {
      const msg: HwWsMessage = JSON.parse(event.data);
      if (!storeRef) return;

      switch (msg.type) {
        case 'ports':
          storeRef.dispatch(updatePorts(parsePorts(msg.payload)));
          break;
        case 'cpu':
          storeRef.dispatch(updateCpuInfo(msg.payload as { temp: number | null; loadPct: number | null; heapFreeKb: number | null }));
          break;
        case 'can':
          storeRef.dispatch(setCanUtilisation((msg.payload as { utilPct: number }).utilPct));
          break;
        case 'rescan_ack':
          storeRef.dispatch(setLastRescan(Date.now()));
          break;
      }
    } catch {
      // ignore malformed frames
    }
  };

  ws.onclose = () => {
    reconnectTimer = setTimeout(() => connectHardware(url, storeRef!), RECONNECT_DELAY_MS);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

// Asks the backend to re-enumerate USB devices NOW. Returns true if the
// request was sent (socket open), false otherwise — caller can then fall
// back to a REST `GET /hardware/scan`.
export function requestHardwareRescan(): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify({ type: 'rescan_request' }));
  return true;
}

export function disconnectHardware() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
}
