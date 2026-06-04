import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, Unlock, Rocket, Shield } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { armLaunch, initiateLaunch, abort, setTMinus } from './store/systemSlice';
import { canArm as checkCanArm } from './utils/rbac';
import { auditWrite } from './utils/audit';
import { isKeycloakEnabled } from './services/keycloak';

export default function S15_LaunchControl() {
  const { launchArmed: armed, launchInitiated: launched, hardwareKeyPresent, launchState, tMinusSeconds, checklistProgress } = useAppSelector(state => state.system);
  const { isAuthenticated, role, operatorId } = useAppSelector(state => state.auth);
  const missionId  = useAppSelector(s => s.mission.missionId);
  const missionPath = useAppSelector(s => s.mission.path);
  const telemetry = useAppSelector(s => s.telemetry);
  
  const dispatch  = useAppDispatch();
  const navigate  = useNavigate();
  const { t } = useTranslation();

  const armPermitted = checkCanArm(role);

  // Sync Countdown with Redux tMinusSeconds state (backend or sandbox decrement)
  useEffect(() => {
    if (!launched) return;

    if (tMinusSeconds === null) {
      dispatch(setTMinus(10));
    }

    const timer = setInterval(() => {
      if (tMinusSeconds !== null) {
        if (tMinusSeconds <= 1) {
          clearInterval(timer);
          dispatch(setTMinus(0));
          navigate('/live-flight');
        } else {
          dispatch(setTMinus(tMinusSeconds - 1));
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [launched, tMinusSeconds, dispatch, navigate]);

  // System Health selectors mapped from real Redux telemetry
  const gpsFixQuality = telemetry.gpsFix ?? 'NO_FIX';
  const gpsGo = gpsFixQuality === 'RTK' || gpsFixQuality === 'SBAS' || gpsFixQuality === 'GPS';
  const canGo = telemetry.canUtilisationPct < 70;

  const healthItems = [
    { n: 'Battery Pack 1', v: '8.2V', s: 'GO', sub: 'Nominal' },
    { 
      n: 'Telemetry Link', 
      v: telemetry.time > 0 ? 'Active' : 'Offline', 
      s: telemetry.time > 0 ? 'GO' : 'NO_GO', 
      sub: telemetry.time > 0 ? `${Math.floor(telemetry.time)}s uptime` : 'No frames' 
    },
    { 
      n: 'GPS Fix', 
      v: gpsFixQuality, 
      s: gpsGo ? 'GO' : 'NO_GO', 
      sub: `${telemetry.gpsSatellites} Sats` 
    },
    { n: 'IMU Biases', v: 'Stable', s: 'GO', sub: 'Nominal' },
    { 
      n: 'Servo Sweep', 
      v: checklistProgress >= 9 ? 'Passed' : 'Pending', 
      s: checklistProgress >= 9 ? 'GO' : 'NO_GO', 
      sub: '4x OK' 
    },
    { 
      n: 'CAN Bus', 
      v: `${telemetry.canUtilisationPct}%`, 
      s: canGo ? 'GO' : 'NO_GO', 
      sub: '500k' 
    },
    { n: 'Launch Rail', v: 'Level', s: 'GO', sub: '+89.5°' },
    { n: 'Weather Wind', v: '4.2m/s', s: 'GO', sub: 'Limits OK' },
  ];

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleArm = () => {
    if (!armPermitted) {
      alert(t('launch.insufficient_role'));
      return;
    }
    if (!hardwareKeyPresent) {
      alert('Cannot arm: Hardware Key is missing.');
      return;
    }
    dispatch(armLaunch(true));
    auditWrite(dispatch, operatorId ?? 'unknown', 'ARM');
  };

  const handleLaunch = () => {
    dispatch(initiateLaunch());
    auditWrite(dispatch, operatorId ?? 'unknown', 'LAUNCH');
  };

  return (
    <div className="fixed inset-0 bg-black text-slate-100 flex flex-col p-6 z-50 overflow-hidden font-sans">
      {/* Background Kiosk Effect */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 to-black pointer-events-none" />
      
      <header className="relative z-10 flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-4xl font-black tracking-widest text-white uppercase text-red-500 flex items-center gap-3">
            <Rocket className="w-10 h-10" /> {t('launch.title')}
          </h1>
          <p className="text-slate-400 font-mono tracking-widest mt-1">{t('launch.kiosk_mode')} // {t('launch.mission')}: {missionId ?? 'draft'} // {t('common.path')} {missionPath}</p>
        </div>
        <div className="text-right">
          <div className="text-5xl font-mono font-bold text-white tracking-widest">
            {tMinusSeconds !== null
              ? `T- ${String(Math.floor(Math.abs(tMinusSeconds) / 60)).padStart(2,'0')}:${String(Math.floor(Math.abs(tMinusSeconds) % 60)).padStart(2,'0')}`
              : 'T- --:--'}
          </div>
          {tMinusSeconds !== null && tMinusSeconds > 0 ? (
            <div className="text-red-500 font-black text-2xl animate-pulse">IGNITION T-{tMinusSeconds}s</div>
          ) : (
            <div className={clsx('font-bold tracking-widest text-sm mt-1', launchState === 'ARMED' ? 'text-yellow-400 animate-pulse' : launchState === 'LAUNCHED' ? 'text-red-400' : 'text-slate-500')}>
              {launchState === 'IDLE'     && t('launch.hold')}
              {launchState === 'ARMED'    && t('launch.awaiting_launch')}
              {launchState === 'LAUNCHED' && t('launch.launched')}
              {launchState === 'ABORTED'  && t('launch.aborted')}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-3 gap-8 relative z-10 min-h-0">
        {/* System Health Column */}
        <div className="col-span-1 border border-slate-800 bg-slate-900/50 p-6 rounded-xl flex flex-col">
          <h2 className="text-xl font-bold uppercase tracking-widest mb-6 border-b border-slate-700 pb-2">{t('launch.system_go_nogo')}</h2>
          <div className="space-y-4 flex-1 overflow-y-auto pr-2 font-mono text-sm">
            {healthItems.map(item => (
              <div key={item.n} className={clsx(
                'flex justify-between items-center p-3 rounded border transition-all',
                item.s === 'GO'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/20 text-red-300'
              )}>
                <div>
                  <div className="font-bold text-slate-300">{item.n}</div>
                  <div className="text-xs text-slate-500">{item.v} | {item.sub}</div>
                </div>
                <div className={clsx(
                  'px-3 py-1 font-black rounded text-black text-xs tracking-wider uppercase',
                  item.s === 'GO' ? 'bg-emerald-500' : 'bg-red-500 text-white'
                )}>{item.s}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions Column */}
        <div className="col-span-2 flex flex-col gap-8">
          
          <div className="border border-slate-800 bg-slate-900/50 p-8 rounded-xl flex-1 flex flex-col items-center justify-center">
            
            {!armed ? (
              <div className="w-full max-w-md space-y-6 text-center">
                <Shield className={clsx('w-16 h-16 mx-auto mb-4', armPermitted ? 'text-red-500' : 'text-slate-600')} />
                <h3 className="text-2xl font-bold uppercase tracking-widest">{t('launch.arm_sequence')}</h3>

                <div className={clsx(
                  'w-full border-2 rounded-lg p-4 font-mono text-sm text-left',
                  armPermitted
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/40 bg-red-500/10 text-red-400'
                )}>
                  <div className="text-xs text-slate-500 mb-1 uppercase tracking-widest">{t('common.operator')}</div>
                  <div className="font-bold">{operatorId ?? '—'}</div>
                  <div className="text-xs mt-1">
                    Role: <span className="uppercase font-bold">{role ?? 'none'}</span>
                    {armPermitted
                      ? <span className="ml-2 text-emerald-400">✓ {t('launch.authority_granted')}</span>
                      : <span className="ml-2 text-red-400">✗ {t('launch.insufficient_role')}</span>}
                  </div>
                  <div className="text-xs text-slate-600 mt-2 border-t border-slate-700 pt-2">
                    {t('launch.credential')}: {isKeycloakEnabled ? 'Keycloak OIDC' : 'Local Form'}
                  </div>
                </div>

                <button
                  onClick={handleArm}
                  disabled={!armPermitted}
                  className={clsx(
                    'w-full border-2 font-black tracking-widest p-4 rounded-lg uppercase transition-all',
                    armPermitted
                      ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                  )}
                >
                  {t('launch.confirm_arm')}
                </button>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center space-y-8 animate-in zoom-in duration-300">
                <div className="flex items-center gap-4 text-red-500 bg-red-500/10 px-6 py-3 rounded-full border border-red-500/50">
                  <Unlock className="w-6 h-6 animate-pulse" />
                  <span className="text-xl font-bold tracking-widest uppercase">{t('launch.armed')}</span>
                </div>
                
                <button 
                  onClick={handleLaunch}
                  disabled={launched}
                  className={clsx(
                    "w-64 h-64 rounded-full border-8 font-black text-4xl tracking-widest uppercase transition-all shadow-[0_0_100px_rgba(239,68,68,0.5)]",
                    launched 
                      ? "bg-red-900 border-red-700 text-red-500 cursor-not-allowed opacity-50" 
                      : "bg-red-600 border-red-400 hover:bg-red-500 hover:scale-105 active:scale-95 text-white"
                  )}
                >
                  {launched ? t('launch.ignition') : t('launch.launch')}
                </button>
              </div>
            )}
            
          </div>

          <button
            onClick={() => { dispatch(abort('OPERATOR_ABORT')); auditWrite(dispatch, operatorId ?? 'unknown', 'ABORT'); }}
            className="w-full bg-red-900/50 hover:bg-red-600 border-2 border-red-500 text-white font-black tracking-widest text-2xl p-6 rounded-xl uppercase transition-all flex justify-center items-center gap-4">
            <AlertTriangle className="w-8 h-8" /> {t('launch.emergency_abort')}
          </button>

        </div>
      </div>
    </div>
  );
}
