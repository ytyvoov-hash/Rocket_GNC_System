import sys
import re

with open(r'm:\2026-5-18gnc-2\2026-5-18gnc-2\project_GNC-V6.0\gnc-frontend\src\S6a_Sim3DOF.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Imports
code = code.replace(
    "import { Play, Square, Settings2, BarChart2, AlertOctagon, RefreshCw, Cpu, Layers, Box, ShieldAlert, Activity, Download, ChevronDown, ChevronUp } from 'lucide-react';",
    "import { Play, Pause, Square, Settings2, BarChart2, AlertOctagon, RefreshCw, Cpu, Layers, Box, ShieldAlert, Activity, Download, ChevronDown, ChevronUp } from 'lucide-react';"
)

# 2. Add history variables for posX, posY
code = code.replace(
    "t: number[], alt: number[], vel: number[], mach: number[], q: number[], pitch: number[], yaw: number[], roll: number[], phase: string[], act0: number[], act1: number[], act2: number[], act3: number[], groundRange: number[]",
    "t: number[], alt: number[], vel: number[], mach: number[], q: number[], pitch: number[], yaw: number[], roll: number[], phase: string[], act0: number[], act1: number[], act2: number[], act3: number[], groundRange: number[], posX: number[], posY: number[]"
)
code = code.replace(
    "act0: [], act1: [], act2: [], act3: [], groundRange: []",
    "act0: [], act1: [], act2: [], act3: [], groundRange: [], posX: [], posY: []"
)
code = code.replace(
    "historyRef.current = { t: [], alt: [], vel: [], mach: [], q: [], pitch: [], yaw: [], roll: [], phase: [], act0: [], act1: [], act2: [], act3: [], groundRange: [] };",
    "historyRef.current = { t: [], alt: [], vel: [], mach: [], q: [], pitch: [], yaw: [], roll: [], phase: [], act0: [], act1: [], act2: [], act3: [], groundRange: [], posX: [], posY: [] };"
)

# 3. Add to history block
code = code.replace(
    "    hist.alt.push(telemetry.altitude);\n    hist.vel.push(telemetry.velocity);",
    "    hist.alt.push(telemetry.altitude);\n    hist.vel.push(telemetry.velocity);\n    hist.posX.push(telemetry.posX);\n    hist.posY.push(telemetry.posY);"
)

# 4. State
state_block = """  const progressPct = Math.min((telemetry.time / tEnd) * 100, 100);

  const [showPhysics, setShowPhysics] = useState(true);

  // --- REPLAY STATE ---
  const [activeTab, setActiveTab] = useState<'physics' | 'replay'>('physics');
  const [replayState, setReplayState] = useState<'stopped' | 'playing' | 'paused'>('stopped');
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [replayTime, setReplayTime] = useState<number>(0);
  const [replayFrame, setReplayFrame] = useState({ altitude: 0, posX: 0, posY: 0, attitude: { pitch: 90, yaw: 0, roll: 0 } });

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
"""
code = code.replace("  const progressPct = Math.min((telemetry.time / tEnd) * 100, 100);\n\n  const [showPhysics, setShowPhysics] = useState(true);", state_block)

# 5. UI replacements
# Add tabs to header
tabs_html = """
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
"""
code = code.replace(
    "            {/* Main View Grid */}\n            <div className=\"col-span-3 bg-slate-900/80 border border-slate-700/50 rounded-xl flex flex-col overflow-hidden shadow-2xl\">\n              <div className=\"p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/60\">\n                <div className=\"font-semibold text-slate-200 flex items-center gap-2\">\n                  <Activity className=\"w-5 h-5 text-blue-400\" />\n                  Live Telemetry\n                </div>\n                <div className=\"font-mono text-xl tracking-wider text-slate-300\">\n                  T+ {telemetry.time.toFixed(2)}s\n                </div>\n              </div>",
    tabs_html
)

# 6. Tab Content Switch
tab_content_start = """
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
"""
code = code.replace("              <div className=\"flex-1 p-6 flex flex-col justify-center relative space-y-6\">", tab_content_start)

# End of physics tab and start of replay tab
tab_content_end = """
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
                        <button onClick={() => { setReplayState('stopped'); setReplayTime(0); setReplayFrame({ altitude: 0, posX: 0, posY: 0, attitude: { pitch: 90, yaw: 0, roll: 0 } }); }} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"><Square className="w-4 h-4 fill-current" /></button>
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
"""

# Replace the 3D Viewer block
code = code.replace(
    """                {/* 3D Telemetry Viewer */}
                <div className="h-[600px] rounded-xl overflow-hidden relative border border-slate-700/50 shadow-inner mb-6">
                  <RealisticFlightView launchAlt={launchAlt} />
                </div>""",
    ""
)

# Insert the end of tab content at the bottom of the grid
code = code.replace(
    """                  </div>
                </div>

              </div>
            </div>""",
    """                  </div>
                </div>
""" + tab_content_end + """
              </div>
            </div>"""
)

with open(r'm:\2026-5-18gnc-2\2026-5-18gnc-2\project_GNC-V6.0\gnc-frontend\src\S6a_Sim3DOF.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print('Success')
