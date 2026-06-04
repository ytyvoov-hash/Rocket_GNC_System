const fs = require('fs');
const file = 'm:/2026-5-18gnc-2/2026-5-18gnc-2/project_GNC-V6.0/gnc-frontend/src/S6c_SimFull.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Imports
content = content.replace(`import { Play, Square, Settings2, BarChart2, AlertOctagon, RefreshCw, Cpu, Layers, Box, ShieldAlert, Activity, Download } from 'lucide-react';`, `import { Play, Square, Settings2, BarChart2, AlertOctagon, RefreshCw, Cpu, Layers, Box, ShieldAlert, Activity, Download, ChevronDown, ChevronUp } from 'lucide-react';`);

// 2. Refs
content = content.replace(
`  const kinChartRef = useRef<HTMLDivElement>(null);
  const attChartRef = useRef<HTMLDivElement>(null);
  const aeroChartRef = useRef<HTMLDivElement>(null);
  
  const kinPlotRef = useRef<uPlot | null>(null);
  const attPlotRef = useRef<uPlot | null>(null);
  const aeroPlotRef = useRef<uPlot | null>(null);

  const historyRef = useRef<{ 
    t: number[]; alt: number[]; vel: number[]; mach: number[]; q: number[];
    pitch: number[]; yaw: number[]; roll: number[]; phase: string[];
  }>({
    t: [], alt: [], vel: [], mach: [], q: [], pitch: [], yaw: [], roll: [], phase: []
  });`,
`  const kinChartRef = useRef<HTMLDivElement>(null);
  const attChartRef = useRef<HTMLDivElement>(null);
  const aeroChartRef = useRef<HTMLDivElement>(null);
  const cmdChartRef = useRef<HTMLDivElement>(null);
  
  const kinPlotRef = useRef<uPlot | null>(null);
  const attPlotRef = useRef<uPlot | null>(null);
  const aeroPlotRef = useRef<uPlot | null>(null);
  const cmdPlotRef = useRef<uPlot | null>(null);

  const historyRef = useRef<{ 
    t: number[]; alt: number[]; vel: number[]; mach: number[]; q: number[];
    pitch: number[]; yaw: number[]; roll: number[]; phase: string[];
    act0: number[]; act1: number[]; act2: number[]; act3: number[];
  }>({
    t: [], alt: [], vel: [], mach: [], q: [], pitch: [], yaw: [], roll: [], phase: [],
    act0: [], act1: [], act2: [], act3: []
  });`
);

// 3. State
content = content.replace(
`  const [gravity, setGravity] = useState(9.81);
  const [tEnd, setTEnd] = useState(120);

  // Editable Mission Config Overrides
  const [launchLat, setLaunchLat] = useState(mission.launch?.latitude ?? 16.45);
  const [launchLon, setLaunchLon] = useState(mission.launch?.longitude ?? 44.11);
  const [launchAlt, setLaunchAlt] = useState(mission.launch?.altitude ?? 0);
  
  const [targetRange, setTargetRange] = useState(mission.target?.range_m ?? 10000);
  const [targetBearing, setTargetBearing] = useState(mission.target?.bearing_deg ?? 0);
  const [targetAlt, setTargetAlt] = useState(mission.target?.altitude ?? 0);

  // Extra environment selections
  const [windModel, setWindModel] = useState('Standard');
  const [atmosphere, setAtmosphere] = useState('US Standard 1976');
  const [faultServoJam, setFaultServoJam] = useState(false);
  const [faultGpsLoss, setFaultGpsLoss] = useState(false);`,
`  const [gravity, setGravity] = useState(9.81);
  const [tEnd, setTEnd] = useState(120);

  // Editable Mission Config Overrides
  const [launchAngle, setLaunchAngle] = useState(90);
  const [launchLat, setLaunchLat] = useState(mission.launch?.latitude ?? 16.45);
  const [launchLon, setLaunchLon] = useState(mission.launch?.longitude ?? 44.11);
  const [launchAlt, setLaunchAlt] = useState(mission.launch?.altitude ?? 0);
  
  const [targetRange, setTargetRange] = useState(mission.target?.range_m ?? 10000);
  const [targetBearing, setTargetBearing] = useState(mission.target?.bearing_deg ?? 0);
  const [targetAlt, setTargetAlt] = useState(mission.target?.altitude ?? 0);

  // Accordion state
  const [showLaunchSite, setShowLaunchSite] = useState(true);
  const [showTargetInfo, setShowTargetInfo] = useState(true);`
);

// 4. useEffect history logic
content = content.replace(
`  // Update uPlot history buffer on telemetry updates
  useEffect(() => {
    if (telemetry.time === 0) {
      historyRef.current = { t: [], alt: [], vel: [], mach: [], q: [], pitch: [], yaw: [], roll: [], phase: [] };
      const empty: uPlot.AlignedData = [[0], [0], [0]];
      kinPlotRef.current?.setData(empty);
      attPlotRef.current?.setData([[0], [0], [0], [0]]);
      aeroPlotRef.current?.setData(empty);
      return;
    }
    const hist = historyRef.current;
    if (hist.t.length > 0 && hist.t[hist.t.length - 1] === telemetry.time) {
      return;
    }
    hist.t.push(telemetry.time);
    hist.alt.push(telemetry.altitude);
    hist.vel.push(telemetry.velocity);
    hist.mach.push(telemetry.mach);
    hist.q.push(telemetry.q / 1000); // kPa
    hist.pitch.push(telemetry.attitude.pitch);
    hist.yaw.push(telemetry.attitude.yaw);
    hist.roll.push(telemetry.attitude.roll);
    hist.phase.push(telemetry.dynamicPhase || telemetry.phase || 'PRELAUNCH');

    // Keep full history in memory for CSV, but limit plot rendering to last N points for performance
    const plotSliceLen = 500;
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
  }, [telemetry.time, telemetry.altitude, telemetry.velocity, telemetry.mach, telemetry.q, telemetry.attitude, telemetry.phase, telemetry.dynamicPhase]);`,
`  // Update uPlot history buffer on telemetry updates
  useEffect(() => {
    if (telemetry.time === 0) {
      historyRef.current = { t: [], alt: [], vel: [], mach: [], q: [], pitch: [], yaw: [], roll: [], phase: [], act0: [], act1: [], act2: [], act3: [] };
      const empty: uPlot.AlignedData = [[0], [0], [0]];
      kinPlotRef.current?.setData(empty);
      attPlotRef.current?.setData([[0], [0], [0], [0]]);
      aeroPlotRef.current?.setData(empty);
      cmdPlotRef.current?.setData([[0], [0], [0], [0], [0]]);
      return;
    }
    const hist = historyRef.current;
    if (hist.t.length > 0 && hist.t[hist.t.length - 1] === telemetry.time) {
      return;
    }
    hist.t.push(telemetry.time);
    hist.alt.push(telemetry.altitude);
    hist.vel.push(telemetry.velocity);
    hist.mach.push(telemetry.mach);
    hist.q.push(telemetry.q / 1000); // kPa
    hist.pitch.push(telemetry.attitude.pitch);
    hist.yaw.push(telemetry.attitude.yaw);
    hist.roll.push(telemetry.attitude.roll);
    hist.phase.push(telemetry.dynamicPhase || telemetry.phase || 'PRELAUNCH');
    hist.act0.push(telemetry.actuators?.['0'] || 0);
    hist.act1.push(telemetry.actuators?.['1'] || 0);
    hist.act2.push(telemetry.actuators?.['2'] || 0);
    hist.act3.push(telemetry.actuators?.['3'] || 0);

    // Keep full history in memory for CSV, but limit plot rendering to last N points for performance
    const plotSliceLen = 500;
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
  }, [telemetry.time, telemetry.altitude, telemetry.velocity, telemetry.mach, telemetry.q, telemetry.attitude, telemetry.phase, telemetry.dynamicPhase, telemetry.actuators]);`
);

// 5. uPlot Instances
content = content.replace(
`    const aeroOpts: uPlot.Options = {
      ...commonOpts,
      width: aeroChartRef.current.clientWidth,
      series: [
        { label: 'Time' },
        { label: 'Mach', stroke: '#eab308', width: 2 },
        { label: 'Q(kPa)', stroke: '#06b6d4', width: 2 },
      ]
    };

    kinPlotRef.current = new uPlot(kinOpts, [[0], [0], [0]], kinChartRef.current);
    attPlotRef.current = new uPlot(attOpts, [[0], [0], [0], [0]], attChartRef.current);
    aeroPlotRef.current = new uPlot(aeroOpts, [[0], [0], [0]], aeroChartRef.current);

    const handleResize = () => {
      kinPlotRef.current?.setSize({ width: kinChartRef.current!.clientWidth, height: 120 });
      attPlotRef.current?.setSize({ width: attChartRef.current!.clientWidth, height: 120 });
      aeroPlotRef.current?.setSize({ width: aeroChartRef.current!.clientWidth, height: 120 });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      kinPlotRef.current?.destroy();
      attPlotRef.current?.destroy();
      aeroPlotRef.current?.destroy();
    };
  }, []);`,
`    const aeroOpts: uPlot.Options = {
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
      kinPlotRef.current?.setSize({ width: kinChartRef.current!.clientWidth, height: 120 });
      attPlotRef.current?.setSize({ width: attChartRef.current!.clientWidth, height: 120 });
      aeroPlotRef.current?.setSize({ width: aeroChartRef.current!.clientWidth, height: 120 });
      cmdPlotRef.current?.setSize({ width: cmdChartRef.current!.clientWidth, height: 120 });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      kinPlotRef.current?.destroy();
      attPlotRef.current?.destroy();
      aeroPlotRef.current?.destroy();
      cmdPlotRef.current?.destroy();
    };
  }, []);`
);

// 6. Payload Math
content = content.replace(
`          initial_conditions: {
            ...mission.initial_conditions,
            position: [0, 0, -(Number(launchAlt) || 0)],
            attitude: [0.7071068, 0.0, 0.7071068, 0.0]
          },
          launch: { latitude: Number(launchLat) || 0, longitude: Number(launchLon) || 0, altitude: Number(launchAlt) || 0 },
          target: { range_m: Number(targetRange) || 0, bearing_deg: Number(targetBearing) || 0, altitude: Number(targetAlt) || 0 }
        },
        metadata: {
          windModel,
          atmosphere,
          faults: { servoJam: faultServoJam, gpsLoss: faultGpsLoss }
        }
      };`,
`          initial_conditions: {
            ...mission.initial_conditions,
            position: [0, 0, -(Number(launchAlt) || 0)],
            attitude: [
              Math.cos((Number(launchAngle) || 90) * Math.PI / 180 / 2),
              0.0,
              Math.sin((Number(launchAngle) || 90) * Math.PI / 180 / 2),
              0.0
            ]
          },
          launch: { latitude: Number(launchLat) || 0, longitude: Number(launchLon) || 0, altitude: Number(launchAlt) || 0 },
          target: { range_m: Number(targetRange) || 0, bearing_deg: Number(targetBearing) || 0, altitude: Number(targetAlt) || 0 }
        },
        metadata: {}
      };`
);

// 7. Sidebar and Main UI Redesign
const sidebarTarget = \`            {/* Sidebar Controls */}
            <div className="col-span-1 space-y-6 flex flex-col max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
              
              {/* Launch Site */}
              <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
                <h3 className="font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-slate-400" /> Launch Site Overrides
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Latitude</label>
                    <input type="number" step="0.0001" value={launchLat} onChange={e => setLaunchLat(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Longitude</label>
                    <input type="number" step="0.0001" value={launchLon} onChange={e => setLaunchLon(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Altitude (m ASL)</label>
                    <input type="number" step="1" value={launchAlt} onChange={e => setLaunchAlt(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                  </div>
                </div>
              </div>

              {/* Target Info */}
              <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
                <h3 className="font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-slate-400" /> Target Info
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Range (m)</label>
                    <input type="number" step="1" value={targetRange} onChange={e => setTargetRange(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Bearing (A°)</label>
                    <input type="number" step="1" value={targetBearing} onChange={e => setTargetBearing(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Target Altitude (m)</label>
                    <input type="number" step="1" value={targetAlt} onChange={e => setTargetAlt(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                  </div>
                </div>
              </div>

              {/* Environment */}
              <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
                <h3 className="font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-400" /> Environment
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Wind Model</label>
                    <select value={windModel} onChange={e => setWindModel(e.target.value)} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200">
                      <option value="Standard">Standard (Constant)</option>
                      <option value="Turbulence">Turbulence (MIL-F-8785C)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Atmosphere</label>
                    <select value={atmosphere} onChange={e => setAtmosphere(e.target.value)} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200">
                      <option value="US Standard 1976">US Standard 1976</option>
                      <option value="NRLMSISE-00">NRLMSISE-00 (High Alt)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Main View Grid */}
            <div className="col-span-3 bg-slate-900/40 border border-slate-700/50 rounded-xl flex flex-col overflow-hidden relative shadow-2xl backdrop-blur-sm">
              <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/30">
                <div className="flex gap-4">
                  <button 
                    onClick={handleStartSim}
                    disabled={telemetry.isSimRunning || loading}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/30 px-5 py-2.5 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:shadow-none"
                  >
                    {loading && !activeRunId ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                    Start Physics Run
                  </button>
                  <button 
                    onClick={handleStopSim}
                    disabled={!telemetry.isSimRunning || loading}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/30 px-5 py-2.5 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] disabled:shadow-none"
                  >
                    {loading && activeRunId ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Square className="w-5 h-5 fill-current" />}
                    Stop / Abort
                  </button>
                  <button
                    onClick={handleDownloadLog}
                    disabled={historyRef.current.t.length === 0}
                    className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 px-5 py-2.5 rounded-lg font-bold transition-all"
                  >
                    <Download className="w-5 h-5" />
                    Download Log (CSV)
                  </button>
                </div>
                <div className="font-mono text-xl tracking-wider text-slate-300">
                  T+ {telemetry.time.toFixed(2)}s
                </div>
              </div>\`;

const sidebarReplacement = \`            {/* Sidebar Controls */}
            <div className="col-span-1 space-y-6 flex flex-col max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
              
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

              {/* Launch Site */}
              <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
                <button 
                  onClick={() => setShowLaunchSite(!showLaunchSite)}
                  className="w-full font-semibold flex justify-between items-center outline-none text-left"
                >
                  <div className="flex items-center gap-2"><Settings2 className="w-4 h-4 text-slate-400" /> Launch Site</div>
                  {showLaunchSite ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {showLaunchSite && (
                  <div className="space-y-3 text-xs mt-4 border-t border-slate-800 pt-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Launch Angle (deg)</label>
                      <input type="number" step="1" value={launchAngle} onChange={e => setLaunchAngle(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Latitude</label>
                      <input type="number" step="0.0001" value={launchLat} onChange={e => setLaunchLat(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Longitude</label>
                      <input type="number" step="0.0001" value={launchLon} onChange={e => setLaunchLon(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Altitude (m ASL)</label>
                      <input type="number" step="1" value={launchAlt} onChange={e => setLaunchAlt(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                  </div>
                )}
              </div>

              {/* Target Info */}
              <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 shadow-lg backdrop-blur-sm">
                <button 
                  onClick={() => setShowTargetInfo(!showTargetInfo)}
                  className="w-full font-semibold flex justify-between items-center outline-none text-left"
                >
                  <div className="flex items-center gap-2"><Settings2 className="w-4 h-4 text-slate-400" /> Target Info</div>
                  {showTargetInfo ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {showTargetInfo && (
                  <div className="space-y-3 text-xs mt-4 border-t border-slate-800 pt-3">
                    <div>
                      <label className="text-slate-400 block mb-1">Range (m)</label>
                      <input type="number" step="1" value={targetRange} onChange={e => setTargetRange(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Bearing (A°)</label>
                      <input type="number" step="1" value={targetBearing} onChange={e => setTargetBearing(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">Target Altitude (m)</label>
                      <input type="number" step="1" value={targetAlt} onChange={e => setTargetAlt(parseFloat(e.target.value))} disabled={telemetry.isSimRunning} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Main View Grid */}
            <div className="col-span-3 bg-slate-900/40 border border-slate-700/50 rounded-xl flex flex-col overflow-hidden relative shadow-2xl backdrop-blur-sm">
              <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/30">
                <div className="font-semibold text-slate-200 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  Live Telemetry
                </div>
                <div className="font-mono text-xl tracking-wider text-slate-300">
                  T+ {telemetry.time.toFixed(2)}s
                </div>
              </div>\`;
content = content.replace(sidebarTarget, sidebarReplacement);

// 8. Charts Grid
content = content.replace(
\`<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-3 overflow-hidden flex flex-col">
                    <div className="text-[10px] text-slate-400 mb-2 uppercase font-mono font-semibold text-center border-b border-slate-800 pb-1">Kinematics</div>
                    <div ref={kinChartRef} className="w-full flex-1 min-h-[120px]" />
                  </div>
                  <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-3 overflow-hidden flex flex-col">
                    <div className="text-[10px] text-slate-400 mb-2 uppercase font-mono font-semibold text-center border-b border-slate-800 pb-1">Attitude</div>
                    <div ref={attChartRef} className="w-full flex-1 min-h-[120px]" />
                  </div>
                  <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-3 overflow-hidden flex flex-col">
                    <div className="text-[10px] text-slate-400 mb-2 uppercase font-mono font-semibold text-center border-b border-slate-800 pb-1">Aerodynamics</div>
                    <div ref={aeroChartRef} className="w-full flex-1 min-h-[120px]" />
                  </div>
                </div>\`,
\`<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-3 overflow-hidden flex flex-col">
                    <div className="text-[10px] text-slate-400 mb-2 uppercase font-mono font-semibold text-center border-b border-slate-800 pb-1">Kinematics</div>
                    <div ref={kinChartRef} className="w-full flex-1 min-h-[120px]" />
                  </div>
                  <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-3 overflow-hidden flex flex-col">
                    <div className="text-[10px] text-slate-400 mb-2 uppercase font-mono font-semibold text-center border-b border-slate-800 pb-1">Attitude</div>
                    <div ref={attChartRef} className="w-full flex-1 min-h-[120px]" />
                  </div>
                  <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-3 overflow-hidden flex flex-col">
                    <div className="text-[10px] text-slate-400 mb-2 uppercase font-mono font-semibold text-center border-b border-slate-800 pb-1">Aerodynamics</div>
                    <div ref={aeroChartRef} className="w-full flex-1 min-h-[120px]" />
                  </div>
                  <div className="border border-slate-800 rounded-xl bg-slate-950/40 p-3 overflow-hidden flex flex-col">
                    <div className="text-[10px] text-slate-400 mb-2 uppercase font-mono font-semibold text-center border-b border-slate-800 pb-1">Command & Response (Actuators)</div>
                    <div ref={cmdChartRef} className="w-full flex-1 min-h-[120px]" />
                  </div>
                </div>\`
);

fs.writeFileSync(file, content);
