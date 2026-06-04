import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, AlertCircle, Play, Shield, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { updateChecklist } from './store/systemSlice';

type StepStatus = 'done' | 'active' | 'failed' | 'pending';

interface CheckStep {
  id: string;
  title: string;
  desc: string;
  seekerOnly?: boolean;
}

const ALL_STEPS: CheckStep[] = [
  { id: 'S01', title: 'Hardware Path Verification',   desc: 'Actual hardware matches declared flight_computer_path in mission file.' },
  { id: 'S02', title: 'Mission File Lock',             desc: 'Mission YAML locked; SHA-256 recorded.' },
  { id: 'S03', title: 'Telemetry Uplink',              desc: 'LoRa link quality > 90%.' },
  { id: 'S04', title: 'GPS RTK Fix',                   desc: 'Fix quality = RTK or SBAS; ≥ 6 satellites.' },
  { id: 'S05', title: 'IMU Alignment',                 desc: 'Gyro bias convergence; bias < threshold.' },
  { id: 'S06', title: 'Loop Rate Confirmed',           desc: 'Locked loop rate matches mission file.' },
  { id: 'S07', title: 'Actuator Sweep (broadcast)',    desc: 'Broadcast 3 s sweep; per-fin pass/fail logged.' },
  { id: 'S08', title: 'CAN Bus Health',                desc: 'Bus utilisation < 70%; all node IDs responding.' },
  { id: 'S09', title: 'Servo Midpoint Set',            desc: 'All servos commanded to zero; feedback confirmed.' },
  { id: 'S10', title: 'Igniter Continuity',            desc: 'E-match resistance within spec.' },
  { id: 'S11', title: 'Pyro ARM',                      desc: 'Arm command sent; STM32 confirms armed state.' },
  { id: 'S12', title: 'Mission File Upload',           desc: 'mission.yaml pushed to flight computer.' },
  { id: 'S13', title: 'Thermal Check',                 desc: 'All temperatures within limits.' },
  { id: 'S14', title: 'Battery Voltages',              desc: 'All packs above minimum voltage.' },
  { id: 'S15', title: 'Safety Zone Active',            desc: 'Safety zone loaded; abort_on_breach armed.' },
  { id: 'S16', title: 'USB Routing Confirmed',         desc: 'No topology change since last rescan; S13a closed.' },
  { id: 'S17', title: 'ESKF Initialised',              desc: 'ESKF running; covariance converged.' },
  { id: 'S18', title: 'Launch Rail Level',             desc: 'Rail clinometer within ±0.5°.' },
  { id: 'S19', title: 'Wind Check',                    desc: 'Surface wind within mission abort policy limits.' },
  { id: 'S20', title: 'Seeker Check',                  desc: 'Seeker status = READY (or IDLE if seeker disabled).', seekerOnly: true },
  { id: 'S21', title: 'Flight Log Initialised',        desc: 'Log file open; header written; 0 rows.' },
  { id: 'S22', title: 'No Hot-Plug Since T-3 min',     desc: 'S13 rescan reports same topology as S16.' },
  { id: 'S23', title: 'Operator GO/NO-GO',             desc: 'All discipline leads confirm GO.' },
  { id: 'S24', title: 'Pre-Launch Complete',           desc: 'All 23 previous steps passed; proceed authorised.' },
];

export default function S14_PreLaunchChecklist() {
  const navigate      = useNavigate();
  const dispatch      = useAppDispatch();
  const seekerEnabled = useAppSelector(s => s.mission.seeker.enabled);
  const missionLocked = useAppSelector(s => s.mission.locked);
  const lastRescan    = useAppSelector(s => s.hardware.lastRescan);
  const secondsAgo    = lastRescan ? Math.floor((Date.now() - lastRescan) / 1000) : null;

  const visibleSteps = ALL_STEPS.filter(s => !s.seekerOnly || seekerEnabled);

  const checklistProgress = useAppSelector(s => s.system.checklistProgress);
  const [failedStep, setFailedStep] = useState<string | null>(null);

  const progress = Object.fromEntries(
    visibleSteps.map((s, i) => {
      if (failedStep === s.id) return [s.id, 'failed' as StepStatus];
      if (i < checklistProgress) return [s.id, 'done' as StepStatus];
      if (i === checklistProgress && !failedStep) return [s.id, 'active' as StepStatus];
      return [s.id, 'pending' as StepStatus];
    })
  );

  function advance(id: string) {
    const idx = visibleSteps.findIndex(s => s.id === id);
    if (idx === checklistProgress) {
      dispatch(updateChecklist(checklistProgress + 1));
      setFailedStep(null);
    }
  }

  function fail(id: string) {
    setFailedStep(id);
  }

  function reset() {
    dispatch(updateChecklist(0));
    setFailedStep(null);
  }

  const doneCount  = visibleSteps.filter(s => progress[s.id] === 'done').length;
  const allDone    = doneCount === visibleSteps.length;
  const anyFailed  = visibleSteps.some(s => progress[s.id] === 'failed');

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto w-full">
      <header className="mb-6 text-center mt-2">
        <Shield className="w-12 h-12 text-blue-500 mx-auto mb-3" />
        <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Pre-Launch Checklist</h1>
        <p className="text-slate-400 text-sm">Rigid verification sequence — all {visibleSteps.length} steps must pass before proceeding.</p>
        <div className="flex items-center justify-center gap-6 mt-3 text-sm">
          <span className={clsx('px-3 py-1 rounded border text-xs', missionLocked ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400')}>
            Mission {missionLocked ? 'Locked ✓' : 'NOT Locked ✗'}
          </span>
          {secondsAgo !== null && (
            <span className="text-slate-500 text-xs">Last HW scan: {secondsAgo}s ago</span>
          )}
          {!seekerEnabled && (
            <span className="text-xs text-slate-600 border border-slate-700 px-2 py-1 rounded">S20 hidden (seeker disabled)</span>
          )}
        </div>
      </header>

      <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl flex-1 overflow-y-auto">
        <div className="p-2">
          {visibleSteps.map((step) => {
            const st = progress[step.id] ?? 'pending';
            const isS22 = step.id === 'S22';
            return (
              <div key={step.id} className={clsx(
                'relative flex items-center gap-4 p-4 rounded-xl border mb-1.5 transition-all',
                st === 'done'    ? 'bg-emerald-500/5  border-emerald-500/20' :
                st === 'active'  ? 'bg-blue-600/10   border-blue-500/50 shadow-[0_0_12px_rgba(59,130,246,0.1)]' :
                st === 'failed'  ? 'bg-red-500/10    border-red-500/30' :
                                   'bg-slate-900/20  border-slate-800/60'
              )}>
                <div className="shrink-0">
                  {st === 'done'   && <CheckCircle2 className="w-7 h-7 text-emerald-500" />}
                  {st === 'active' && <div className="w-7 h-7 rounded-full border-[3px] border-blue-500 border-t-transparent animate-spin" />}
                  {st === 'failed' && <XCircle className="w-7 h-7 text-red-500" />}
                  {st === 'pending'&& <Circle className="w-7 h-7 text-slate-700" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-600">{step.id}</span>
                    <h3 className={clsx('font-semibold text-sm truncate', st === 'active' ? 'text-blue-300' : st === 'done' ? 'text-emerald-300' : st === 'failed' ? 'text-red-300' : 'text-slate-400')}>
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {isS22 && secondsAgo !== null ? `${step.desc} (last scan: ${secondsAgo}s ago)` : step.desc}
                  </p>
                </div>
                {st === 'active' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => fail(step.id)}
                      className="px-3 py-1.5 text-xs rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors">
                      Fail
                    </button>
                    <button onClick={() => advance(step.id)}
                      className="flex items-center gap-1 px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors">
                      Pass <Play className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {st === 'failed' && (
                  <button onClick={() => setFailedStep(null)}
                    className="shrink-0 px-3 py-1.5 text-xs rounded border border-slate-600 text-slate-400 hover:bg-slate-800 transition-colors">
                    Retry
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex justify-between items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700 shrink-0">
        <div className="flex items-center gap-4">
          <div className={clsx('text-sm flex items-center gap-2', anyFailed ? 'text-red-400' : 'text-slate-400')}>
            <AlertCircle className="w-4 h-4" />
            {doneCount} / {visibleSteps.length} Steps Complete
            {anyFailed && <span className="text-red-400 ml-1">· {visibleSteps.filter(s => progress[s.id] === 'failed').length} Failed</span>}
          </div>
          <div className="h-2 w-48 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / visibleSteps.length) * 100}%` }} />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={reset} className="px-4 py-2 text-sm rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors">
            Reset
          </button>
          <button onClick={() => navigate('/launch')} disabled={!allDone}
            className={clsx('px-8 py-2 rounded-lg font-bold text-sm border transition-colors',
              allDone
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'bg-emerald-600/20 text-emerald-200/40 border-emerald-500/20 cursor-not-allowed')}>
            Proceed to Launch Control →
          </button>
        </div>
      </div>
    </div>
  );
}
