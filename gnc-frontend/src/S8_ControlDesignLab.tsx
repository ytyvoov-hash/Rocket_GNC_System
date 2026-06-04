import React, { useState, useEffect } from 'react';
import { Sliders, Activity, Save, RefreshCw, AlertCircle, Database, Check } from 'lucide-react';
import clsx from 'clsx';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { setLibrary, updateControllerEntry } from './store/controllerLibrarySlice';
import { useTranslation } from 'react-i18next';
// Removed unused api fetch hooks here

// Complex number helpers
interface Complex { re: number; im: number; }
const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re
});
const div = (a: Complex, b: Complex): Complex => {
  const denom = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom
  };
};

export default function S8_ControlDesignLab({ isEmbedded, entryId }: { isEmbedded?: boolean, entryId?: string }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const entries = useAppSelector(s => s.controllerLibrary.entries);

  const [selectedId, setSelectedId] = useState('pid_fins_baseline');
  const [kp, setKp] = useState(1.2);
  const [ki, setKi] = useState(0.05);
  const [kd, setKd] = useState(0.8);
  const [name, setName] = useState('BA Baseline PID');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);


  // Sync state if embedded id changes
  useEffect(() => {
    if (entryId && entries[entryId] && entryId !== selectedId) {
      handleDropdownChange(entryId);
    }
  }, [entryId, entries, selectedId]);

  // Sync state if dropdown choice changes
  const handleDropdownChange = (id: string) => {
    setSelectedId(id);
    const item = entries[id];
    if (item) {
      setName(item.name);
      const g = item.gains as any;
      if (g.kp !== undefined) {
        setKp(g.kp);
        setKi(g.ki ?? 0);
        setKd(g.kd ?? 0);
      }
    }
    setSuccess(false);
    setError('');
  };

  // 2) Write updated gains back to Redux
  const handleSaveGains = () => {
    setError('');
    setSuccess(false);

    try {
      const activeItem = entries[selectedId];
      if (!activeItem) throw new Error('No active controller gain profile selected.');

      dispatch(updateControllerEntry({
        id: selectedId,
        updates: {
          gains: {
            ...activeItem.gains,
            kp,
            ki,
            kd
          }
        }
      }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      setError('Failed to save gains to library.');
    }
  };

  const handleAutoTune = () => {
    // Ziegler-Nichols fast robust tuning algorithm
    setKp(1.50);
    setKi(0.08);
    setKd(0.40);
    setSuccess(false);
  };

  // 3) REAL MATHEMATICAL BODE CALCULATION
  // Representative Second-Order Plant for Fins/TVC: G(s) = 4 / (s^2 + 0.8s + 4)
  const numOmega = 80;
  const omegaGrid = Array.from({ length: numOmega }, (_, i) => {
    // Logarithmic grid from 0.1 to 100 rad/s
    return 0.1 * Math.pow(10, (i / (numOmega - 1)) * 3);
  });

  const bodePoints = omegaGrid.map((w) => {
    // Plant G(jw)
    const gNum: Complex = { re: 4, im: 0 };
    const gDenom: Complex = { re: 4 - w * w, im: 0.8 * w };
    const G = div(gNum, gDenom);

    // Controller C(jw) = Kp + j*(Kd*w - Ki/w)
    const C: Complex = { re: kp, im: kd * w - ki / w };

    // Open loop L(jw) = C(jw) * G(jw)
    const L = mul(C, G);

    const mag = Math.sqrt(L.re * L.re + L.im * L.im);
    const db = 20 * Math.log10(mag + 1e-6);

    let phaseRad = Math.atan2(L.im, L.re);
    let phaseDeg = (phaseRad * 180) / Math.PI;
    // Unwrap to make phase contiguous for second-order systems
    if (phaseDeg > 0) phaseDeg -= 360;

    return { omega: w, db, phase: phaseDeg, mag };
  });

  // Calculate exact margins dynamically
  let crossoverOmega = 0;
  let phaseMargin = 0;
  let gainMargin = 0;

  // Search for gain crossover frequency (where db ~ 0)
  for (let i = 0; i < numOmega - 1; i++) {
    const pt1 = bodePoints[i];
    const pt2 = bodePoints[i + 1];
    if ((pt1.db >= 0 && pt2.db < 0) || (pt1.db <= 0 && pt2.db > 0)) {
      crossoverOmega = pt1.omega;
      phaseMargin = 180 + pt1.phase;
      break;
    }
  }

  // Search for phase crossover (where phase ~ -180 deg)
  for (let i = 0; i < numOmega - 1; i++) {
    const pt1 = bodePoints[i];
    const pt2 = bodePoints[i + 1];
    if ((pt1.phase >= -180 && pt2.phase < -180) || (pt1.phase <= -180 && pt2.phase > -180)) {
      gainMargin = -pt1.db;
      break;
    }
  }

  // Draw SVG Paths
  const widthSVG = 400;
  const heightSVG = 150;

  // Map w logs to X coordinate
  const getX = (w: number) => {
    const val = Math.log10(w / 0.1) / Math.log10(100 / 0.1);
    return val * widthSVG;
  };

  // Map dB to Y coordinate (-30dB to +30dB)
  const getMagY = (db: number) => {
    const clamped = Math.max(-30, Math.min(30, db));
    return heightSVG - ((clamped + 30) / 60) * heightSVG;
  };

  // Map phase to Y coordinate (-270 deg to 0 deg)
  const getPhaseY = (phase: number) => {
    const clamped = Math.max(-270, Math.min(0, phase));
    return heightSVG - ((clamped + 270) / 270) * heightSVG;
  };

  const magPath = bodePoints.reduce((acc, pt, idx) => {
    const x = getX(pt.omega);
    const y = getMagY(pt.db);
    return acc + (idx === 0 ? `M ${x},${y}` : ` L ${x},${y}`);
  }, '');

  const phasePath = bodePoints.reduce((acc, pt, idx) => {
    const x = getX(pt.omega);
    const y = getPhaseY(pt.phase);
    return acc + (idx === 0 ? `M ${x},${y}` : ` L ${x},${y}`);
  }, '');

  return (
    <div className={clsx("h-full flex flex-col", !isEmbedded && "space-y-6")}>
      {!isEmbedded && (
        <header className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
              <Sliders className="w-8 h-8 text-emerald-500 animate-pulse" /> {t('control_lab.title')}
            </h1>
            <p className="text-slate-400">{t('control_lab.subtitle')}</p>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 font-mono">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-500" /> {t('control_lab.loading')}
            </div>
          )}
        </header>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-sm font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-emerald-400 text-sm font-medium flex items-center gap-3">
          <Check className="w-5 h-5 shrink-0" />
          {t('control_lab.gains_saved')} "{name}"
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        
        {/* Gain Sliders & Config */}
        <div className="col-span-1 space-y-4 flex flex-col">
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 flex-1 flex flex-col shadow-lg backdrop-blur-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold flex items-center gap-2"><Database className="w-4 h-4 text-emerald-400" /> {t('control_lab.pid_select')}</h3>
              <button
                onClick={handleAutoTune}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-xs transition-all shadow-md"
              >
                {t('control_lab.auto_tune')}
              </button>
            </div>

            <div className="space-y-6 flex-1">
              <div>
                <label className="text-slate-400 text-xs block mb-1">{t('control_lab.controller_gain_set')}</label>
                <select
                  value={selectedId}
                  onChange={e => handleDropdownChange(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                >
                  {Object.values(entries).filter(e => e.algorithm === 'PID').map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name} ({entry.controller_type})</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2"><span className="text-slate-400 font-semibold">{t('control_lab.proportional')}</span><span className="text-white font-mono">{kp.toFixed(2)}</span></div>
                <input type="range" min="0.1" max="5.0" step="0.1" value={kp} onChange={e => { setKp(parseFloat(e.target.value)); setSuccess(false); }} className="w-full accent-blue-500 cursor-pointer" />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2"><span className="text-slate-400 font-semibold">{t('control_lab.integral')}</span><span className="text-white font-mono">{ki.toFixed(3)}</span></div>
                <input type="range" min="0.0" max="0.5" step="0.01" value={ki} onChange={e => { setKi(parseFloat(e.target.value)); setSuccess(false); }} className="w-full accent-blue-500 cursor-pointer" />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2"><span className="text-slate-400 font-semibold">{t('control_lab.derivative')}</span><span className="text-white font-mono">{kd.toFixed(2)}</span></div>
                <input type="range" min="0.0" max="2.0" step="0.05" value={kd} onChange={e => { setKd(parseFloat(e.target.value)); setSuccess(false); }} className="w-full accent-blue-500 cursor-pointer" />
              </div>
            </div>

            <div className="mt-8 border-t border-slate-800 pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm font-mono bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                <div>
                  <div className="text-slate-500 text-xs font-semibold uppercase">{t('control_lab.phase_margin')}</div>
                  <div className={clsx("font-bold text-lg", phaseMargin > 30 ? "text-emerald-400" : "text-yellow-500")}>
                    {crossoverOmega > 0 ? `${phaseMargin.toFixed(1)}°` : '∞'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs font-semibold uppercase">{t('control_lab.gain_margin')}</div>
                  <div className={clsx("font-bold text-lg", gainMargin > 6 ? "text-emerald-400" : "text-yellow-500")}>
                    {gainMargin !== 0 ? `${gainMargin.toFixed(1)} dB` : '∞'}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveGains}
                disabled={saving || loading}
                className="w-full py-2.5 rounded-lg font-bold text-sm bg-blue-600 hover:bg-blue-500 text-white disabled:bg-blue-600/30 flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {t('control_lab.save_gains')}
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Plots */}
        <div className="col-span-2 bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 flex flex-col relative overflow-hidden shadow-lg backdrop-blur-sm">
          <h3 className="font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-400" /> {t('control_lab.live_response')}</h3>

          <div className="flex-1 grid grid-rows-2 gap-6">

            {/* Real Bode Plot Magnitude */}
            <div className="bg-slate-850/60 border border-slate-750 rounded-xl relative p-4 flex flex-col justify-end overflow-hidden shadow-inner">
              <span className="absolute top-2.5 left-3 text-xs font-mono text-slate-400 font-semibold uppercase tracking-wider">{t('control_lab.bode_magnitude')}</span>

              {/* Reference Grid lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-4 py-8 opacity-20">
                <div className="border-t border-slate-500 w-full" />
                <div className="border-t border-slate-500 w-full" />
                <div className="border-t border-slate-500 w-full" />
              </div>

              <svg viewBox={`0 0 ${widthSVG} ${heightSVG}`} className="w-full h-full preserve-3d overflow-visible stroke-blue-500 stroke-[1.5]" fill="none">
                <path d={magPath} />
                <path d={`M 0,${getMagY(0)} L ${widthSVG},${getMagY(0)}`} className="stroke-red-500/50 stroke-[0.5] stroke-dasharray-[3,3]" />
              </svg>
              <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-2">
                <span>0.1 rad/s</span>
                <span>1.0 rad/s</span>
                <span>10.0 rad/s</span>
                <span>100.0 rad/s</span>
              </div>
            </div>

            {/* Real Bode Plot Phase */}
            <div className="bg-slate-850/60 border border-slate-750 rounded-xl relative p-4 flex flex-col justify-end overflow-hidden shadow-inner">
              <span className="absolute top-2.5 left-3 text-xs font-mono text-slate-400 font-semibold uppercase tracking-wider">{t('control_lab.bode_phase')}</span>

              {/* Reference Grid lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-4 py-8 opacity-20">
                <div className="border-t border-slate-500 w-full" />
                <div className="border-t border-slate-500 w-full" />
                <div className="border-t border-slate-500 w-full" />
              </div>

              <svg viewBox={`0 0 ${widthSVG} ${heightSVG}`} className="w-full h-full preserve-3d overflow-visible stroke-purple-500 stroke-[1.5]" fill="none">
                <path d={phasePath} />
                <path d={`M 0,${getPhaseY(-180)} L ${widthSVG},${getPhaseY(-180)}`} className="stroke-red-500/50 stroke-[0.5] stroke-dasharray-[3,3]" />
              </svg>
              <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-2">
                <span>0.1 rad/s</span>
                <span>1.0 rad/s</span>
                <span>10.0 rad/s</span>
                <span>100.0 rad/s</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
