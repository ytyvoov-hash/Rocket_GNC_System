import React from 'react';
import { Search, Download, FileText } from 'lucide-react';

export default function S17_PostFlightAnalysis() {
  return (
    <div className="h-full flex flex-col space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Post-Flight Analysis</h1>
        <p className="text-slate-400">Review and export downloaded 101-column flight logs.</p>
      </header>

      <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl flex flex-col overflow-hidden flex-1">
        <div className="p-4 border-b border-slate-700/50 bg-slate-800/30 flex justify-between items-center">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="Search variables..." className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
          </div>
          <button className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded text-sm transition-colors">
            <Download className="w-4 h-4" /> Export Parquet
          </button>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider sticky top-0">
                <th className="px-6 py-3 font-medium">Timestamp</th>
                <th className="px-6 py-3 font-medium">State</th>
                <th className="px-6 py-3 font-medium">Alt (m)</th>
                <th className="px-6 py-3 font-medium">Vel_N (m/s)</th>
                <th className="px-6 py-3 font-medium">Vel_E (m/s)</th>
                <th className="px-6 py-3 font-medium">Vel_D (m/s)</th>
                <th className="px-6 py-3 font-medium">Roll (rad)</th>
                <th className="px-6 py-3 font-medium">Pitch (rad)</th>
                <th className="px-6 py-3 font-medium">... (+93 cols)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 font-mono text-sm text-slate-300">
              {Array.from({ length: 20 }).map((_, i) => (
                <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-2 text-slate-500">12.0{i}5</td>
                  <td className="px-6 py-2 text-blue-400">BOOST</td>
                  <td className="px-6 py-2 text-emerald-400">{1200 + i * 45}</td>
                  <td className="px-6 py-2">{240 + i * 2}</td>
                  <td className="px-6 py-2">{10 + i * 0.1}</td>
                  <td className="px-6 py-2">-{(240 + i * 2)}</td>
                  <td className="px-6 py-2">0.01{i}</td>
                  <td className="px-6 py-2">1.5{i}</td>
                  <td className="px-6 py-2 text-slate-600">...</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
