import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Info, Zap } from 'lucide-react';
import clsx from 'clsx';
import { useAppSelector, useAppDispatch } from './store/hooks';
import {
  addEntry, updateEntry, removeEntry, setLibrary,
  type ActuatorEntry, type ActuatorModelType,
  type SecondOrderWithDelay, type FirstOrder, type Electromechanical,
} from './store/actuatorLibrarySlice';
import { fetchActuatorLibrary, patchActuatorLibrary } from './services/api';
import { useTranslation } from 'react-i18next';

const MODEL_LABELS: Record<ActuatorModelType, string> = {
  second_order_with_delay: 'model_2nd_order',
  first_order: 'model_1st_order',
  ideal: 'model_ideal',
  electromechanical: 'model_electromechanical',
};

const MODEL_COLORS: Record<ActuatorModelType, string> = {
  second_order_with_delay: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  first_order: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  ideal: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
  electromechanical: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
};

function blankEntry(model: ActuatorModelType, id: string): ActuatorEntry {
  const base = { id, description: '' };
  switch (model) {
    case 'second_order_with_delay':
      return { ...base, model_type: 'second_order_with_delay', wn_rad_s: 0, zeta: 0, delay_s: 0, rate_max_deg_s: 0, delta_max_deg: 30, delta_min_deg: -30, deadband_deg: 0, backlash_deg: 0, config_type: 'X' };
    case 'first_order':
      return { ...base, model_type: 'first_order', tau_s: 0.01, rate_max_deg_s: 0, delta_max_deg: 30, delta_min_deg: -30 };
    case 'ideal':
      return { ...base, model_type: 'ideal', rate_max_deg_s: 100000, delta_max_deg: 30, delta_min_deg: -30 };
    case 'electromechanical':
      return { ...base, model_type: 'electromechanical', motor: { kt_Nm_per_A: 0, ke_Vs_per_rad: 0, R_ohm: 0, L_H: 0, J_motor_kgm2: 0 }, gearbox: { ratio: 1, efficiency: 1 }, rate_max_deg_s: 0, delta_max_deg: 30, delta_min_deg: -30 };
  }
}

function NumField({ label, value, onChange, unit }: { label: string; value: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">{label}{unit && <span className="text-slate-600 ml-1">({unit})</span>}</label>
      <input type="number" step="any" value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-500" />
    </div>
  );
}

export default function S5b_ActuatorLibrary() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const entries = useAppSelector(s => s.actuatorLibrary.entries);
  const ids = Object.keys(entries);

  useEffect(() => {
    if (Object.keys(entries).length === 0) {
      fetchActuatorLibrary()
        .then(data => { if (Object.keys(data).length > 0) dispatch(setLibrary(data)); })
        .catch(() => { /* backend not yet live — use Redux initial state */ });
    }
  }, [dispatch, entries]);

  const [selectedId, setSelectedId] = useState<string | null>(ids[0] ?? null);
  const [newModel, setNewModel] = useState<ActuatorModelType>('second_order_with_delay');
  const [newId, setNewId] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [draft, setDraft] = useState<ActuatorEntry | null>(null);

  const selected = selectedId ? entries[selectedId] : null;
  const editing = draft ?? selected;

  function selectEntry(id: string) {
    setSelectedId(id);
    setDraft(null);
  }

  function patchDraft(patch: Partial<ActuatorEntry>) {
    setDraft(prev => ({ ...(prev ?? entries[selectedId!]), ...patch } as ActuatorEntry));
  }

  async function saveEntry() {
    if (!editing) return;
    try {
      const updated = await patchActuatorLibrary([{ op: 'add', path: `/${editing.id}`, value: editing }]);
      dispatch(setLibrary(updated));
    } catch {
      if (entries[editing.id]) {
        dispatch(updateEntry({ id: editing.id, patch: editing }));
      } else {
        dispatch(addEntry(editing));
      }
    }
    setSelectedId(editing.id);
    setDraft(null);
  }

  function addNew() {
    if (!newId.trim() || entries[newId.trim()]) return;
    const entry = blankEntry(newModel, newId.trim());
    dispatch(addEntry(entry));
    setSelectedId(entry.id);
    setDraft(null);
    setNewId('');
  }

  function deleteSelected() {
    if (!selectedId) return;
    dispatch(removeEntry(selectedId));
    setSelectedId(ids.find(i => i !== selectedId) ?? null);
    setDraft(null);
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">{t('actuators.title')}</h1>
          <p className="text-slate-400">{t('actuators.subtitle')}</p>
        </div>
        <button onClick={() => setShowGuide(g => !g)}
          className="flex items-center gap-2 text-sm px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors">
          <Info className="w-4 h-4 text-blue-400" /> Datasheet Guide
        </button>
      </header>

      {showGuide && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-5 text-sm text-slate-300 space-y-1">
          <div className="font-bold text-blue-300 mb-2">Datasheet → Parameter Conversion (§2.8.6)</div>
          <div><span className="text-blue-400 font-mono">ωₙ</span> = 2π · f₋₃dB (bandwidth → natural frequency)</div>
          <div><span className="text-blue-400 font-mono">ζ</span> = −ln(Mp) / √(π² + ln²(Mp)) from step-response peak overshoot Mp</div>
          <div><span className="text-blue-400 font-mono">rate_max</span> = 60° / t₆₀ (slew rate from datasheet time-to-60°)</div>
          <div><span className="text-blue-400 font-mono">delay_s</span> = transport delay or oscilloscope-measured command-to-motion-start</div>
          <div><span className="text-blue-400 font-mono">deadband_deg</span> = manufacturer dead zone; <span className="text-blue-400 font-mono">backlash_deg</span> = dial-indicator measurement</div>
        </div>
      )}

      <div className="flex-1 grid grid-cols-5 gap-6 min-h-0">

        {/* Left — list */}
        <div className="col-span-2 flex flex-col gap-3 min-h-0">
          <div className="flex gap-2">
            <input value={newId} onChange={e => setNewId(e.target.value)}
              placeholder={t('actuators.new_entry_id')}
              className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
            <select value={newModel} onChange={e => setNewModel(e.target.value as ActuatorModelType)}
              className="bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500">
              {(Object.keys(MODEL_LABELS) as ActuatorModelType[]).map(m => (
                <option key={m} value={m}>{t(`actuators.${MODEL_LABELS[m]}`)}</option>
              ))}
            </select>
            <button onClick={addNew} disabled={!newId.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg transition-colors">
              <Plus className="w-4 h-4 text-white" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {ids.map(id => {
              const e = entries[id];
              return (
                <button key={id} onClick={() => selectEntry(id)}
                  className={clsx('w-full text-left p-3 rounded-lg border transition-all',
                    selectedId === id
                      ? 'bg-blue-600/20 border-blue-500/50 text-white'
                      : 'bg-slate-900/40 border-slate-700/50 text-slate-300 hover:border-slate-600')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium font-mono text-sm truncate">{id}</span>
                    <span className={clsx('text-xs px-2 py-0.5 rounded border shrink-0', MODEL_COLORS[e.model_type])}>
                      {MODEL_LABELS[e.model_type]}
                    </span>
                  </div>
                  {e.description && <div className="text-xs text-slate-500 mt-0.5 truncate">{e.description}</div>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right — editor */}
        <div className="col-span-3 bg-slate-900/40 border border-slate-700/50 rounded-xl flex flex-col overflow-hidden min-h-0">
          {!editing ? (
            <div className="flex-1 flex items-center justify-center text-slate-600">
              <div className="text-center"><Zap className="w-10 h-10 mx-auto mb-3 opacity-30" /><div>Select or create an entry</div></div>
            </div>
          ) : (
            <>
              <div className="px-6 pt-5 pb-4 border-b border-slate-700/50 flex items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-white font-mono">{editing.id}</div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded border mt-1 inline-block', MODEL_COLORS[editing.model_type])}>
                    {MODEL_LABELS[editing.model_type]}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={deleteSelected} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg border border-red-500/30 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={saveEntry}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
                    <Save className="w-4 h-4" /> Save
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Description</label>
                  <input value={editing.description}
                    onChange={e => patchDraft({ description: e.target.value })}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
                </div>

                {/* Common limits */}
                <div className="grid grid-cols-3 gap-4">
                  <NumField label={t('actuators.delta_max')} unit="deg" value={editing.delta_max_deg} onChange={v => patchDraft({ delta_max_deg: v } as Partial<ActuatorEntry>)} />
                  <NumField label={t('actuators.delta_min')} unit="deg" value={editing.delta_min_deg} onChange={v => patchDraft({ delta_min_deg: v } as Partial<ActuatorEntry>)} />
                  <NumField label={t('actuators.rate_max')} unit="°/s" value={editing.rate_max_deg_s} onChange={v => patchDraft({ rate_max_deg_s: v } as Partial<ActuatorEntry>)} />
                </div>

                {/* Model-specific fields */}
                {editing.model_type === 'second_order_with_delay' && (() => {
                  const e = editing as SecondOrderWithDelay;
                  return (
                    <div className="space-y-4">
                      <div className="text-xs text-slate-500 uppercase tracking-wider pt-1 border-t border-slate-700/50">{t('actuators.dynamic_params')}</div>
                      <div className="grid grid-cols-3 gap-4">
                        <NumField label={t('actuators.omega_n')} unit="rad/s" value={e.wn_rad_s} onChange={v => patchDraft({ wn_rad_s: v } as Partial<ActuatorEntry>)} />
                        <NumField label={t('actuators.zeta')} value={e.zeta} onChange={v => patchDraft({ zeta: v } as Partial<ActuatorEntry>)} />
                        <NumField label={t('actuators.delay')} unit="s" value={e.delay_s} onChange={v => patchDraft({ delay_s: v } as Partial<ActuatorEntry>)} />
                        <NumField label={t('actuators.deadband')} unit="deg" value={e.deadband_deg} onChange={v => patchDraft({ deadband_deg: v } as Partial<ActuatorEntry>)} />
                        <NumField label={t('actuators.backlash')} unit="deg" value={e.backlash_deg} onChange={v => patchDraft({ backlash_deg: v } as Partial<ActuatorEntry>)} />
                        <div>
                          <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">{t('actuators.config_type')}</label>
                          <select value={e.config_type}
                            onChange={ev => patchDraft({ config_type: ev.target.value as 'X' | 'plus' } as Partial<ActuatorEntry>)}
                            className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500">
                            <option value="X">{t('actuators.config_x')}</option>
                            <option value="plus">{t('actuators.config_plus')}</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {editing.model_type === 'first_order' && (() => {
                  const e = editing as FirstOrder;
                  return (
                    <div className="space-y-4">
                      <div className="text-xs text-slate-500 uppercase tracking-wider pt-1 border-t border-slate-700/50">{t('actuators.dynamic_params')}</div>
                      <div className="grid grid-cols-3 gap-4">
                        <NumField label={t('actuators.tau')} unit="s" value={e.tau_s} onChange={v => patchDraft({ tau_s: v } as Partial<ActuatorEntry>)} />
                      </div>
                    </div>
                  );
                })()}

                {editing.model_type === 'electromechanical' && (() => {
                  const e = editing as Electromechanical;
                  return (
                    <div className="space-y-4">
                      <div className="text-xs text-slate-500 uppercase tracking-wider pt-1 border-t border-slate-700/50">{t('actuators.motor_params')}</div>
                      <div className="grid grid-cols-3 gap-4">
                        <NumField label={t('actuators.kt')} unit="Nm/A" value={e.motor.kt_Nm_per_A} onChange={v => patchDraft({ motor: { ...e.motor, kt_Nm_per_A: v } } as Partial<ActuatorEntry>)} />
                        <NumField label={t('actuators.ke')} unit="Vs/rad" value={e.motor.ke_Vs_per_rad} onChange={v => patchDraft({ motor: { ...e.motor, ke_Vs_per_rad: v } } as Partial<ActuatorEntry>)} />
                        <NumField label={t('actuators.r')} unit="Ω" value={e.motor.R_ohm} onChange={v => patchDraft({ motor: { ...e.motor, R_ohm: v } } as Partial<ActuatorEntry>)} />
                        <NumField label={t('actuators.l')} unit="H" value={e.motor.L_H} onChange={v => patchDraft({ motor: { ...e.motor, L_H: v } } as Partial<ActuatorEntry>)} />
                        <NumField label={t('actuators.j_motor')} unit="kg·m²" value={e.motor.J_motor_kgm2} onChange={v => patchDraft({ motor: { ...e.motor, J_motor_kgm2: v } } as Partial<ActuatorEntry>)} />
                      </div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider pt-1 border-t border-slate-700/50">{t('actuators.gearbox_params')}</div>
                      <div className="grid grid-cols-3 gap-4">
                        <NumField label={t('actuators.ratio')} value={e.gearbox.ratio} onChange={v => patchDraft({ gearbox: { ...e.gearbox, ratio: v } } as Partial<ActuatorEntry>)} />
                        <NumField label={t('actuators.efficiency')} value={e.gearbox.efficiency} onChange={v => patchDraft({ gearbox: { ...e.gearbox, efficiency: v } } as Partial<ActuatorEntry>)} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
