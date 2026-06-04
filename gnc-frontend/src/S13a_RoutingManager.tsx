import { useEffect, useState } from 'react';
import { X, Save, RefreshCw, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import clsx from 'clsx';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { saveDeviceAssignments, triggerRescan, updatePorts, type UsbDeviceRole } from './store/hardwareSlice';
import { writeAudit } from './store/systemSlice';
import { fetchHardwareScan, fetchDeviceAssignments, putDeviceAssignments } from './services/api';
import { requestHardwareRescan } from './services/hardwareWs';

const ROLE_LABELS: Record<UsbDeviceRole, string> = {
  GPS_TLM_PL2303: 'GPS / Telemetry (PL2303)',
  RUDDER_CP2102: 'Rudder / Servo Bus (CP2102)',
  CAN_CH340: 'CAN Bridge (CH340)',
  SEEK_CARTRACK: 'Seeker Co-Processor (CarTrack)',
  EXT_IMU: 'External IMU Bridge (STM32F405)',
  UNKNOWN: 'Unknown — pick a role',
};

const ROLE_COLORS: Record<UsbDeviceRole, string> = {
  GPS_TLM_PL2303: 'text-emerald-400',
  RUDDER_CP2102: 'text-yellow-400',
  CAN_CH340: 'text-blue-400',
  SEEK_CARTRACK: 'text-purple-400',
  EXT_IMU: 'text-orange-400',
  UNKNOWN: 'text-slate-500',
};

const ROLES: UsbDeviceRole[] = ['GPS_TLM_PL2303', 'RUDDER_CP2102', 'CAN_CH340', 'SEEK_CARTRACK', 'EXT_IMU', 'UNKNOWN'];

const STATUS_BADGE: Record<string, string> = {
  OK: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  WARN: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  ERROR: 'bg-red-500/20 text-red-400 border-red-500/40',
  OFFLINE: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
};

interface Props {
  onClose: () => void;
}

export default function S13a_RoutingManager({ onClose }: Props) {
  const dispatch = useAppDispatch();
  const ports = useAppSelector(s => s.hardware.ports);
  const operatorId = useAppSelector(s => s.auth.operatorId);
  const launchState = useAppSelector(s => s.system.launchState);
  const isArmed = launchState === 'ARMED' || launchState === 'COUNTDOWN' || launchState === 'LAUNCHED';

  const [assignments, setAssignments] = useState<Record<string, UsbDeviceRole>>({});
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Seed the assignment map from live ports the first time they appear,
  // and add entries for any newly-detected devices on subsequent renders.
  useEffect(() => {
    setAssignments(prev => {
      const next = { ...prev };
      for (const p of ports) {
        if (!(p.dev in next)) next[p.dev] = p.assignedRole;
      }
      return next;
    });
  }, [ports]);

  // On open, fetch a fresh scan + assignments from the backend so the
  // modal shows current state even if the WS frame hasn't arrived yet.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchHardwareScan(), fetchDeviceAssignments().catch(() => [])])
      .then(([scanned]) => {
        if (cancelled) return;
        if (scanned.length > 0) dispatch(updatePorts(scanned));
      })
      .catch((e) => {
        if (!cancelled) setError(`Backend unreachable: ${e?.message ?? 'unknown error'}`);
      });
    return () => { cancelled = true; };
  }, [dispatch]);

  const hasDuplicates = (() => {
    const roles = Object.values(assignments).filter(r => r !== 'UNKNOWN');
    return roles.length !== new Set(roles).size;
  })();

  const hasUnknown = Object.values(assignments).some(r => r === 'UNKNOWN');
  const canSave    = !hasDuplicates && !hasUnknown && !isArmed && ports.length > 0
                     && operatorId !== null && reason.trim().length > 0;

  function setRole(dev: string, role: UsbDeviceRole) {
    setAssignments(prev => ({ ...prev, [dev]: role }));
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    if (!operatorId) {
      setError('You must be signed in to save assignments.');
      return;
    }
    if (!reason.trim()) {
      setError('Reason is required for the audit trail (v5.4 §A.7).');
      return;
    }
    const devAssignments = ports.map(p => ({
      vidPid: `${p.vid}:${p.pid}`,
      role: assignments[p.dev],
      operatorId,
      reason: reason.trim(),
      timestamp: new Date().toISOString(),
    }));
    setError(null);
    try {
      const persisted = await putDeviceAssignments(devAssignments, {
        operatorId,
        reason: reason.trim(),
      });
      dispatch(saveDeviceAssignments(persisted));
      dispatch(writeAudit({
        ts: Date.now(),
        operator: operatorId,
        action: `Hardware routing updated: ${devAssignments.map(d => `${d.vidPid}→${d.role}`).join(', ')}`,
      }));
      setSaved(true);
      // Pull a fresh scan so the new assignedRole is reflected immediately.
      const refreshed = await fetchHardwareScan();
      if (refreshed.length > 0) dispatch(updatePorts(refreshed));
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string; details?: string } }; message?: string });
      const detail = msg.response?.data?.error ?? msg.response?.data?.details ?? msg.message ?? 'unknown error';
      setError(`Save failed: ${detail}`);
    }
  }

  async function handleRescan() {
    setScanning(true);
    setError(null);
    dispatch(triggerRescan());
    // Prefer WS so the broadcast updates every connected client; fall
    // back to REST if the socket is closed.
    const sentOverWs = requestHardwareRescan();
    if (!sentOverWs) {
      try {
        const scanned = await fetchHardwareScan();
        dispatch(updatePorts(scanned));
      } catch (e) {
        const msg = (e as { message?: string }).message ?? 'unknown error';
        setError(`Rescan failed: ${msg}`);
      }
    }
    setScanning(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div>
            <h2 className="text-xl font-bold text-white">Hardware Routing Manager</h2>
            <p className="text-sm text-slate-400 mt-0.5">Assign roles to detected USB/serial devices. VID:PID → role lookup (§7.3.4).</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {isArmed && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/40 rounded-xl text-red-300 text-sm">
              <Lock className="w-5 h-5 shrink-0" />
              <span><span className="font-bold">Routing locked.</span> Hardware assignments cannot be changed once the system is {launchState}. Abort the sequence to re-enable. (§6.4.7 rule 5)</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/40 rounded-xl text-red-300 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {ports.length === 0 && (
            <div className="flex items-center gap-3 p-4 bg-slate-800/40 border border-slate-700 rounded-xl text-slate-400 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>No USB serial devices detected. Plug in a known device and click <span className="font-mono text-slate-200">Re-Scan Ports</span> below.</span>
            </div>
          )}

          {hasDuplicates && (
            <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-300 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Duplicate role assignment detected. Each role must be assigned to at most one device.</span>
            </div>
          )}

          {hasUnknown && ports.length > 0 && (
            <div className="flex items-center gap-3 p-4 bg-slate-800/40 border border-slate-600 rounded-xl text-slate-300 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>One or more devices have <span className="font-mono">UNKNOWN</span> role. Pick a real role for each before saving.</span>
            </div>
          )}

          {/* Port table */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-slate-800/50 border-b border-slate-700/50 grid grid-cols-12 text-xs uppercase tracking-wider text-slate-500 font-medium">
              <div className="col-span-2">Status</div>
              <div className="col-span-3">Device / Node</div>
              <div className="col-span-2">VID:PID</div>
              <div className="col-span-2">Throughput</div>
              <div className="col-span-3">Assigned Role</div>
            </div>
            {ports.map((p) => (
              <div key={p.dev}
                className="px-5 py-4 grid grid-cols-12 items-center gap-2 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 transition-colors">
                <div className="col-span-2">
                  <span className={clsx('px-2 py-0.5 text-xs font-bold rounded border', STATUS_BADGE[p.status] ?? STATUS_BADGE['OFFLINE'])}>
                    {p.status}
                  </span>
                </div>
                <div className="col-span-3">
                  <div className="text-sm font-medium text-slate-200">{p.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{p.dev}</div>
                </div>
                <div className="col-span-2 font-mono text-xs text-slate-400">{p.vid}:{p.pid}</div>
                <div className="col-span-2 text-xs text-slate-400 font-mono">
                  <div>↓ {(p.rxBps / 1024).toFixed(1)} kB/s</div>
                  <div>↑ {(p.txBps / 1024).toFixed(1)} kB/s</div>
                </div>
                <div className="col-span-3">
                  <select
                    value={assignments[p.dev] ?? p.assignedRole}
                    onChange={e => setRole(p.dev, e.target.value as UsbDeviceRole)}
                    disabled={isArmed}
                    className={clsx(
                      'w-full bg-slate-800 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                      hasDuplicates ? 'border-yellow-500/50' : 'border-slate-600',
                      ROLE_COLORS[assignments[p.dev] ?? p.assignedRole]
                    )}>
                    {ROLES.map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  {assignments[p.dev] !== p.suggestedRole && (
                    <div className="text-xs text-yellow-500/80 mt-0.5">
                      Auto-detected: {ROLE_LABELS[p.suggestedRole]}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Change reason */}
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">
              Reason for override <span className="text-slate-600">(written to audit trail)</span>
            </label>
            <input value={reason} onChange={e => setReason(e.target.value)} disabled={isArmed}
              placeholder="e.g. Swapped USB port — GPS now on USB2"
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
          </div>

          {saved && (
            <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>Assignments saved to backend (gnc_device_assignments.json) and audit-logged.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700/50 flex justify-between items-center gap-4">
          <button onClick={handleRescan} disabled={isArmed || scanning}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <RefreshCw className={clsx('w-4 h-4', scanning && 'animate-spin')} /> {scanning ? 'Scanning…' : 'Re-Scan Ports'}
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={!canSave}
              title={!canSave ? (isArmed ? 'Locked while armed' : hasDuplicates ? 'Duplicate roles' : hasUnknown ? 'UNKNOWN role present' : !operatorId ? 'Sign in first' : !reason.trim() ? 'Reason required' : 'Plug in a device') : ''}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors">
              <Save className="w-4 h-4" /> Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
