import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import clsx from 'clsx';
import { useAppSelector, useAppDispatch } from './store/hooks';
import {
  addGuidanceEntry, updateGuidanceEntry, removeGuidanceEntry,
  type GuidanceEntry
} from './store/guidanceLibrarySlice';
import { useTranslation } from 'react-i18next';

function blankEntry(id: string): GuidanceEntry {
  return {
    id,
    name: 'New Guidance',
    algorithm: 'APEX',
    update_rate_hz: 50,
    energy_management: true,
    waypoint_tolerance_m: 100
  };
}

export default function S8c_GuidanceDesign() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const entries = useAppSelector(s => s.guidanceLibrary.entries);
  const ids = Object.keys(entries);

  const [selectedId, setSelectedId] = useState<string | null>(ids[0] ?? null);
  const [newId, setNewId] = useState('');
  const [draft, setDraft] = useState<GuidanceEntry | null>(null);

  const selected = selectedId ? entries[selectedId] : null;
  const editing = draft ?? selected;

  function selectEntry(id: string) {
    setSelectedId(id);
    setDraft(null);
  }

  function patchDraft(patch: Partial<GuidanceEntry>) {
    setDraft(prev => ({ ...(prev ?? entries[selectedId!]), ...patch } as GuidanceEntry));
  }

  function saveEntry() {
    if (!editing) return;
    if (entries[editing.id]) {
      dispatch(updateGuidanceEntry({ id: editing.id, patch: editing }));
    } else {
      dispatch(addGuidanceEntry(editing));
    }
    setSelectedId(editing.id);
    setDraft(null);
  }

  function addNew() {
    if (!newId.trim() || entries[newId.trim()]) return;
    const entry = blankEntry(newId.trim());
    dispatch(addGuidanceEntry(entry));
    setSelectedId(entry.id);
    setDraft(null);
    setNewId('');
  }

  function deleteSelected() {
    if (!selectedId) return;
    dispatch(removeGuidanceEntry(selectedId));
    setSelectedId(ids.find(i => i !== selectedId) ?? null);
    setDraft(null);
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">{t('guidance.title')}</h1>
          <p className="text-slate-400">{t('guidance.subtitle')}</p>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-5 gap-6 min-h-0">
        {/* Left pane: Library List */}
        <div className="col-span-2 flex flex-col gap-3 min-h-0">
          <div className="flex gap-2">
            <input value={newId} onChange={e => setNewId(e.target.value)}
              placeholder="New entry ID..."
              className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500" />
            <button onClick={addNew} disabled={!newId.trim()}
              className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-50 transition-colors">
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-800/40 border border-slate-700/50 rounded-xl p-2 space-y-1">
            {ids.map(id => {
              const entry = entries[id];
              const isSel = id === selectedId;
              const isMod = draft && id === selectedId;
              return (
                <button key={id} onClick={() => selectEntry(id)}
                  className={clsx('w-full text-left px-3 py-3 rounded-lg flex items-center justify-between border transition-all',
                    isSel ? 'bg-purple-500/20 border-purple-500/50' : 'bg-transparent border-transparent hover:bg-slate-800 hover:border-slate-700'
                  )}>
                  <div>
                    <div className={clsx('font-bold', isSel ? 'text-purple-300' : 'text-slate-300')}>
                      {entry.name} {isMod && '*'}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{id} | {entry.algorithm}</div>
                  </div>
                </button>
              );
            })}
            {ids.length === 0 && (
              <div className="p-4 text-center text-slate-500 text-sm">Library empty.</div>
            )}
          </div>
        </div>

        {/* Right pane: Details */}
        <div className="col-span-3 flex flex-col min-h-0">
          {editing ? (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 flex flex-col h-full overflow-y-auto">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <input
                    value={editing.name}
                    onChange={e => patchDraft({ name: e.target.value })}
                    className="text-2xl font-bold bg-transparent border-b border-transparent focus:border-purple-500 focus:outline-none text-white w-full px-0 py-1"
                  />
                  <div className="text-sm text-slate-500 font-mono mt-1">{editing.id}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={deleteSelected}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                  <button onClick={saveEntry} disabled={!draft}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:bg-slate-700 disabled:text-slate-400 transition-colors">
                    <Save className="w-4 h-4" /> {draft ? 'Save Changes' : 'Saved'}
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 uppercase font-semibold">Algorithm</label>
                    <select className="w-full bg-slate-800 border border-slate-700 rounded p-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500"
                      value={editing.algorithm} onChange={e => patchDraft({ algorithm: e.target.value as any })}>
                      <option value="APEX">APEX (Adaptive Proportional Navigation)</option>
                      <option value="PEG">Powered Explicit Guidance (PEG)</option>
                      <option value="ZEM">Zero Effort Miss (ZEM)</option>
                      <option value="Q-Guidance">Q-Guidance</option>
                      <option value="Kappa">Kappa Guidance</option>
                      <option value="PN">Proportional Navigation (PN)</option>
                      <option value="E-Guidance">E-Guidance</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 uppercase font-semibold">Energy Management</label>
                    <select className="w-full bg-slate-800 border border-slate-700 rounded p-2.5 text-slate-200 text-sm focus:outline-none focus:border-purple-500"
                      value={editing.energy_management ? 'true' : 'false'} onChange={e => patchDraft({ energy_management: e.target.value === 'true' })}>
                      <option value="true">Enabled (Lofting/Energy Preservation)</option>
                      <option value="false">Disabled (Direct Intercept)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Update Rate (Hz)</label>
                    <input type="number" step="any" value={editing.update_rate_hz}
                      onChange={e => patchDraft({ update_rate_hz: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Waypoint Tolerance (m)</label>
                    <input type="number" step="any" value={editing.waypoint_tolerance_m}
                      onChange={e => patchDraft({ waypoint_tolerance_m: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-purple-500" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 border-2 border-dashed border-slate-700/50 rounded-xl flex items-center justify-center text-slate-500">
              Select a guidance profile from the library
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
