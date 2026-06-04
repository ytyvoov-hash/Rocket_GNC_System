import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings2, BarChart2, AlertOctagon, RefreshCw, Cpu, Layers } from 'lucide-react';
import clsx from 'clsx';
import { startSimulation, stopSimulation } from './services/api';
import { connectSimulation, disconnectSimulation } from './services/simulationWs';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { resetTelemetry } from './store/telemetrySlice';
import { store } from './store/store';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useTranslation } from 'react-i18next';

export default function S6b_SimTuning({ hideHeader }: { hideHeader?: boolean }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const telemetry = useAppSelector(s => s.telemetry);
  const rocketState = useAppSelector(s => s.rocket);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<uPlot | null>(null);
  const historyRef = useRef<{ t: number[]; alt: number[]; vel: number[] }>({
    t: [], alt: [], vel: []
  });

  // Simulation parameters derived from Redux
  const rocket = useAppSelector(s => s.rocket.activeRocket);
  const mission = useAppSelector(s => s.mission);
  
  const massInit = rocket ? rocket.mass : 100;
  const s0 = rocket?.stages[0];
  const massDry = s0 ? s0.physical.mass_dry_kg : 70;
  const thrust = s0?.propulsion ? s0.propulsion.thrust_multiplier * 5000 : 5000;
  const burnTime = s0?.propulsion ? s0.propulsion.burn_time_s : 4.0;
  const dragCdA = s0 ? s0.geometry.ref_area_m2 * 0.4 : 0.05;

  const [gravity, setGravity] = useState(9.81);
  const [tEnd, setTEnd] = useState(120);

  // PID Tuning State
  const [kp, setKp] = useState(1.0);
  const [ki, setKi] = useState(0.1);
  const [kd, setKd] = useState(0.01);

  // Extra environment selections
  const [windModel, setWindModel] = useState('Standard');
  const [atmosphere, setAtmosphere] = useState('US Standard 1976');
  const [faultServoJam, setFaultServoJam] = useState(false);
  const [faultGpsLoss, setFaultGpsLoss] = useState(false);

  useEffect(() => {
    // Cleanup WebSocket on unmount
    return () => {
      disconnectSimulation();
    };
  }, []);

  // Update uPlot history buffer on telemetry updates
  useEffect(() => {
    if (telemetry.time === 0) {
      historyRef.current = { t: [], alt: [], vel: [] };
      if (chartInstanceRef.current) {
        chartInstanceRef.current.setData([[0], [0], [0]]);
      }
      return;
    }
    const hist = historyRef.current;
    if (hist.t.length > 0 && hist.t[hist.t.length - 1] === telemetry.time) {
      return;
    }
    hist.t.push(telemetry.time);
    hist.alt.push(telemetry.altitude);
    hist.vel.push(telemetry.velocity);

    if (hist.t.length > 200) {
      hist.t.shift();
      hist.alt.shift();
      hist.vel.shift();
    }

    if (chartInstanceRef.current && hist.t.length > 0) {
      chartInstanceRef.current.setData([
        hist.t,
        hist.alt,
        hist.vel
      ]);
    }
  }, [telemetry.time, telemetry.altitude, telemetry.velocity]);

  // Instantiate high-performance uPlot canvas
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const opts: uPlot.Options = {
      width: chartContainerRef.current.clientWidth || 500,
      height: 160,
      scales: {
        x: { time: false },
      },
      series: [
        { label: 'Time' },
        {
          label: 'Altitude (m)',
          stroke: '#10b981', // emerald
          width: 2,
        },
        {
          label: 'Velocity (m/s)',
          stroke: '#3b82f6', // blue
          width: 2,
        },
      ],
      axes: [
        { stroke: '#64748b', grid: { stroke: '#33415533' } },
        { stroke: '#64748b', grid: { stroke: '#33415533' } },
      ],
      cursor: {
        show: true
      },
      legend: {
        show: true,
        live: true
      }
    };

    const data: uPlot.AlignedData = [[0], [0], [0]];
    const plot = new uPlot(opts, data, chartContainerRef.current);
    chartInstanceRef.current = plot;

    const handleResize = () => {
      if (chartContainerRef.current) {
        plot.setSize({
          width: chartContainerRef.current.clientWidth,
          height: 160
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

  const handleStartSim = async () => {
    setLoading(true);
    setError('');
    dispatch(resetTelemetry());

    try {
      // Build request body with customized overrides matching parse_sim_config schema
      const payload = {
        template_id: rocketState.activeRocket?.id || 'BA',
        sim: {
          sim_mode: 'tuning',
          mass_init_kg: Number(massInit),
          mass_dry_kg: Number(massDry),
          thrust_N: Number(thrust),
          burn_time_s: Number(burnTime),
          cd_A_m2: Number(dragCdA),
          gravity_m_s2: Number(gravity),
          t_end_s: Number(tEnd),
          dt_s: 0.01,
          initial_conditions: {
            ...mission.initial_conditions,
            position: [0, 0, -Number(mission.launch.altitude)],
            // Pitch 90 degrees pointing up (NED frame: X North, Y East, Z Down -> Pitch around Y)
            attitude: [0.7071068, 0.0, 0.7071068, 0.0]
          },
          launch: mission.launch,
          target: mission.target
        },
        tuning: {
            pid_gains: {
              kp: kp,
              ki: ki,
              kd: kd
          }
        },
        metadata: {
          windModel,
          atmosphere,
          faults: {
            servoJam: faultServoJam,
            gpsLoss: faultGpsLoss
          }
        }
      };

      const res = await startSimulation(payload);
      if (res && res.runId) {
        setActiveRunId(res.runId);
        
        // Resolve absolute WebSocket URL
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = import.meta.env.VITE_WS_URL || `${window.location.hostname}:8080`;
        const wsUrl = `${wsProtocol}//${wsHost}/ws/simulation?runId=${res.runId}`;
        
        console.log(`Simulation initiated with Run ID: ${res.runId}. Opening WebSocket: ${wsUrl}`);
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
      setActiveRunId(null);
      setLoading(false);
    }
  };

  // Compute actual progress percentage
  const progressPct = Math.min((telemetry.time / tEnd) * 100, 100);

  return (
    <div className="h-full flex flex-col space-y-6">
      {!hideHeader && (
        <header className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
              <Cpu className="w-8 h-8 text-indigo-500" /> {t('simulation.6dof_tuning')}
            </h1>
            <p className="text-slate-400">Validate controller gains, mixer saturation, and bending mode filters with full rigid body dynamics.</p>
          </div>
          {activeRunId && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full font-mono">
              Active Run: {activeRunId.slice(0, 12)}
            </div>
          )}
        </header>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-sm font-medium flex items-center gap-3">
          <AlertOctagon className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
        
        {/* Controls Sidebar */}
        <div className="col-span-1 space-y-4">
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
            <h3 className="font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-slate-400" /> Physics Parameters
            </h3>
            
            <div className="space-y-4 text-xs">
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
                <span className="text-slate-400">Aero Cd*A</span>
                <span className="text-slate-200 font-mono">{dragCdA.toFixed(3)} m²</span>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Gravity G (m/s²)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={gravity} 
                  onChange={e => setGravity(e.target.value as any)}
                  disabled={telemetry.isSimRunning}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Simulation Limit (s)</label>
                <input 
                  type="number" 
                  value={tEnd} 
                  onChange={e => setTEnd(e.target.value as any)}
                  disabled={telemetry.isSimRunning}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Mission Parameters */}
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
            <h3 className="font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-slate-400" /> Mission Config
            </h3>
            <div className="space-y-4 text-xs">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Launch Pad</span>
                <span className="text-slate-200 font-mono">{(mission.launch?.latitude ?? 16.45).toFixed(4)}°, {(mission.launch?.longitude ?? 44.11).toFixed(4)}°</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Rail Orient</span>
                <span className="text-slate-200 font-mono">Attitude: {(mission.initial_conditions?.attitude_degrees ?? [0,0,0]).join(', ')}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Target</span>
                <span className="text-slate-200 font-mono">Range: {(mission.target?.range_m ?? 10000)}m, Brg: {(mission.target?.bearing_deg ?? 0)}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
            <h3 className="font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-400" /> Environment
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Wind Model</label>
                <select 
                  value={windModel}
                  onChange={e => setWindModel(e.target.value)}
                  disabled={telemetry.isSimRunning}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                >
                  <option value="Standard">Standard (Constant)</option>
                  <option value="Turbulence">Turbulence (MIL-F-8785C)</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Atmosphere</label>
                <select 
                  value={atmosphere}
                  onChange={e => setAtmosphere(e.target.value)}
                  disabled={telemetry.isSimRunning}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                >
                  <option value="US Standard 1976">US Standard 1976</option>
                  <option value="NRLMSISE-00">NRLMSISE-00 (High Alt)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-red-400"><AlertOctagon className="w-4 h-4" /> Fault Injection</h3>
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 p-2 bg-slate-800/50 rounded border border-slate-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={faultServoJam} 
                  onChange={e => setFaultServoJam(e.target.checked)}
                  disabled={telemetry.isSimRunning} 
                  className="accent-red-500" 
                /> 
                <span>Servo 2 Jam at T+15s</span>
              </label>
              <label className="flex items-center gap-2 p-2 bg-slate-800/50 rounded border border-slate-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={faultGpsLoss} 
                  onChange={e => setFaultGpsLoss(e.target.checked)}
                  disabled={telemetry.isSimRunning} 
                  className="accent-red-500" 
                /> 
                <span>GPS Loss at T+40s</span>
              </label>
            </div>
          </div>
        </div>

        {/* Main View */}
        <div className="col-span-3 bg-slate-900/40 border border-slate-700/50 rounded-xl flex flex-col overflow-hidden relative shadow-2xl backdrop-blur-sm">
          <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/30">
            <div className="flex gap-4">
              <button 
                onClick={handleStartSim}
                disabled={telemetry.isSimRunning || loading}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/30 px-5 py-2.5 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:shadow-none"
              >
                {loading && !activeRunId ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Play className="w-5 h-5 fill-current" />
                )}
                Start Physics Run
              </button>
              <button 
                onClick={handleStopSim}
                disabled={!telemetry.isSimRunning || loading}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/30 px-5 py-2.5 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] disabled:shadow-none"
              >
                {loading && activeRunId ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Square className="w-5 h-5 fill-current" />
                )}
                Stop / Abort
              </button>
            </div>
            <div className="font-mono text-xl tracking-wider text-slate-300">
              T+ {telemetry.time.toFixed(2)}s
            </div>
          </div>

          <div className="flex-1 p-6 flex flex-col justify-center relative">
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
              <BarChart2 className="w-64 h-64 text-white" />
            </div>

            <div className="relative z-10 w-full max-w-2xl mx-auto space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2 font-medium">
                  <span className="text-blue-400 flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
                    Flight Phase: {telemetry.phase || 'PRELAUNCH'}
                  </span>
                  <span className="text-slate-400 font-mono">{progressPct.toFixed(1)}%</span>
                </div>
                
                <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner border border-slate-700">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(56,189,248,0.5)]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Dynamic Telemetry Stats */}
              <div className="grid grid-cols-3 gap-4 text-center font-mono">
                <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 shadow-md">
                  <div className="text-slate-500 text-xs mb-1 uppercase font-semibold tracking-wider">MACH</div>
                  <div className="text-2xl text-blue-300 font-bold">{telemetry.mach.toFixed(2)}</div>
                </div>
                <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 shadow-md">
                  <div className="text-slate-500 text-xs mb-1 uppercase font-semibold tracking-wider">ALTITUDE</div>
                  <div className="text-2xl text-emerald-300 font-bold">{telemetry.altitude.toFixed(1)} m</div>
                </div>
                <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 shadow-md">
                  <div className="text-slate-500 text-xs mb-1 uppercase font-semibold tracking-wider">Q (Dynamic Pressure)</div>
                  <div className="text-2xl text-orange-300 font-bold">{(telemetry.q / 1000).toFixed(2)} kPa</div>
                </div>
              </div>

              {/* High-speed uPlot time-series */}
              <div className="relative border border-slate-800 rounded-xl bg-slate-950/20 p-4 overflow-hidden flex flex-col justify-center">
                <div className="text-[10px] text-slate-500 mb-2 uppercase font-mono tracking-wider font-semibold">Live Simulation Flight Telemetry (uPlot)</div>
                <div ref={chartContainerRef} className="w-full h-[160px]" />
              </div>

              {/* Extra telemetry parameters */}
              <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-slate-800/20 border border-slate-800 p-4 rounded-lg">
                <div className="flex justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-slate-500 font-semibold uppercase">Velocity:</span>
                  <span className="text-slate-300 font-bold">{telemetry.velocity.toFixed(2)} m/s</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-slate-500 font-semibold uppercase">Current Phase:</span>
                  <span className="text-slate-300 font-bold">{telemetry.phase}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500 font-semibold uppercase">Attitude (Pitch/Yaw/Roll):</span>
                  <span className="text-slate-300 font-bold">
                    {telemetry.attitude.pitch.toFixed(1)}° / {telemetry.attitude.yaw.toFixed(1)}° / {telemetry.attitude.roll.toFixed(1)}°
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500 font-semibold uppercase">Actuators Active:</span>
                  <span className="text-slate-300 font-bold">
                    {Object.keys(telemetry.actuators).length} Active
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
