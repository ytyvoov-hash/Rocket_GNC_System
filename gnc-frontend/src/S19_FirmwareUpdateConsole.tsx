import React from 'react';
import { Upload, Cpu, Smartphone } from 'lucide-react';

export default function S19_FirmwareUpdateConsole() {
  return (
    <div className="h-full flex flex-col space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Firmware Update Console</h1>
        <p className="text-slate-400">Flash STM32 binaries and update Android Path A APKs over the air.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-blue-500/50 transition-colors cursor-pointer group">
          <Cpu className="w-16 h-16 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
          <h2 className="text-2xl font-bold mb-2">Path B (STM32)</h2>
          <p className="text-slate-400 mb-6 max-w-sm">Upload `.bin` or `.hex` compiled firmware for the 200Hz baremetal control loop.</p>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-6 py-2.5 rounded-lg font-bold shadow-[0_0_15px_rgba(37,99,235,0.3)]">
            <Upload className="w-4 h-4" /> Select Firmware
          </button>
        </div>

        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-emerald-500/50 transition-colors cursor-pointer group">
          <Smartphone className="w-16 h-16 text-emerald-500 mb-4 group-hover:scale-110 transition-transform" />
          <h2 className="text-2xl font-bold mb-2">Path A (Android)</h2>
          <p className="text-slate-400 mb-6 max-w-sm">Upload `.apk` for the Snapdragon 100Hz Android Open Source Project app.</p>
          <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-6 py-2.5 rounded-lg font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <Upload className="w-4 h-4" /> Select APK
          </button>
        </div>
      </div>
    </div>
  );
}
