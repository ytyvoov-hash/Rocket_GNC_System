import React from 'react';
import { Target, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

export default function S10_StabilityAnalysis({ isEmbedded }: { isEmbedded?: boolean }) {
  return (
    <div className={clsx("h-full flex flex-col", !isEmbedded && "space-y-6")}>
      {!isEmbedded && (
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Stability Analysis</h1>
          <p className="text-slate-400">Mathematical stability limits and robustness evaluation.</p>
        </header>
      )}

      <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 flex flex-col relative overflow-hidden">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-indigo-400" /> Root Locus</h2>
          <div className="flex-1 bg-slate-800/30 border border-slate-700/50 rounded relative p-4 flex items-center justify-center">
            {/* Fake Root Locus Graph */}
            <svg viewBox="0 0 100 100" className="w-full h-full preserve-3d overflow-visible stroke-indigo-500/50" fill="none">
              <line x1="50" y1="0" x2="50" y2="100" className="stroke-slate-600 stroke-[0.5]" />
              <line x1="0" y1="50" x2="100" y2="50" className="stroke-slate-600 stroke-[0.5]" />
              
              <path d="M 20,50 Q 30,20 50,10" className="stroke-[1]" />
              <path d="M 20,50 Q 30,80 50,90" className="stroke-[1]" />
              
              <circle cx="20" cy="50" r="1.5" className="fill-indigo-500" />
              <line x1="48" y1="48" x2="52" y2="52" className="stroke-red-500 stroke-[1]" />
              <line x1="48" y1="52" x2="52" y2="48" className="stroke-red-500 stroke-[1]" />
            </svg>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 flex flex-col relative overflow-hidden">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><TrendingDown className="w-5 h-5 text-emerald-400" /> Nyquist Plot</h2>
          <div className="flex-1 bg-slate-800/30 border border-slate-700/50 rounded relative p-4 flex items-center justify-center">
            {/* Fake Nyquist Graph */}
            <svg viewBox="0 0 100 100" className="w-full h-full preserve-3d overflow-visible stroke-emerald-500" fill="none">
              <line x1="50" y1="0" x2="50" y2="100" className="stroke-slate-600 stroke-[0.5]" />
              <line x1="0" y1="50" x2="100" y2="50" className="stroke-slate-600 stroke-[0.5]" />
              <circle cx="30" cy="50" r="1.5" className="fill-red-500 stroke-none" />
              
              <path d="M 50,50 C 70,10 90,40 50,80 C 10,40 30,10 50,50" className="stroke-[0.8]" />
            </svg>
            <div className="absolute top-4 right-4 text-xs font-mono text-slate-400">Encircles -1+j0: 0</div>
          </div>
        </div>
      </div>
    </div>
  );
}
