import React, { useState } from 'react';
import { Layers, Play, Settings2, BarChart } from 'lucide-react';

export default function S11_MonteCarlo() {
  const [runs, setRuns] = useState(100);

  return (
    <div className="h-full flex flex-col space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Monte Carlo Runner</h1>
        <p className="text-slate-400">Statistical flight batches, parameter dispersion, and envelope plotting.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="col-span-1 space-y-4">
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Settings2 className="w-5 h-5 text-purple-400" /> Dispersion Settings</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Number of Runs</label>
                <input type="number" value={runs} onChange={e => setRuns(parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white" />
              </div>

              <div className="border-t border-slate-700 pt-4 space-y-3">
                <label className="flex justify-between text-sm items-center">
                  <span className="text-slate-300">Mass Uncertainty (±%)</span>
                  <input type="number" defaultValue={5} className="w-16 bg-slate-800 border border-slate-700 rounded p-1 text-center text-white" />
                </label>
                <label className="flex justify-between text-sm items-center">
                  <span className="text-slate-300">Thrust Variance (±%)</span>
                  <input type="number" defaultValue={2.5} className="w-16 bg-slate-800 border border-slate-700 rounded p-1 text-center text-white" />
                </label>
                <label className="flex justify-between text-sm items-center">
                  <span className="text-slate-300">Wind Gust (m/s)</span>
                  <input type="number" defaultValue={10} className="w-16 bg-slate-800 border border-slate-700 rounded p-1 text-center text-white" />
                </label>
              </div>

              <button className="w-full mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 py-3 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(147,51,234,0.3)]">
                <Play className="w-5 h-5 fill-current" /> Execute Batch
              </button>
            </div>
          </div>
        </div>

        <div className="col-span-2 bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 flex flex-col relative overflow-hidden">
          <h3 className="font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2"><BarChart className="w-5 h-5 text-blue-400" /> Ground Trace Envelope (Dispersion)</h3>
          
          <div className="flex-1 bg-slate-800/30 border border-slate-700/50 rounded relative p-4 flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px]" />
            {/* Fake Dispersion Cloud */}
            <svg viewBox="0 0 100 100" className="w-full h-full relative z-10 preserve-3d overflow-visible stroke-purple-500/30" fill="none">
              {Array.from({ length: 50 }).map((_, i) => (
                <path key={i} d={`M 50,90 Q ${30 + Math.random() * 40},40 ${40 + Math.random() * 20},10`} className="stroke-[0.2]" />
              ))}
              {/* Nominal Trajectory */}
              <path d="M 50,90 Q 50,40 50,10" className="stroke-blue-500 stroke-[1]" />
            </svg>
            <div className="absolute bottom-4 right-4 bg-slate-900 border border-slate-700 p-3 rounded text-xs">
              <div className="flex items-center gap-2 mb-1"><div className="w-3 h-0.5 bg-blue-500" /> Nominal</div>
              <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-purple-500/50" /> 3-Sigma Bound</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
