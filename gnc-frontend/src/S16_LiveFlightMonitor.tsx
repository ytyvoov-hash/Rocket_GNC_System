import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, Satellite, Cpu } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { resetTelemetry, pushStageTransition, updateTelemetry, type FlightPhase } from './store/telemetrySlice';
import { abort } from './store/systemSlice';
import { connectTelemetry, disconnectTelemetry } from './services/telemetryWs';
import { store } from './store/store';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export default function S16_LiveFlightMonitor() {
  const dispatch  = useAppDispatch();
  const navigate  = useNavigate();
  const { t } = useTranslation();
  const telemetry = useAppSelector(s => s.telemetry);
  const system    = useAppSelector(s => s.system);
  const activeRocket = useAppSelector(s => s.rocket.activeRocket);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<uPlot | null>(null);
  const historyRef = useRef<{ t: number[]; p: number[]; y: number[]; r: number[] }>({
    t: [], p: [], y: [], r: []
  });

  // Dynamically build phase order based on stage count
  const numStages = activeRocket?.num_stages ?? 1;
  const phaseOrder: string[] = ['PRELAUNCH'];
  for (let i = 1; i <= numStages; i++) {
    phaseOrder.push(`BOOST_S${i}`);
    phaseOrder.push(`COAST_S${i}`);
    if (i < numStages) {
      phaseOrder.push(`SEP_${i}_to_${i + 1}`);
    }
  }
  phaseOrder.push('TERMINAL');

  const phaseIdx = phaseOrder.indexOf(telemetry.phase);

  // Sync Telemetry WebSocket Stream on mount
  useEffect(() => {
    dispatch(resetTelemetry());
    const wsUrl = `${import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080'}/ws/telemetry`;
    connectTelemetry(wsUrl, store);
    return () => disconnectTelemetry();
  }, [dispatch]);

  // Local Sandbox Simulator Fallback (Adaptive Sandbox Flow)
  useEffect(() => {
    // If we receive a packet with time > 0 from the real websocket within 1.5 seconds, do not activate sandbox
    const timer = setTimeout(() => {
      if (telemetry.time > 0) return; // real backend telemetry is active!
      
      console.log('No active live telemetry received. Activating local GNC Sandbox Telemetry Stream...');
      let tSim = 0;
      let stage = 0;
      let phase: FlightPhase = 'BOOST_S1';

      const interval = setInterval(() => {
        tSim += 0.1;
        
        // Stage transition events
        if (tSim >= 4.0 && stage === 0) {
          stage = 1;
          phase = 'SEP_1_to_2';
          dispatch(pushStageTransition({ time: tSim, from: 0, to: 1, trigger: 'burnout' }));
        } else if (tSim >= 5.0 && phase === 'SEP_1_to_2') {
          phase = 'BOOST_S2';
        } else if (tSim >= 10.0 && phase === 'BOOST_S2') {
          phase = 'COAST_S2';
        } else if (tSim >= 20.0 && phase === 'COAST_S2') {
          phase = 'TERMINAL';
        }

        // Simulate flight dynamics
        const altitude = tSim < 10 
          ? 50 * tSim * tSim 
          : 5000 + 400 * (tSim - 10) - 4.9 * (tSim - 10) * (tSim - 10);
        const velocity = tSim < 10 ? 100 * tSim : 1000 - 9.8 * (tSim - 10);
        const mach = velocity / 340;
        const q = 1.2 * 9.8 * Math.max(0, 10000 - altitude) * 0.01;

        // Simulated attitude error oscillations
        const pitch = Math.sin(tSim * 2) * 4.5 + (phase === 'BOOST_S1' ? 85 : phase === 'BOOST_S2' ? 45 : 10);
        const yaw = Math.cos(tSim * 1.5) * 2.2;
        const roll = Math.sin(tSim * 0.8) * 3.5;

        // Simulated actuator bitmask (bits 0-11)
        let saturationBitmask = 0;
        if (Math.abs(pitch - 85) > 3) saturationBitmask |= (1 << 2);
        if (tSim > 3 && tSim < 6) saturationBitmask |= (1 << 5);
        if (tSim > 12) saturationBitmask |= (1 << 11);

        // IMM Probabilities shifting based on phase
        let immProbabilities = [0.95, 0.02, 0.01, 0.01, 0.01];
        if (phase === 'SEP_1_to_2') {
          immProbabilities = [0.05, 0.90, 0.02, 0.02, 0.01];
        } else if (phase === 'COAST_S2') {
          immProbabilities = [0.02, 0.03, 0.90, 0.03, 0.02];
        }

        dispatch(updateTelemetry({
          time: tSim,
          altitude,
          velocity,
          mach,
          q,
          attitude: { pitch, yaw, roll },
          phase,
          currentStage: stage,
          saturationBitmask,
          immProbabilities,
          gpsFix: 'RTK',
          gpsSatellites: 18,
          canUtilisationPct: 42 + Math.sin(tSim) * 5,
          cpuTemp: 45 + Math.random() * 2,
          cpuLoadPct: 35 + Math.random() * 10,
          heapFreeKb: 16384,
          mheStatus: { converged: true, iterations: 3, residual: 0.0012 }
        }));
      }, 100);

      return () => clearInterval(interval);
    }, 1500);

    return () => clearTimeout(timer);
  }, [dispatch, telemetry.time]);

  // Keep a buffer of past telemetry values for uPlot line chart
  useEffect(() => {
    if (telemetry.time === 0) {
      historyRef.current = { t: [], p: [], y: [], r: [] };
      return;
    }
    const hist = historyRef.current;

    // Prevent duplicate times
    if (hist.t.length > 0 && hist.t[hist.t.length - 1] === telemetry.time) {
      return;
    }

    hist.t.push(telemetry.time);
    hist.p.push(telemetry.attitude.pitch);
    hist.y.push(telemetry.attitude.yaw);
    hist.r.push(telemetry.attitude.roll);

    // Bound local buffer to last 150 timestamps (prevents CPU leaks)
    if (hist.t.length > 150) {
      hist.t.shift();
      hist.p.shift();
      hist.y.shift();
      hist.r.shift();
    }

    // Call high-speed uPlot setData hook
    if (chartInstanceRef.current && hist.t.length > 0) {
      chartInstanceRef.current.setData([
        hist.t,
        hist.p,
        hist.y,
        hist.r
      ]);
    }
  }, [telemetry.time]);

  // Instantiate high-performance uPlot canvas
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const opts: uPlot.Options = {
      width: chartContainerRef.current.clientWidth || 500,
      height: 140,
      scales: {
        x: { time: false },
      },
      series: [
        { label: 'T+' },
        {
          label: 'Pitch',
          stroke: '#ef4444', // red
          width: 1.5,
        },
        {
          label: 'Yaw',
          stroke: '#10b981', // green
          width: 1.5,
        },
        {
          label: 'Roll',
          stroke: '#3b82f6', // blue
          width: 1.5,
        },
      ],
      axes: [
        { stroke: '#64748b', grid: { stroke: '#33415533' } },
        { stroke: '#64748b', grid: { stroke: '#33415533' } },
      ],
      cursor: {
        show: false
      },
      legend: {
        show: false
      }
    };

    const data: uPlot.AlignedData = [[0], [0], [0], [0]];
    const plot = new uPlot(opts, data, chartContainerRef.current);
    chartInstanceRef.current = plot;

    const handleResize = () => {
      if (chartContainerRef.current) {
        plot.setSize({
          width: chartContainerRef.current.clientWidth,
          height: 140
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      plot.destroy();
      chartInstanceRef.current = null;
    };
  }, []);

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    const ms = Math.floor((s % 1) * 100).toString().padStart(2, '0');
    return `T+ ${m}:${ss}.${ms}`;
  };

  return (
    <div className="h-full flex flex-col gap-3">

      {/* Header */}
      <header className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t('flight.title')}</h1>
          <p className="text-slate-400 text-sm">WebSocket telemetry · {telemetry.path ?? 'Path ?'} · Stage {telemetry.currentStage + 1}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="font-mono text-xl font-black text-red-400 bg-red-500/10 px-5 py-2 rounded-lg border border-red-500/30">
            {fmtTime(telemetry.time)}
          </div>
          <button onClick={() => { dispatch(abort('OPERATOR_ABORT')); navigate('/launch'); }}
            className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 border border-red-500 text-white font-bold text-sm rounded-lg transition-colors">
            <AlertTriangle className="w-4 h-4" /> {t('flight.abort')}
          </button>
        </div>
      </header>

      {/* Dynamic Multi-Stage Phase Bar */}
      <div className="flex gap-1 shrink-0">
        {phaseOrder.map((ph, i) => (
          <div key={ph} className={clsx(
            'flex-1 py-1 rounded text-center text-xs font-bold transition-all uppercase tracking-wider',
            i === phaseIdx 
              ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] border border-blue-400/30' 
              : 'bg-slate-800/40 text-slate-600 border border-transparent'
          )}>
            {ph.replace(/_/g, ' ')}
          </div>
        ))}
      </div>

      {/* New Stage Transitions Horizontal Panel below Phase Bar */}
      {telemetry.stageTransitionLog.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-3 shrink-0 flex gap-4 overflow-x-auto items-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 shrink-0">Transitions:</span>
          <div className="flex gap-4">
            {telemetry.stageTransitionLog.map((t, i) => (
              <div key={i} className="flex gap-2 text-xs font-mono text-slate-400 bg-slate-800/40 px-2 py-0.5 rounded border border-slate-700/30">
                <span className="text-slate-500">T+{t.time.toFixed(1)}s</span>
                <span className="font-bold text-orange-400">S{t.from} → S{t.to}</span>
                <span className="text-slate-500">[{t.trigger}]</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">

        {/* Left: Nav State */}
        <div className="col-span-1 flex flex-col gap-3">
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 space-y-3 font-mono">
            {[
              { label: 'Altitude (m)',   val: fmt(telemetry.altitude),     color: 'text-emerald-400' },
              { label: 'Velocity (m/s)', val: fmt(telemetry.velocity),     color: 'text-emerald-400' },
              { label: 'Mach',           val: telemetry.mach.toFixed(3),   color: 'text-blue-400' },
              { label: 'q (Pa)',         val: fmt(telemetry.q),            color: 'text-yellow-400' },
              { label: 'Pitch (°)',      val: telemetry.attitude.pitch.toFixed(1), color: 'text-slate-200' },
              { label: 'Yaw (°)',        val: telemetry.attitude.yaw.toFixed(1),   color: 'text-slate-200' },
              { label: 'Roll (°)',       val: telemetry.attitude.roll.toFixed(1),  color: 'text-slate-200' },
            ].map(({ label, val, color }) => (
              <div key={label} className="flex justify-between items-baseline">
                <span className="text-xs text-slate-500">{label}</span>
                <span className={clsx('text-lg font-bold', color)}>{val}</span>
              </div>
            ))}
          </div>

          {/* GPS */}
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1"><Satellite className="w-3 h-3" /> GPS</h3>
            <div className="flex justify-between font-mono text-sm">
              <span className={clsx('font-bold', telemetry.gpsFix === 'RTK' ? 'text-emerald-400' : telemetry.gpsFix === 'NO_FIX' ? 'text-red-400' : 'text-yellow-400')}>
                {telemetry.gpsFix ?? 'NO_FIX'}
              </span>
              <span className="text-slate-400">{telemetry.gpsSatellites} sats</span>
            </div>
            {telemetry.latitude !== undefined && telemetry.longitude !== undefined && (
              <div className="mt-2 text-xs font-mono text-slate-400 flex flex-col gap-1 border-t border-slate-800/40 pt-2">
                <div className="flex justify-between">
                  <span>Lat:</span>
                  <span className="text-slate-200 font-bold">{telemetry.latitude.toFixed(6)}°</span>
                </div>
                <div className="flex justify-between">
                  <span>Lon:</span>
                  <span className="text-slate-200 font-bold">{telemetry.longitude.toFixed(6)}°</span>
                </div>
              </div>
            )}
          </div>

          {/* MHE */}
          {telemetry.mheStatus && (
            <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1"><Cpu className="w-3 h-3" /> MHE</h3>
              <div className="font-mono text-xs space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Converged</span><span className={telemetry.mheStatus.converged ? 'text-emerald-400' : 'text-yellow-400'}>{telemetry.mheStatus.converged ? 'YES' : 'NO'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Iterations</span><span className="text-slate-200">{telemetry.mheStatus.iterations}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Residual</span><span className="text-slate-200">{telemetry.mheStatus.residual.toFixed(4)}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Center + Right: Attitude + Actuators */}
        <div className="col-span-2 flex flex-col gap-3">

          {/* Attitude Visualisation Cards */}
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 flex-1 flex flex-col gap-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1"><Activity className="w-3 h-3" /> Attitude & Estimator Tracking</h2>
            
            {/* Attitude digital meters & bars */}
            <div className="grid grid-cols-3 gap-4">
              {(['pitch', 'yaw', 'roll'] as const).map(axis => {
                const val = telemetry.attitude[axis];
                const clampedPct = Math.min(100, Math.max(0, (val + 180) / 360 * 100));
                return (
                  <div key={axis} className="flex flex-col items-center justify-end gap-1">
                    <div className="text-xs text-slate-500 uppercase">{axis}</div>
                    <div className="font-mono text-lg font-bold text-slate-200">{val.toFixed(1)}°</div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all duration-100" style={{ width: `${clampedPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* High-speed uPlot time-series */}
            <div className="flex-1 min-h-[140px] relative border border-slate-800 rounded bg-slate-950/20 p-2 overflow-hidden flex flex-col justify-center">
              <div className="text-[10px] text-slate-600 mb-1 uppercase font-mono tracking-wider">High-Frequency Attitude Error Time-Series (uPlot)</div>
              <div ref={chartContainerRef} className="w-full h-full flex-1" />
            </div>

            {/* IMM Stacked Bar Chart */}
            {telemetry.immProbabilities.length > 0 && (
              <div className="pt-2 border-t border-slate-700/30">
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-bold">IMM Model Probability Mix</div>
                <div className="h-5 w-full bg-slate-800 rounded overflow-hidden flex border border-slate-700/50">
                  {telemetry.immProbabilities.map((p, i) => {
                    const colors = [
                      'bg-blue-500',    // Mode 1
                      'bg-emerald-500', // Mode 2
                      'bg-purple-500',  // Mode 3
                      'bg-orange-500',  // Mode 4
                      'bg-cyan-500',    // Mode 5
                    ];
                    if (p <= 0.01) return null;
                    return (
                      <div 
                        key={i} 
                        className={clsx(colors[i % colors.length], 'h-full transition-all duration-100 flex items-center justify-center text-[9px] font-mono font-bold text-black')}
                        style={{ width: `${p * 100}%` }}
                        title={`Mode ${i + 1}: ${(p * 100).toFixed(1)}%`}
                      >
                        M{i + 1}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Actuator Saturation Bitmask Grid (Bits 0–11) */}
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 shrink-0">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1 text-red-400/80">
              <AlertTriangle className="w-3 h-3" /> System Actuator Saturation Bitmask (Bits 0–11)
            </h2>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: 12 }).map((_, i) => {
                const active = (telemetry.saturationBitmask & (1 << i)) !== 0;
                return (
                  <div key={i} className={clsx(
                    'p-2 rounded border font-mono text-center text-xs transition-all duration-100 flex flex-col justify-center',
                    active 
                      ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse font-black shadow-[0_0_10px_rgba(239,68,68,0.2)]' 
                      : 'bg-slate-800/40 border-slate-700/10 text-slate-500'
                  )}>
                    <div className="text-[9px] uppercase text-slate-600">Bit {i}</div>
                    <div className="font-bold">{active ? 'SAT' : 'OK'}</div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* System Status Bar */}
      <div className="shrink-0 flex gap-4 text-xs font-mono border-t border-slate-700/30 pt-2 text-slate-500">
        <span>CPU: {telemetry.cpuTemp !== null ? `${telemetry.cpuTemp.toFixed(0)}°C` : '--'}</span>
        <span>Load: {telemetry.cpuLoadPct !== null ? `${telemetry.cpuLoadPct.toFixed(0)}%` : '--'}</span>
        <span>CAN: {telemetry.canUtilisationPct.toFixed(0)}%</span>
        <span className={clsx(system.launchState === 'ABORTED' && 'text-red-400 font-bold')}>State: {system.launchState}</span>
      </div>

    </div>
  );
}
