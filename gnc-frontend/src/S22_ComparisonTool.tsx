import { useState, useEffect, useRef } from 'react';
import { GitCompare, LineChart, FileSpreadsheet, Download, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export default function S22_ComparisonTool() {
  const { t, i18n } = useTranslation();
  const [selectedVar, setSelectedVar] = useState<'altitude' | 'velocity' | 'chamber_pressure' | 'pitch_error'>('altitude');
  const [activePreset, setActivePreset] = useState<'nominal' | 'wind_shear'>('nominal');
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<uPlot | null>(null);

  // Generate 60 seconds trajectory steps
  const steps = 60;
  const timeArray = Array.from({ length: steps }, (_, i) => i);

  // Core Physical telemetry generators
  const getTelemetryData = () => {
    let actVal: number[] = [];
    let simVal: number[] = [];

    if (selectedVar === 'altitude') {
      simVal = timeArray.map(t => 4200 * Math.sin((t * Math.PI) / 120));
      if (activePreset === 'nominal') {
        actVal = simVal.map(v => v * 0.99 - 10 + Math.random() * 5);
      } else {
        // Wind shear drop around T+25
        actVal = simVal.map((v, i) => {
          const drop = i >= 20 && i <= 35 ? 1 - 0.04 * Math.exp(-Math.pow(i - 25, 2) / 30) : 0.99;
          return v * drop - 15 + Math.random() * 8;
        });
      }
    } else if (selectedVar === 'velocity') {
      simVal = timeArray.map(t => 280 * Math.cos((t * Math.PI) / 120));
      if (activePreset === 'nominal') {
        actVal = simVal.map(v => v * 0.985 - 2 + Math.random() * 2);
      } else {
        actVal = simVal.map((v, i) => {
          const dragAnomaly = i >= 20 && i <= 35 ? -8 : 0;
          return v * 0.98 + dragAnomaly + Math.random() * 3;
        });
      }
    } else if (selectedVar === 'chamber_pressure') {
      simVal = timeArray.map(t => (t < 40 ? 5.5 : 0));
      if (activePreset === 'nominal') {
        actVal = simVal.map(v => (v > 0 ? 5.4 - 0.05 * Math.random() : 0));
      } else {
        // High vibration / pressure drop
        actVal = simVal.map((v, i) => {
          if (v === 0) return 0;
          const vib = i >= 20 && i <= 35 ? -0.4 - 0.2 * Math.sin(i) : 0;
          return 5.3 + vib + 0.15 * Math.random();
        });
      }
    } else {
      // Pitch attitude error (rad)
      simVal = timeArray.map(t => 0.15 * Math.exp(-t / 15) * Math.sin(t));
      if (activePreset === 'nominal') {
        actVal = simVal.map(v => v + 0.005 * Math.sin(v) + (Math.random() - 0.5) * 0.002);
      } else {
        // Attitude oscillation anomaly at wind shear boundary
        actVal = simVal.map((v, i) => {
          const osc = i >= 20 && i <= 35 ? 0.035 * Math.sin(i / 1.5) : 0;
          return v + osc + (Math.random() - 0.5) * 0.004;
        });
      }
    }

    return { actVal, simVal };
  };

  const { actVal, simVal } = getTelemetryData();

  // Dynamic Deviation Metric Computations
  const maxVal = Math.max(...simVal.map(Math.abs), 1);
  const sumSq = simVal.reduce((acc, v, idx) => acc + Math.pow(v - actVal[idx], 2), 0);
  
  const rmse = Math.sqrt(sumSq / steps);
  const mae = Math.max(...simVal.map((v, idx) => Math.abs(v - actVal[idx])));

  const meanAct = actVal.reduce((a, b) => a + b, 0) / steps;
  const ssTot = actVal.reduce((acc, v) => acc + Math.pow(v - meanAct, 2), 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - sumSq / ssTot) : 1;

  // Thresholds: if error exceeds 3% of peak amplitude -> anomaly
  const isAnomaly = rmse / maxVal > 0.03;

  // uPlot canvas rendering trigger
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const isRtl = i18n.language === 'ar';

    const opts: uPlot.Options = {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      title: "",
      cursor: { show: true },
      scales: {
        x: { time: false },
        y: { auto: true }
      },
      axes: [
        {
          stroke: "#94a3b8",
          grid: { stroke: "#1e293b" },
          label: isRtl ? "الوقت (ث)" : "Time (s)",
          labelSize: 20
        },
        {
          stroke: "#94a3b8",
          grid: { stroke: "#1e293b" },
          labelSize: 30
        }
      ],
      series: [
        { label: isRtl ? "الوقت" : "Time" },
        {
          label: t('compare.dataset_a'),
          stroke: "#3b82f6",
          width: 2.5,
        },
        {
          label: t('compare.dataset_b'),
          stroke: "#10b981",
          width: 2,
          dash: [6, 4]
        }
      ]
    };

    const data: uPlot.AlignedData = [
      timeArray,
      actVal,
      simVal
    ];

    const plot = new uPlot(opts, data, chartContainerRef.current);
    chartInstanceRef.current = plot;

    const handleResize = () => {
      if (chartContainerRef.current) {
        plot.setSize({
          width: chartContainerRef.current.clientWidth,
          height: 400
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      plot.destroy();
    };
  }, [selectedVar, activePreset, i18n.language, actVal, simVal, t]);

  return (
    <div className="h-full flex flex-col space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
          <GitCompare className="w-8 h-8 text-blue-500" /> {t('compare.title')}
        </h1>
        <p className="text-slate-400">{t('compare.subtitle')}</p>
      </header>

      {/* Preset and Dataset Configuration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 flex justify-between items-center">
          <div>
            <h3 className="text-blue-400 font-bold text-xs uppercase tracking-wider">{t('compare.dataset_a')}</h3>
            <p className="text-white font-mono text-sm mt-1">FL-2026-05-18_BA.parquet</p>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 flex justify-between items-center">
          <div>
            <h3 className="text-emerald-400 font-bold text-xs uppercase tracking-wider">{t('compare.dataset_b')}</h3>
            <p className="text-white font-mono text-sm mt-1">SIM-6DOF-2026-05-18_BA.tlm</p>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 flex flex-col justify-center">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">{t('compare.match_status')}</label>
          <div className="flex gap-2">
            <button
              onClick={() => setActivePreset('nominal')}
              className={`flex-1 py-1.5 px-3 rounded text-xs font-bold uppercase transition-all border ${
                activePreset === 'nominal'
                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              Nominal Run
            </button>
            <button
              onClick={() => setActivePreset('wind_shear')}
              className={`flex-1 py-1.5 px-3 rounded text-xs font-bold uppercase transition-all border ${
                activePreset === 'wind_shear'
                  ? 'bg-red-600/20 border-red-500 text-red-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              Wind Shear
            </button>
          </div>
        </div>
      </div>

      {/* Main Graph & Metrics Panel split */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        
        {/* uPlot Chart View */}
        <div className="lg:col-span-3 bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 flex flex-col min-h-[450px]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <LineChart className="w-5 h-5 text-slate-400" /> 
              {t(`compare.variables.${selectedVar}`)}
            </h2>
            <select
              value={selectedVar}
              onChange={(e) => setSelectedVar(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="altitude">{t('compare.variables.altitude')}</option>
              <option value="velocity">{t('compare.variables.velocity')}</option>
              <option value="chamber_pressure">{t('compare.variables.chamber_pressure')}</option>
              <option value="pitch_error">{t('compare.variables.pitch_error')}</option>
            </select>
          </div>

          <div className="flex-1 bg-slate-950/40 border border-slate-800 rounded-lg p-4 flex items-center justify-center relative overflow-hidden">
            <div ref={chartContainerRef} className="w-full h-full" />
            
            {/* Embedded custom chart legends to replace default DOM layout */}
            <div className={`absolute bottom-6 ${i18n.language === 'ar' ? 'left-6' : 'right-6'} bg-slate-950/90 border border-slate-800 p-3 rounded-lg text-xs font-mono backdrop-blur space-y-1.5 z-20`}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-blue-500" />
                <span className="text-slate-300">{t('compare.dataset_a')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-emerald-500 border-t border-dashed" />
                <span className="text-slate-300">{t('compare.dataset_b')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Math Metrics Panel */}
        <div className="lg:col-span-1 bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-md font-bold uppercase tracking-widest text-slate-400 mb-6 border-b border-slate-800 pb-2">
              {t('compare.metrics_panel')}
            </h2>
            
            <div className="space-y-6">
              {/* RMSE */}
              <div>
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">{t('compare.rmse')}</div>
                <div className="text-3xl font-black font-mono text-white">
                  {rmse.toFixed(4)}
                </div>
              </div>

              {/* MAE */}
              <div>
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">{t('compare.max_error')}</div>
                <div className="text-3xl font-black font-mono text-slate-300">
                  {mae.toFixed(4)}
                </div>
              </div>

              {/* R2 */}
              <div>
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">{t('compare.correlation_coeff')}</div>
                <div className="text-3xl font-black font-mono text-blue-400">
                  {r2.toFixed(4)}
                </div>
              </div>

              {/* Threshold Alarm */}
              <div className={`p-4 rounded-lg border font-mono text-xs flex flex-col gap-2 ${
                isAnomaly 
                  ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}>
                <div className="flex items-center gap-2 font-bold uppercase">
                  {isAnomaly ? <AlertTriangle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>{isAnomaly ? t('compare.anomaly') : t('compare.nominal')}</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  {isAnomaly 
                    ? 'Root deviation outside 3% model safety bounds. High drag mismatch noted at wind envelope.'
                    : 'System within 3% tolerance boundaries. Autopilot parameters correlate perfectly.'}
                </div>
              </div>
            </div>
          </div>

          <button className="w-full mt-6 py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 uppercase">
            <Download className="w-4 h-4" /> {t('compare.export_report')}
          </button>
        </div>

      </div>
    </div>
  );
}
