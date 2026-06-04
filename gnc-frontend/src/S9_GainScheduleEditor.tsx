import React from 'react';
import { Grid3x3, Activity } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

export default function S9_GainScheduleEditor({ isEmbedded }: { isEmbedded?: boolean }) {
  const { t } = useTranslation();
  const machPoints = [0.3, 0.8, 1.2, 2.0, 3.5, 5.0];
  const altPoints = [0, 5000, 15000, 30000, 50000];

  return (
    <div className={clsx("h-full flex flex-col", !isEmbedded && "space-y-6")}>
      {!isEmbedded && (
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">{t('gain_schedule.title')}</h1>
          <p className="text-slate-400">{t('gain_schedule.subtitle')}</p>
        </header>
      )}

      <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 flex-1 overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2"><Grid3x3 className="w-5 h-5 text-blue-400" /> Interpolation Grid (Kp)</h2>
          <select className="bg-slate-800 border border-slate-700 rounded p-2 text-sm text-slate-200">
            <option>Linear Interpolation</option>
            <option>Cubic Spline</option>
          </select>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-center border-collapse">
            <thead>
              <tr>
                <th className="p-3 border border-slate-700/50 bg-slate-800/50 text-slate-400 text-sm">Alt \ Mach</th>
                {machPoints.map(m => (
                  <th key={m} className="p-3 border border-slate-700/50 bg-slate-800/50 text-emerald-400 text-sm">M {m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {altPoints.map((alt) => (
                <tr key={alt}>
                  <td className="p-3 border border-slate-700/50 bg-slate-800/50 text-blue-400 text-sm font-mono">{alt} m</td>
                  {machPoints.map(m => {
                    // Generate a fake gain value for mockup
                    const val = (1.5 - (m * 0.1) + (alt * 0.00001)).toFixed(3);
                    return (
                      <td key={`${alt}-${m}`} className="p-0 border border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                        <input 
                          type="text" 
                          defaultValue={val} 
                          className="w-full h-full bg-transparent text-center p-3 text-white font-mono focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-blue-500" 
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
