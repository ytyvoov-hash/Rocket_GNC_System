import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Settings2, BarChart2, AlertOctagon, RefreshCw, Cpu, Layers, Box, ShieldAlert, Activity, Download, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { startSimulation, stopSimulation } from './services/api';
import { connectSimulation, disconnectSimulation, onSimFrame } from './services/simulationWs';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { resetTelemetry } from './store/telemetrySlice';
import { store } from './store/store';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import S7_3DTelemetry from './S7_3DTelemetry';
import S12_FaultInjectionLab from './S12_FaultInjectionLab';
import RealisticFlightView from './components/RealisticFlightView';
import { useTranslation } from 'react-i18next';

export default function S6a_Sim3DOF({ hideHeader }: { hideHeader?: boolean }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const telemetry = useAppSelector(s => s.telemetry);
  const rocketState = useAppSelector(s => s.rocket);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const kinChartRef = useRef<HTMLDivElement>(null);
  const attChartRef = useRef<HTMLDivElement>(null);
  const aeroChartRef = useRef<HTMLDivElement>(null);
  const cmdChartRef = useRef<HTMLDivElement>(null);
  
  const kinPlotRef = useRef<uPlot | null>(null);
  const attPlotRef = useRef<uPlot | null>(null);
  const aeroPlotRef = useRef<uPlot | null>(null);
  const cmdPlotRef = useRef<uPlot | null>(null);

  const historyRef = useRef<{ 
    t: number[], alt: number[], vel: number[], mach: number[], q: number[], pitch: number[], yaw: number[], roll: number[], phase: string[], act0: number[], act1: number[], act2: number[], act3: number[], groundRange: number[], posX: number[], posY: number[]
  }>({
    t: [], alt: [], vel: [], mach: [], q: [], pitch: [], yaw: [], roll: [], phase: [],
    act0: [], act1: [], act2: [], act3: [], groundRange: [], posX: [], posY: []
  });

  // Simulation parameters derived from Redux
  const rocket = useAppSelector(s => s.rocket.activeRocket);
  const mission = useAppSelector(s => s.mission);
  
  const s0 = rocket?.stages?.[0];
  const massDry = s0?.physical?.mass_dry_kg ?? 70;
  const massInit = massDry + (s0?.physical?.propellant_mass_kg ?? 30);
  const thrust = s0?.propulsion ? (s0.propulsion.total_impulse_Ns / s0.propulsion.burn_time_s) : 5000;
  const burnTime = s0?.propulsion?.burn_time_s ?? 4.0;
  const dragCdA = s0 ? s0.geometry.ref_area_m2 * 0.4 : 0.05;

  const [gravity, setGravity] = useState(9.81);
  const [tEnd, setTEnd] = useState(120);
  const [dt, setDt] = useState(0.01);

  // Editable Mission Config Overrides
  const initAtt = mission.initial_conditions?.attitude; const initEuler = mission.initial_conditions?.attitude_degrees;
  const initPitch = initEuler ? initEuler[1] : (initAtt && initAtt.length === 4 
    ? Math.round(2 * Math.asin(initAtt[2]) * 180 / Math.PI) 
    : 67);

  const [launchAngle, setLaunchAngle] = useState(initPitch);
  
  useEffect(() => {
    const att = mission.initial_conditions?.attitude; 
    const euler = mission.initial_conditions?.attitude_degrees;
    if (euler) {
      setLaunchAngle(euler[1]);
    } else if (att && att.length === 4) {
      setLaunchAngle(Math.round(2 * Math.asin(att[2]) * 180 / Math.PI));
    }
  }, [mission.initial_conditions?.attitude, mission.initial_conditions?.attitude_degrees]);

  const [launchLat, setLaunchLat] = useState(mission.launch?.latitude ?? 16.45);
  const [launchLon, setLaunchLon] = useState(mission.launch?.longitude ?? 44.11);
  const [launchAlt, setLaunchAlt] = useState(mission.launch?.altitude ?? 0);
  
  const [targetRange, setTargetRange] = useState(mission.target?.range_m ?? 10000);
  const [targetBearing, setTargetBearing] = useState(mission.target?.bearing_deg ?? 0);
  const [targetAlt, setTargetAlt] = useState(mission.target?.altitude ?? 0);

  // Accordion state
  const [showLaunchSite, setShowLaunchSite] = useState(true);
  const [showTargetInfo, setShowTargetInfo] = useState(true);

  useEffect(() => {
    // Cleanup WebSocket on unmount
    return () => {
      disconnectSimulation();
    };
  }, []);

  // Update uPlot history buffer directly via WebSocket callbacks for maximum performance
  useEffect(() => {
    const unsubscribe = onSimFrame((frame) => {
      const hist = historyRef.current;
      if (frame.time === 0) {
        historyRef.current = { t: [], alt: [], vel: [], mach: [], q: [], pitch: [], yaw: [], roll: [], phase: [], act0: [], act1: [], act2: [], act3: [], groundRange: [], posX: [], posY: [] };
        const empty: uPlot.AlignedData = [[0], [0], [0]];
        kinPlotRef.current?.setData(empty);
        attPlotRef.current?.setData([[0], [0], [0], [0]]);
        aeroPlotRef.current?.setData(empty);
        cmdPlotRef.current?.setData([[0], [0], [0], [0], [0]]);
        return;
      }

      hist.t.push(frame.time);
      hist.alt.push(frame.altitude);
      hist.vel.push(frame.velocity);
      hist.posX.push(frame.posX);
      hist.posY.push(frame.posY);
      hist.mach.push(frame.mach);
      hist.q.push(frame.q / 1000); // kPa
      hist.pitch.push(frame.pitch);
      hist.yaw.push(frame.yaw);
      hist.roll.push(frame.roll);
      hist.phase.push(frame.phase || 'PRELAUNCH');
      hist.act0.push(frame.actuators?.['0'] || 0);
      hist.act1.push(frame.actuators?.['1'] || 0);
      hist.act2.push(frame.actuators?.['2'] || 0);
      hist.act3.push(frame.actuators?.['3'] || 0);

      const range = Math.sqrt(frame.posX * frame.posX + frame.posY * frame.posY);
      hist.groundRange.push(range);

      // Throttled plot updates
      if (hist.t.length % 20 === 0) {
        const plotSliceLen = 50000;
        const sliceStart = Math.max(0, hist.t.length - plotSliceLen);

        const tSlice = hist.t.slice(sliceStart);

        if (kinPlotRef.current && tSlice.length > 0) {
          kinPlotRef.current.setData([tSlice, hist.alt.slice(sliceStart), hist.vel.slice(sliceStart)]);
        }
        if (attPlotRef.current && tSlice.length > 0) {
          attPlotRef.current.setData([tSlice, hist.pitch.slice(sliceStart), hist.yaw.slice(sliceStart), hist.roll.slice(sliceStart)]);
        }
        if (aeroPlotRef.current && tSlice.length > 0) {
          aeroPlotRef.current.setData([tSlice, hist.mach.slice(sliceStart), hist.q.slice(sliceStart)]);
        }
        if (cmdPlotRef.current && tSlice.length > 0) {
          cmdPlotRef.current.setData([tSlice, hist.act0.slice(sliceStart), hist.act1.slice(sliceStart), hist.act2.slice(sliceStart), hist.act3.slice(sliceStart)]);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Instantiate high-performance uPlot canvases
  useEffect(() => {
    if (!kinChartRef.current || !attChartRef.current || !aeroChartRef.current) return;

    const commonOpts = {
      height: 250,
      scales: { x: { time: false } },
      axes: [
        { stroke: '#64748b', grid: { stroke: '#33415533' }, size: 30 },
        { stroke: '#64748b', grid: { stroke: '#33415533' }, size: 40 },
      ],
      cursor: { show: true },
      legend: { show: true, live: true }
    };

    const kinOpts: uPlot.Options = {
      ...commonOpts,
      width: kinChartRef.current.clientWidth,
      series: [
        { label: 'Time' },
        { label: 'Alt(m)', stroke: '#10b981', width: 2 },
        { label: 'Vel(m/s)', stroke: '#3b82f6', width: 2 },
      ]
    };

    const attOpts: uPlot.Options = {
      ...commonOpts,
      width: attChartRef.current.clientWidth,
      series: [
        { label: 'Time' },
        { label: 'Pitch', stroke: '#f43f5e', width: 2 },
        { label: 'Yaw', stroke: '#a855f7', width: 2 },
        { label: 'Roll', stroke: '#f59e0b', width: 2 },
      ]
    };

    const aeroOpts: uPlot.Options = {
      ...commonOpts,
      width: aeroChartRef.current.clientWidth,
      series: [
        { label: 'Time' },
        { label: 'Mach', stroke: '#eab308', width: 2 },
        { label: 'Q(kPa)', stroke: '#06b6d4', width: 2 },
      ]
    };

    const cmdOpts: uPlot.Options = {
      ...commonOpts,
      width: cmdChartRef.current?.clientWidth || 200,
      series: [
        { label: 'Time' },
        { label: 'Act0', stroke: '#10b981', width: 2 },
        { label: 'Act1', stroke: '#3b82f6', width: 2 },
        { label: 'Act2', stroke: '#f59e0b', width: 2 },
        { label: 'Act3', stroke: '#f43f5e', width: 2 },
      ]
    };

    kinPlotRef.current = new uPlot(kinOpts, [[0], [0], [0]], kinChartRef.current);
    attPlotRef.current = new uPlot(attOpts, [[0], [0], [0], [0]], attChartRef.current);
    aeroPlotRef.current = new uPlot(aeroOpts, [[0], [0], [0]], aeroChartRef.current);
    if (cmdChartRef.current) {
      cmdPlotRef.current = new uPlot(cmdOpts, [[0], [0], [0], [0], [0]], cmdChartRef.current);
    }

    const handleResize = () => {
      kinPlotRef.current?.setSize({ width: kinChartRef.current!.clientWidth, height: 250 });
      attPlotRef.current?.setSize({ width: attChartRef.current!.clientWidth, height: 250 });
      aeroPlotRef.current?.setSize({ width: aeroChartRef.current!.clientWidth, height: 250 });
      cmdPlotRef.current?.setSize({ width: cmdChartRef.current!.clientWidth, height: 250 });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      kinPlotRef.current?.destroy();
      attPlotRef.current?.destroy();
      aeroPlotRef.current?.destroy();
      cmdPlotRef.current?.destroy();
    };
  }, []);

  const resetSimulationState = () => {
    historyRef.current = { t: [], alt: [], vel: [], mach: [], q: [], pitch: [], yaw: [], roll: [], phase: [], act0: [], act1: [], act2: [], act3: [], groundRange: [], posX: [], posY: [] };
    const empty: uPlot.AlignedData = [[0], [0], [0]];
    kinPlotRef.current?.setData(empty);
    attPlotRef.current?.setData([[0], [0], [0], [0]]);
    aeroPlotRef.current?.setData(empty);
    cmdPlotRef.current?.setData([[0], [0], [0], [0], [0]]);
    setReplayFrame({ altitude: 0, posX: 0, posY: 0, attitude: { pitch: launchAngle, yaw: 0, roll: 0 } });
    setReplayTime(0);
    setReplayState('stopped');
  };

  const handleStartSim = async () => {
    setLoading(true);
    setError('');
    dispatch(resetTelemetry());
    resetSimulationState();

    try {
      const payload = {
        template_id: rocketState.activeRocket?.id || 'BA',
        phases: mission.phases && mission.phases.length > 0 ? mission.phases : [{
          id: 'basic-flight',
          name: 'Basic Flight',
          start_condition: { type: 'time', value: 0 },
          end_condition: { type: 'time', value: Number(tEnd) || 120 },
          controller_id: 'PID_BASIC',
          estimator_id: 'EST_BASIC',
          actuator_mapping: {}
        }],
        sim: {
          sim_mode: '3dof',
          mass_init_kg: Number(massInit) || 100,
          mass_dry_kg: Number(massDry) || 70,
          thrust_N: Number(thrust) || 5000,
          burn_time_s: Number(burnTime) || 4.0,
          cd_A_m2: Number(dragCdA) || 0.05,
          S_ref_m2: Number(s0?.geometry?.ref_area_m2) || 0.0314,
          gravity_m_s2: Number(gravity) || 9.81,
          t_end_s: Number(tEnd) || 120,
          dt_s: dt,
          initial_conditions: {
            ...mission.initial_conditions,
            position: [0, 0, -(Number(launchAlt) || 0)],
            attitude: [
              Math.cos((Number(launchAngle) || 67) * Math.PI / 180 / 2),
              0.0,
              Math.sin((Number(launchAngle) || 67) * Math.PI / 180 / 2),
              0.0
            ]
          },
          launch: { latitude: Number(launchLat) || 0, longitude: Number(launchLon) || 0, altitude: Number(launchAlt) || 0 },
          target: { range_m: Number(targetRange) || 0, bearing_deg: Number(targetBearing) || 0, altitude: Number(targetAlt) || 0 }
        },
        metadata: {}
      };

      const res = await startSimulation(payload);
      if (res && res.runId) {
        setActiveRunId(res.runId);
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = import.meta.env.VITE_WS_URL || `${window.location.hostname}:8080`;
        const wsUrl = `${wsProtocol}//${wsHost}/ws/simulation?runId=${res.runId}`;
        connectSimulation(wsUrl, store);
      } else {
        throw new Error('No run ID returned from backend.');
      }
    } catch (err: any) {
      console.error('Failed to start simulation:', err);
      setError(err.response?.data?.details || 'Backend rejected simulation trigger. Verify service.');
    } finally {
      setLoading(false);
    }
  };

  const handleStopSim = async () => {
    if (!activeRunId) return;
    setLoading(true);
    try {
      await stopSimulation(activeRunId);
    } catch (err) {
      console.error('Failed to stop simulation:', err);
    } finally {
      disconnectSimulation();
      setActiveRunId(null); resetSimulationState(); dispatch(resetTelemetry());
      setLoading(false);
    }
  };

  const handleDownloadLog = () => {
    if (!activeRunId) {
        alert("No active simulation run to download.");
        return;
    }
    const url = `http://localhost:8080/api/v1/simulation/${activeRunId}/log/download`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `simulation_log_${activeRunId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const progressPct = Math.min((telemetry.time / tEnd) * 100, 100);

  const [showPhysics, setShowPhysics] = useState(true);

  // Replay UI State
  const [activeTab, setActiveTab] = useState<'physics' | 'replay'>('physics');
  const [replayState, setReplayState] = useState<'stopped' | 'playing' | 'paused'>('stopped');
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [replayTime, setReplayTime] = useState<number>(0);
  const [replayFrame, setReplayFrame] = useState({ altitude: 0, posX: 0, posY: 0, attitude: { pitch: launchAngle, yaw: 0, roll: 0 } });

  // Replay Engine
  useEffect(() => {
    if (replayState !== 'playing' || historyRef.current.t.length === 0) return;
    
    let lastTime = performance.now();
    let animFrame: number;

    const loop = (now: number) => {
      const dt_sec = (now - lastTime) / 1000;
      lastTime = now;
      
      setReplayTime(prev => {
        const nextTime = prev + dt_sec * replaySpeed;
        const hist = historyRef.current;
        const maxTime = hist.t[hist.t.length - 1];
        
        if (nextTime >= maxTime) {
          setReplayState('stopped');
          return maxTime;
        }

        let left = 0;
        let right = hist.t.length - 1;
        while (left <= right) {
          const mid = Math.floor((left + right) / 2);
          if (hist.t[mid] < nextTime) left = mid + 1;
          else right = mid - 1;
        }
        const idx = Math.max(0, Math.min(left, hist.t.length - 1));
        
        setReplayFrame({
           altitude: hist.alt[idx],
           posX: hist.posX[idx],
           posY: hist.posY[idx],
           attitude: { pitch: hist.pitch[idx], yaw: hist.yaw[idx], roll: hist.roll[idx] }
        });

        return nextTime;
      });

      animFrame = requestAnimationFrame(loop);
    };

    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [replayState, replaySpeed]);


  return (
    <div className="h-full flex flex-col">
      {!hideHeader && (
        <header className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
              <Activity className="w-8 h-8 text-fuchsia-500" /> {t('simulation.3dof_basic')}
            </h1>
            <p className="text-slate-400">Basic 3-DOF point-mass trajectory simulation with dynamic 3D telemetry.</p>
          </div>
          {activeRunId && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 text-xs font-semibold rounded-full font-mono">
              Active HIL Run: {activeRunId.slice(0, 12)}
            </div>
          )}
        </header>
      )}

      <div className="flex-1 flex flex-col space-y-6 min-h-0 overflow-hidden relative">
        <div className="h-full flex flex-col overflow-y-auto">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-sm font-medium flex items-center gap-3 pointer-events-auto">
                <AlertOctagon className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
              
              {/* Controls Sidebar */}
              <div className="col-span-1 space-y-4">
              
              {/* Actions Section */}
              <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
                <h3 className="font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-400" /> Controls
                </h3>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleStartSim}
                    disabled={telemetry.isSimRunning || loading}
                    className="flex justify-center items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/30 px-5 py-2.5 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:shadow-none text-sm"
                  >
                    {loading && !activeRunId ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    Start Physics Run
                  </button>
                  <button 
                    onClick={handleStopSim}
                    disabled={!telemetry.isSimRunning || loading}
                    className="flex justify-center items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/30 px-5 py-2.5 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] disabled:shadow-none text-sm"
                  >
                    {loading && activeRunId ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                    Stop / Abort
                  </button>
                  <button
                    onClick={handleDownloadLog}
                    disabled={historyRef.current.t.length === 0}
                    className="flex justify-center items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 px-5 py-2.5 rounded-lg font-bold transition-all text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Download Log (CSV)
                  </button>
                </div>
              </div>

              {/* Editable Launch Site */}
              <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
                <button 
                  onClick={() => setShowLaunchSite(!showLaunchSite)}
                  className="w-full font-semibold flex justify-between items-center outline-none text-left"
                >
                  <div className="flex items-center gap-2 text-blue-400"><Settings2 className="w-4 h-4" /> Launch Site</div>
                  {showLaunchSite ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {showLaunchSite && (
                  <div className="space-y-3 text-xs mt-4 border-t border-slate-800 pt-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Launch Angle (deg)</label>
                      <input type="number" step="1" value={launchAngle} onChange={e => setLaunchAngle(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Latitude (AÂ°)</label>
                      <input type="number" step="0.0001" value={launchLat} onChange={e => setLaunchLat(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Longitude (AÂ°)</label>
                      <input type="number" step="0.0001" value={launchLon} onChange={e => setLaunchLon(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Altitude (m)</label>
                      <input type="number" step="1" value={launchAlt} onChange={e => setLaunchAlt(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                  </div>
                )}
              </div>

              {/* Editable Target */}
              <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
                <button 
                  onClick={() => setShowTargetInfo(!showTargetInfo)}
                  className="w-full font-semibold flex justify-between items-center outline-none text-left"
                >
                  <div className="flex items-center gap-2 text-emerald-400"><AlertOctagon className="w-4 h-4" /> Target Info</div>
                  {showTargetInfo ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {showTargetInfo && (
                  <div className="space-y-3 text-xs mt-4 border-t border-slate-800 pt-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Range (m)</label>
                      <input type="number" step="1" value={targetRange} onChange={e => setTargetRange(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Bearing (AÂ°)</label>
                      <input type="number" step="1" value={targetBearing} onChange={e => setTargetBearing(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Target Altitude (m)</label>
                      <input type="number" step="1" value={targetAlt} onChange={e => setTargetAlt(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                  </div>
                )}
              </div>

              {/* Physics Parameters */}
              <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
                <button 
                  onClick={() => setShowPhysics(!showPhysics)}
                  className="w-full font-semibold flex justify-between items-center outline-none text-left"
                >
                  <div className="flex items-center gap-2 text-fuchsia-400"><Settings2 className="w-4 h-4" /> Physics Parameters</div>
                  {showPhysics ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {showPhysics && (
                  <div className="space-y-3 text-xs mt-4 border-t border-slate-800 pt-3">
                    <div className="flex justify-between border-b border-slate-800 pb-2">
                      <span className="text-slate-400">Initial Mass</span>
                      <span className="text-slate-200 font-mono">{massInit.toFixed(1)} kg</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-2">
                      <span className="text-slate-400">Dry Mass</span>
                      <span className="text-slate-200 font-mono">{massDry.toFixed(1)} kg</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-2">
                      <span className="text-slate-400">Thrust</span>
                      <span className="text-slate-200 font-mono">{thrust.toFixed(0)} N</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-2">
                      <span className="text-slate-400">Burn Time</span>
                      <span className="text-slate-200 font-mono">{burnTime.toFixed(1)} s</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-2">
                      <span className="text-slate-400">Gravity</span>
                      <span className="text-slate-200 font-mono">{gravity.toFixed(2)} m/s²</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-2 items-center">
                      <span className="text-slate-400">Simulation Duration (s)</span>
                      <input 
                        type="number" 
                        value={tEnd} 
                        onChange={(e) => setTEnd(Number(e.target.value))}
                        className="bg-slate-800 text-slate-200 w-20 px-2 py-1 rounded text-right font-mono" 
                      />
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-2 items-center">
                      <span className="text-slate-400">Time Step dt (s)</span>
                      <input 
                        type="number" 
                        step="0.01"
                        value={dt} 
                        onChange={(e) => setDt(Number(e.target.value))}
                        className="bg-slate-800 text-slate-200 w-20 px-2 py-1 rounded text-right font-mono" 
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>


            {/* Main View Grid */}
            <div className="col-span-3 bg-slate-900/80 border border-slate-700/50 rounded-xl flex flex-col overflow-hidden shadow-2xl">
              <div className="border-b border-slate-700/50 flex bg-slate-800/60">
                <button 
                  onClick={() => setActiveTab('physics')}
                  className={clsx("flex-1 py-4 text-center font-semibold text-sm transition-colors border-b-2", activeTab === 'physics' ? "border-blue-400 text-blue-400 bg-blue-900/10" : "border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200")}
                >
                  <div className="flex items-center justify-center gap-2"><Activity className="w-4 h-4" /> Physics Run & Plots</div>
                </button>
                <button 
                  onClick={() => setActiveTab('replay')}
                  className={clsx("flex-1 py-4 text-center font-semibold text-sm transition-colors border-b-2", activeTab === 'replay' ? "border-emerald-400 text-emerald-400 bg-emerald-900/10" : "border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200")}
                >
                  <div className="flex items-center justify-center gap-2"><Play className="w-4 h-4" /> 3D Replay</div>
                </button>
              </div>



              <div className="flex-1 p-6 flex flex-col justify-center relative space-y-6">
                {activeTab === 'physics' ? (
                  <>
                    <div className="flex justify-between items-center bg-slate-800/40 p-4 rounded-lg border border-slate-700/50 mb-4">
                      <div className="font-semibold text-slate-200 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-400" /> Live Telemetry
                      </div>
                      <div className="font-mono text-xl tracking-wider text-slate-300">
                        T+ {telemetry.time.toFixed(2)}s
                      </div>
                    </div>

                
                {/* Progress Bar & Phase */}
                <div>
                  <div className="flex justify-between text-sm mb-2 font-medium">
                    <span className="text-blue-400 flex items-center gap-2">
                      <span className={clsx("inline-block w-2.5 h-2.5 rounded-full", telemetry.isSimRunning ? "bg-blue-500 animate-pulse" : "bg-slate-500")} />
                      Flight Phase: {telemetry.dynamicPhase || telemetry.phase || 'PRELAUNCH'}
                    </span>
                    <span className="text-slate-400 font-mono">{progressPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner border border-slate-700">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-100 ease-linear"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-4 gap-4 text-center font-mono">
                  <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 shadow-md">
                    <div className="text-slate-500 text-xs mb-1 uppercase font-semibold tracking-wider">MACH</div>
                    <div className="text-2xl text-blue-300 font-bold">{telemetry.mach.toFixed(2)}</div>
                  </div>
                  <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 shadow-md">
                    <div className="text-slate-500 text-xs mb-1 uppercase font-semibold tracking-wider">GROUND RANGE</div>
                    <div className="text-2xl text-purple-300 font-bold">{(historyRef.current.groundRange[historyRef.current.groundRange.length - 1] || 0).toFixed(1)} m</div>
                  </div>
                  <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 shadow-md">
                    <div className="text-slate-500 text-xs mb-1 uppercase font-semibold tracking-wider">ALTITUDE</div>
                    <div className="text-2xl text-emerald-300 font-bold">{telemetry.altitude.toFixed(1)} m</div>
                  </div>
                  <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 shadow-md">
                    <div className="text-slate-500 text-xs mb-1 uppercase font-semibold tracking-wider">Q (Dyn Press)</div>
                    <div className="text-2xl text-orange-300 font-bold">{(telemetry.q / 1000).toFixed(2)} kPa</div>
                  </div>
                </div>



                {/* Live Charts Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-3 overflow-hidden flex flex-col">
                    <div className="text-[10px] text-slate-400 mb-2 uppercase font-mono font-semibold text-center border-b border-slate-800 pb-1">Kinematics</div>
                    <div ref={kinChartRef} className="w-full flex-1 min-h-[250px]" />
                  </div>
                  <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-3 overflow-hidden flex flex-col">
                    <div className="text-[10px] text-slate-400 mb-2 uppercase font-mono font-semibold text-center border-b border-slate-800 pb-1">Attitude</div>
                    <div ref={attChartRef} className="w-full flex-1 min-h-[250px]" />
                  </div>
                  <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-3 overflow-hidden flex flex-col">
                    <div className="text-[10px] text-slate-400 mb-2 uppercase font-mono font-semibold text-center border-b border-slate-800 pb-1">Aerodynamics</div>
                    <div ref={aeroChartRef} className="w-full flex-1 min-h-[250px]" />
                  </div>
                  <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-3 overflow-hidden flex flex-col">
                    <div className="text-[10px] text-slate-400 mb-2 uppercase font-mono font-semibold text-center border-b border-slate-800 pb-1">Command & Response (Actuators)</div>
                    <div ref={cmdChartRef} className="w-full flex-1 min-h-[250px]" />
                  </div>
                </div>

                  </>
                ) : (
                  <div className="flex flex-col h-full space-y-4">
                    {/* 3D Telemetry Viewer (Replay) */}
                    <div className="flex-1 rounded-xl overflow-hidden relative border border-slate-700/50 shadow-inner min-h-[600px]">
                      <RealisticFlightView launchAlt={launchAlt} telemetry={replayFrame} />
                    </div>
                    
                    {/* Replay Controls */}
                    <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {replayState === 'playing' ? (
                           <button onClick={() => setReplayState('paused')} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-white transition-colors"><Pause className="w-5 h-5 fill-current" /></button>
                        ) : (
                           <button onClick={() => setReplayState('playing')} className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"><Play className="w-5 h-5 fill-current ml-1" /></button>
                        )}
                        <button onClick={() => { setReplayState('stopped'); setReplayTime(0); setReplayFrame({ altitude: 0, posX: 0, posY: 0, attitude: { pitch: launchAngle, yaw: 0, roll: 0 } }); }} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"><Square className="w-4 h-4 fill-current" /></button>
                      </div>
                      
                      <div className="flex-1 flex flex-col mx-4">
                        <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
                          <span>T+ {replayTime.toFixed(2)}s</span>
                          <span>{historyRef.current.t.length > 0 ? historyRef.current.t[historyRef.current.t.length - 1].toFixed(2) : 0}s</span>
                        </div>
                        <input 
                          type="range" 
                          min={0} 
                          max={historyRef.current.t.length > 0 ? historyRef.current.t[historyRef.current.t.length - 1] : 100} 
                          step={0.1}
                          value={replayTime}
                          onChange={(e) => {
                             const t = Number(e.target.value);
                             setReplayTime(t);
                             // Update preview frame instantly
                             const hist = historyRef.current;
                             if(hist.t.length === 0) return;
                             let left = 0; let right = hist.t.length - 1;
                             while(left <= right) { const mid = Math.floor((left+right)/2); if(hist.t[mid]<t) left=mid+1; else right=mid-1; }
                             const idx = Math.max(0, Math.min(left, hist.t.length - 1));
                             setReplayFrame({ altitude: hist.alt[idx], posX: hist.posX[idx], posY: hist.posY[idx], attitude: { pitch: hist.pitch[idx], yaw: hist.yaw[idx], roll: hist.roll[idx] } });
                          }}
                          className="w-full accent-emerald-500"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Speed</span>
                        <select 
                          value={replaySpeed} 
                          onChange={(e) => setReplaySpeed(Number(e.target.value))}
                          className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-sm outline-none"
                        >
                          <option value={1}>1x</option>
                          <option value={2}>2x</option>
                          <option value={3}>3x</option>
                          <option value={4}>4x</option>
                          <option value={5}>5x</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
