import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Play, CheckCircle2, ShieldAlert, Cpu, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

type SimulationState = 'IDLE' | 'COMPILING' | 'RUNNING' | 'VERIFYING' | 'DONE';

export default function S12_FaultInjectionLab({ isEmbedded }: { isEmbedded?: boolean }) {
  const { t } = useTranslation();
  
  // State variables for failure configurations
  const [faultType, setFaultType] = useState<'imu' | 'gps' | 'servo'>('servo');
  const [onsetTimestamp, setOnsetTimestamp] = useState<number>(15);
  const [peakMagnitude, setPeakMagnitude] = useState<number>(15);
  const [recoveryFactor, setRecoveryFactor] = useState<number>(50);

  // Simulation runner pipeline states
  const [simState, setSimState] = useState<SimulationState>('IDLE');
  const [progress, setProgress] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Derive dynamic threshold values for pass/fail logic
  const isPass = 
    faultType === 'servo' ? peakMagnitude <= 20 :
    faultType === 'imu' ? peakMagnitude <= 0.3 :
    peakMagnitude <= 8; // GPS sats limit

  // Reset peak magnitudes based on selected type
  useEffect(() => {
    if (faultType === 'servo') setPeakMagnitude(15);
    else if (faultType === 'imu') setPeakMagnitude(0.2);
    else setPeakMagnitude(6);
  }, [faultType]);

  // Handle Scenario Test Execution Pipeline
  const runSILScenario = () => {
    setSimState('COMPILING');
    setProgress(10);
    
    let timer = 0;
    const interval = setInterval(() => {
      timer += 50;
      
      if (timer < 1200) {
        setSimState('COMPILING');
        setProgress(Math.min(30, Math.floor((timer / 1200) * 30)));
      } else if (timer < 2800) {
        setSimState('RUNNING');
        setProgress(Math.min(70, 30 + Math.floor(((timer - 1200) / 1600) * 40)));
      } else if (timer < 4200) {
        setSimState('VERIFYING');
        setProgress(Math.min(95, 70 + Math.floor(((timer - 2800) / 1400) * 25)));
      } else {
        setSimState('DONE');
        setProgress(100);
        clearInterval(interval);
      }
    }, 50);
  };

  // Render high-DPI canvas comparative graph mapping trajectory profiles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset/clear canvas
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Drawing margins
    const paddingLeft = 50;
    const paddingRight = 30;
    const paddingTop = 30;
    const paddingBottom = 40;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Clear background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Draw coordinate grids
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = paddingTop + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      // Axis labels (altitude representation)
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      const labelVal = Math.floor(4000 - (4000 / 5) * i);
      ctx.fillText(`${labelVal}m`, paddingLeft - 42, y + 4);
    }

    for (let i = 0; i <= 6; i++) {
      const x = paddingLeft + (chartWidth / 6) * i;
      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, height - paddingBottom);
      ctx.stroke();

      // X Axis time labels
      ctx.fillStyle = '#64748b';
      ctx.fillText(`${i * 10}s`, x - 10, height - paddingBottom + 16);
    }

    // 1. Draw Nominal Path (Parabolic ascent curve)
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let t = 0; t <= 60; t++) {
      const x = paddingLeft + (chartWidth / 60) * t;
      const tNorm = t / 60;
      const altitude = 4000 * Math.sin(tNorm * Math.PI * 0.5); // standard ascent curve
      const y = height - paddingBottom - (chartHeight * (altitude / 4000));
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 2. Draw Active Faulty Simulation Curve
    if (simState === 'DONE') {
      ctx.strokeStyle = isPass ? '#10b981' : '#f43f5e';
      if (!isPass) {
        ctx.setLineDash([4, 4]);
      }
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      
      for (let t = 0; t <= 60; t++) {
        const x = paddingLeft + (chartWidth / 60) * t;
        const tNorm = t / 60;
        let altitude = 4000 * Math.sin(tNorm * Math.PI * 0.5);
        
        // Inject failure drift or loss deviation after onsetTimestamp
        if (t >= onsetTimestamp) {
          const factor = (t - onsetTimestamp) / (60 - onsetTimestamp);
          const rawDeviation = peakMagnitude * 22.0 * Math.sin(factor * Math.PI);
          
          // Self healing scaling based on recovery factor
          const healFactor = Math.max(0, 1 - (recoveryFactor / 100) * factor * 1.5);
          const deviation = rawDeviation * healFactor;
          
          altitude -= deviation;
        }

        const y = height - paddingBottom - (chartHeight * (altitude / 4000));
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash array
    }

    // Draw onset failure vertical indicator line
    if (simState === 'DONE') {
      const onsetX = paddingLeft + (chartWidth / 60) * onsetTimestamp;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(onsetX, paddingTop);
      ctx.lineTo(onsetX, height - paddingBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label indicator at onset line
      ctx.fillStyle = '#f59e0b';
      ctx.font = '9px monospace';
      ctx.fillText('FAIL INJECT', onsetX - 28, paddingTop - 8);
    }

  }, [simState, faultType, onsetTimestamp, peakMagnitude, recoveryFactor, isPass]);

  return (
    <div className="h-full flex flex-col space-y-6 max-w-6xl mx-auto w-full">
      {!isEmbedded && (
        <header className="mb-2 mt-4">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
            <Cpu className="w-8 h-8 text-red-500" /> {t('sil.title')}
          </h1>
          <p className="text-slate-400">{t('sil.subtitle')}</p>
        </header>
      )}

      <div className={clsx(
        "flex-1 min-h-0 overflow-y-auto pb-8",
        isEmbedded ? "flex flex-col space-y-6" : "grid grid-cols-1 lg:grid-cols-3 gap-6"
      )}>
        
        {/* Scenario Controls Panel */}
        <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 h-fit space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-slate-800 pb-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" /> {t('sil.param_title')}
          </h2>

          {/* Fault Category Selection */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">Failure Vector Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['servo', 'imu', 'gps'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFaultType(type)}
                  className={`py-2 rounded font-semibold text-xs border uppercase transition-all ${
                    faultType === type
                      ? 'bg-red-950/60 border-red-500 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                      : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {type === 'servo' ? 'Servo Jam' : type === 'imu' ? 'Gyro Drift' : 'GPS Loss'}
                </button>
              ))}
            </div>
          </div>

          {/* Onset Timestamp */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-400">{t('sil.onset_time')}</span>
              <span className="font-mono text-amber-400 font-bold">{onsetTimestamp}s</span>
            </div>
            <input
              type="range"
              min="5"
              max="45"
              value={onsetTimestamp}
              onChange={(e) => setOnsetTimestamp(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer bg-slate-850"
            />
          </div>

          {/* Peak Magnitude */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-400">{t('sil.magnitude')}</span>
              <span className="font-mono text-red-400 font-bold">
                {faultType === 'servo' && `${peakMagnitude}°`}
                {faultType === 'imu' && `${peakMagnitude} rad/s`}
                {faultType === 'gps' && `${peakMagnitude} Sats`}
              </span>
            </div>
            <input
              type="range"
              min={faultType === 'servo' ? 5 : faultType === 'imu' ? 0.05 : 1}
              max={faultType === 'servo' ? 30 : faultType === 'imu' ? 0.5 : 12}
              step={faultType === 'imu' ? 0.02 : 1}
              value={peakMagnitude}
              onChange={(e) => setPeakMagnitude(Number(e.target.value))}
              className="w-full accent-red-500 cursor-pointer bg-slate-850"
            />
          </div>

          {/* Self-Healing Recovery speed */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-400">{t('sil.recovery')}</span>
              <span className="font-mono text-emerald-400 font-bold">{recoveryFactor}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={recoveryFactor}
              onChange={(e) => setRecoveryFactor(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer bg-slate-850"
            />
          </div>

          <button
            type="button"
            onClick={runSILScenario}
            disabled={simState !== 'IDLE' && simState !== 'DONE'}
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 px-6 py-3 rounded-lg font-bold text-white shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Play className="w-5 h-5 fill-current" /> {t('sil.run_button')}
          </button>
        </div>

        {/* Graphical Verification Canvas & Pipeline Status */}
        <div className={clsx(
          "bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 flex flex-col space-y-6",
          !isEmbedded && "lg:col-span-2 h-full"
        )}>
          
          {/* Top Status Header */}
          <div className="flex justify-between items-center bg-slate-950/40 p-4 border border-slate-800 rounded-lg">
            <div className="flex items-center gap-3">
              {simState !== 'IDLE' && simState !== 'DONE' && (
                <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
              )}
              <span className="font-mono text-sm text-slate-300">
                {simState === 'IDLE' && t('sil.status_idle')}
                {simState === 'COMPILING' && t('sil.status_compiling')}
                {simState === 'RUNNING' && t('sil.status_running')}
                {simState === 'VERIFYING' && t('sil.status_verifying')}
                {simState === 'DONE' && (isPass ? t('sil.status_pass') : t('sil.status_fail'))}
              </span>
            </div>
            
            {/* Progress Gauge */}
            <div className="w-32 bg-slate-850 h-2.5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Comparative Graph Canvas */}
          <div className="flex-1 min-h-[300px] border border-slate-800 rounded-lg overflow-hidden relative bg-slate-950">
            <canvas ref={canvasRef} className="w-full h-full block" />
            
            {/* Legend Indicators */}
            <div className="absolute bottom-4 left-6 flex gap-6 z-10 bg-slate-900/80 px-4 py-2 border border-slate-700/40 rounded backdrop-blur">
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-blue-600 rounded-full" />
                <span className="text-xs font-mono text-slate-300">{t('sil.nominal')}</span>
              </div>
              {simState === 'DONE' && (
                <div className="flex items-center gap-2">
                  <div 
                    className="w-4 h-1 rounded-full" 
                    style={{ backgroundColor: isPass ? '#10b981' : '#f43f5e' }}
                  />
                  <span className="text-xs font-mono text-slate-300">{t('sil.anomalous')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Post Run Verification Indicators */}
          {simState === 'DONE' && (
            <div className={`p-4 rounded-lg border font-mono text-sm flex items-start gap-3 animate-in fade-in duration-300 ${
              isPass 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              {isPass ? (
                <>
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold uppercase">Estimation Bound Tolerances Met:</span> The ESKF covariance estimates remained within flight parameters. Dual-path IMM estimator switched flawlessly, mitigating the {faultType} anomaly profile without manual intervention.
                  </div>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold uppercase">Fault envelope breached:</span> Sensor estimation covariance diverged from HDF5 golden boundaries. Auto-abort safety locks activated at T+{onsetTimestamp + 4}s to protect the launcher.
                  </div>
                </>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
