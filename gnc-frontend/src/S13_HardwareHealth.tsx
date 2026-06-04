import { useEffect } from 'react';
import { Zap, Cpu, RefreshCw, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import S13a_RoutingManager from './S13a_RoutingManager';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { setRoutingManagerOpen, updatePorts } from './store/hardwareSlice';
import { connectHardware, disconnectHardware } from './services/hardwareWs';
import { fetchHardwareScan } from './services/api';
import { store } from './store/store';

export default function S13_HardwareHealth() {
  const dispatch      = useAppDispatch();
  const { t } = useTranslation();
  const showRouting   = useAppSelector(s => s.hardware.routingManagerOpen);
  const ports         = useAppSelector(s => s.hardware.ports);
  const canUtilPct    = useAppSelector(s => s.hardware.canUtilPct);
  const cpuTemp       = useAppSelector(s => s.hardware.cpuTemp);
  const cpuLoadPct    = useAppSelector(s => s.hardware.cpuLoadPct);
  const heapFreeKb    = useAppSelector(s => s.hardware.heapFreeKb);
  const lastRescan    = useAppSelector(s => s.hardware.lastRescan);
  const missionPath   = useAppSelector(s => s.mission.path);

  useEffect(() => {
    // 1) Open the WS — backend immediately seeds a `ports` frame.
    const wsUrl = `${import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080'}/ws/hardware`;
    connectHardware(wsUrl, store);

    // 2) Also fire a REST scan in parallel so the page has data even if
    //    the WS handshake is slow / offline.
    fetchHardwareScan()
      .then(p => { if (p.length > 0) dispatch(updatePorts(p)); })
      .catch(() => { /* backend offline — WS reconnect will catch up */ });

    return () => disconnectHardware();
  }, [dispatch]);

  const secondsAgo = lastRescan ? Math.floor((Date.now() - lastRescan) / 1000) : null;
  const hostLabel  = missionPath === 'A' ? 'Snapdragon 845 (Path A)' : 'STM32H743 (Path B)';

  return (
    <div className="h-full flex flex-col space-y-6">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">{t('hardware.title')}</h1>
          <p className="text-slate-400">Live hardware status, port mappings, and throughput (1 Hz refresh) — <span className="text-blue-400 font-medium">{hostLabel}</span></p>
        </div>
        <div className="flex items-center gap-3">
          {secondsAgo !== null && (
            <span className="text-xs text-slate-500">Last scan: {secondsAgo}s ago</span>
          )}
          <div className="flex items-center gap-2 text-sm px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-emerald-400">
            <RefreshCw className="w-4 h-4 animate-spin" /> Auto-Rescan Active
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CPU/Memory/CAN Node */}
        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <Cpu className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-bold">{hostLabel}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Core Temp</span><span className="text-white">{cpuTemp != null ? `${cpuTemp.toFixed(1)}°C` : '—'}</span></div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.min(100, ((cpuTemp ?? 0) / 100) * 100)}%` }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">CPU Load</span><span className="text-white">{cpuLoadPct != null ? `${cpuLoadPct.toFixed(0)}%` : '—'}</span></div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, cpuLoadPct ?? 0)}%` }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Heap Free</span><span className="text-white">{heapFreeKb != null ? `${heapFreeKb} KB` : '—'}</span></div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.min(100, ((heapFreeKb ?? 0) / 256) * 100)}%` }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400 flex items-center gap-1">CAN Bus Util
                  {(canUtilPct ?? 0) > 70 && <AlertTriangle className="w-3 h-3 text-yellow-400" />}
                </span>
                <span className={clsx('font-mono', (canUtilPct ?? 0) > 70 ? 'text-yellow-400' : 'text-white')}>
                  {canUtilPct ?? 0}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className={clsx('h-full transition-all', (canUtilPct ?? 0) > 70 ? 'bg-yellow-500' : 'bg-teal-500')}
                  style={{ width: `${Math.min(100, canUtilPct ?? 0)}%` }} />
              </div>
              {(canUtilPct ?? 0) > 70 && <p className="text-xs text-yellow-500 mt-1">C25: CAN util &gt;70% — check node IDs</p>}
            </div>
          </div>
        </div>

        {/* Port Throughput */}
        <div className="col-span-2 bg-slate-900/40 border border-slate-700/50 rounded-xl flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2"><Zap className="w-5 h-5 text-yellow-400" /> Interface Throughput</h2>
            <button onClick={() => dispatch(setRoutingManagerOpen(true))} className="text-sm bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded border border-slate-600 transition-colors">
              Open Routing Manager (S13a)
            </button>
          </div>
          {ports.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 gap-3 text-slate-500">
              <Zap className="w-10 h-10 opacity-40" />
              <p className="text-sm">No USB serial devices detected.</p>
              <p className="text-xs text-slate-600">Plug in a known USB-CAN / GPS / IMU bridge and click <span className="font-mono text-slate-400">Re-Scan Ports</span> in the Routing Manager.</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-6 py-3 font-medium">Device Name</th>
                  <th className="px-6 py-3 font-medium">Node</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">RX</th>
                  <th className="px-6 py-3 font-medium">TX</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-sm">
                {ports.map((p) => (
                  <tr key={p.dev} className="hover:bg-slate-800/20">
                    <td className="px-6 py-4 font-medium text-slate-200">{p.name || p.assignedRole}</td>
                    <td className="px-6 py-4 font-mono text-slate-400 text-xs">{p.dev}</td>
                    <td className="px-6 py-4 font-mono text-blue-400 text-xs">{p.assignedRole}</td>
                    <td className="px-6 py-4 text-emerald-400 text-xs">{(p.rxBps / 1024).toFixed(1)} kB/s</td>
                    <td className="px-6 py-4 text-emerald-400 text-xs">{(p.txBps / 1024).toFixed(1)} kB/s</td>
                    <td className="px-6 py-4">
                      <span className={clsx("px-2 py-1 rounded text-xs font-bold", p.status === 'OK' ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-400")}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {showRouting && <S13a_RoutingManager onClose={() => dispatch(setRoutingManagerOpen(false))} />}
    </div>
  );
}
