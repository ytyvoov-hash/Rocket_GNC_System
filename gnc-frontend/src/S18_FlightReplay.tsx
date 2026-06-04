import React from 'react';
import { Film, FastForward, Pause, RotateCcw } from 'lucide-react';

export default function S18_FlightReplay() {
  return (
    <div className="h-full flex flex-col space-y-6">
      <header className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
            <Film className="w-8 h-8 text-blue-500" /> Flight Replay
          </h1>
          <p className="text-slate-400">Review historical telemetry datasets synced with the 3D Viewer.</p>
        </div>
        <div className="font-mono text-slate-300 bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
          DATASET: FL-2026-05-10.tlm
        </div>
      </header>

      <div className="flex-1 bg-slate-900/40 border border-slate-700/50 rounded-xl overflow-hidden flex flex-col">
        {/* Fake 3D / Graph Area */}
        <div className="flex-1 p-6 relative flex items-center justify-center bg-black">
           <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.4)_0,transparent_100%)]" />
           <p className="text-slate-500 font-mono">3D Replay Scene Linked to Telemetry File</p>
        </div>

        {/* Playback Controls */}
        <div className="p-6 border-t border-slate-700/50 bg-slate-800/30">
          <div className="flex justify-between text-xs font-mono text-slate-400 mb-2">
            <span>T- 00:00.00</span>
            <span>T+ 12:45.00</span>
          </div>
          <div className="w-full h-2 bg-slate-700 rounded-full mb-6 cursor-pointer">
            <div className="w-1/3 h-full bg-blue-500 rounded-full relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow" />
            </div>
          </div>

          <div className="flex justify-center items-center gap-6">
            <button className="text-slate-400 hover:text-white transition-colors"><RotateCcw className="w-6 h-6" /></button>
            <button className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-500 transition-colors shadow-[0_0_20px_rgba(37,99,235,0.4)]">
              <Pause className="w-6 h-6 fill-current" />
            </button>
            <button className="text-slate-400 hover:text-white transition-colors"><FastForward className="w-6 h-6" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
