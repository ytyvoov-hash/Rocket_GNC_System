import { useState } from 'react';
import { Plus, Trash2, Save, Settings, Sliders, Activity } from 'lucide-react';
import clsx from 'clsx';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { 
  type ControllerEntry,
  addControllerEntry,
  updateControllerEntry,
  removeControllerEntry
} from './store/controllerLibrarySlice';
import { useTranslation } from 'react-i18next';
// If we had Redux actions for adding/updating controllers, we would import them here.
// For now we'll just mock the Redux dispatch since controllerLibrarySlice only has setLibrary currently, 
// wait, we can just use the patch pattern or I'll assume we'll just dispatch an action if we added it to slice.
// Actually, controllerLibrarySlice.ts doesn't have add/update/remove exported in our previous check. I need to update it too.

// We will use standard mock operations for now.
import S8_ControlDesignLab from './S8_ControlDesignLab';
import S9_GainScheduleEditor from './S9_GainScheduleEditor';
import S10_StabilityAnalysis from './S10_StabilityAnalysis';

function blankEntry(id: string): ControllerEntry {
  return {
    id,
    name: 'New Controller',
    algorithm: 'PID',
    controller_type: 'pid',
    type: 'pid',
    description: '',
    gains: { kp: 1.0, ki: 0.0, kd: 0.0 }
  };
}

export default function S8b_ControlWorkbench() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const entries = useAppSelector(s => s.controllerLibrary.entries);
  const ids = Object.keys(entries);

  const [selectedId, setSelectedId] = useState<string | null>(ids[0] ?? null);
  const [newId, setNewId] = useState('');
  const [draft, setDraft] = useState<ControllerEntry | null>(null);

  const [activeTab, setActiveTab] = useState('design');
  const tabs = [
    { id: 'design', label: 'Step Response', icon: Sliders },
    { id: 'gains', label: 'Gain Schedule', icon: Activity },
    { id: 'stability', label: 'Stability', icon: Activity },
  ];

  const selected = selectedId ? entries[selectedId] : null;
  const editing = draft ?? selected;

  function selectEntry(id: string) {
    setSelectedId(id);
    setDraft(null);
  }

  function patchDraft(patch: Partial<ControllerEntry>) {
    setDraft(prev => ({ ...(prev ?? entries[selectedId!]), ...patch } as ControllerEntry));
  }

  function saveEntry() {
    if (!editing) return;
    if (entries[editing.id]) {
      dispatch(updateControllerEntry({ id: editing.id, updates: editing }));
    } else {
      dispatch(addControllerEntry(editing));
    }
    setSelectedId(editing.id);
    setDraft(null);
  }

  function addNew() {
    if (!newId.trim() || entries[newId.trim()]) return;
    const entry = blankEntry(newId.trim());
    dispatch(addControllerEntry(entry));
    setSelectedId(entry.id);
    setDraft(null);
    setNewId('');
  }

  function deleteSelected() {
    if (!selectedId) return;
    dispatch(removeControllerEntry(selectedId));
    setSelectedId(ids.find(i => i !== selectedId) ?? null);
    setDraft(null);
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">{t('workbench.title')}</h1>
          <p className="text-slate-400">{t('workbench.subtitle')}</p>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-5 gap-6 min-h-0">
        {/* Left pane: Library List */}
        <div className="col-span-1 flex flex-col gap-3 min-h-0 min-w-[250px]">
          <div className="flex gap-2">
            <input value={newId} onChange={e => setNewId(e.target.value)}
              placeholder="New ID..."
              className="flex-1 w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
            <button onClick={addNew} disabled={!newId.trim()}
              className="p-2 shrink-0 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-50 transition-colors">
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
                    isSel ? 'bg-blue-500/20 border-blue-500/50' : 'bg-transparent border-transparent hover:bg-slate-800 hover:border-slate-700'
                  )}>
                  <div className="overflow-hidden">
                    <div className={clsx('font-bold truncate', isSel ? 'text-blue-300' : 'text-slate-300')}>
                      {entry.name} {isMod && '*'}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5 truncate">{id}</div>
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
        <div className="col-span-4 flex flex-col min-h-0 bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 overflow-y-auto">
          {editing ? (
            <>
              <div className="flex justify-between items-start mb-6">
                <div className="flex-1">
                  <input
                    value={editing.name}
                    onChange={e => patchDraft({ name: e.target.value })}
                    className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-slate-600 focus:border-blue-500 focus:outline-none text-white w-full px-0 py-1 transition-colors"
                  />
                  <div className="text-sm text-slate-500 font-mono mt-2 flex items-center gap-3">
                    <span>{editing.id}</span>
                    <span className="text-slate-600">|</span>
                    <select 
                      value={editing.algorithm} 
                      onChange={e => patchDraft({ algorithm: e.target.value, type: e.target.value.toLowerCase() as any, controller_type: e.target.value.toLowerCase() })}
                      className="bg-slate-800/80 border border-slate-700 rounded text-xs px-2 py-1 focus:outline-none focus:border-blue-500"
                    >
                      <option value="PID">PID</option>
                      <option value="LQR">LQR</option>
                      <option value="H_INF">H-Infinity</option>
                      <option value="SMC">Sliding Mode Control (SMC)</option>
                      <option value="MPC">Model Predictive Control (MPC)</option>
                      <option value="INDI">INDI</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={deleteSelected}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                  <button onClick={saveEntry} disabled={!draft}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:bg-slate-700 disabled:text-slate-400 transition-colors">
                    <Save className="w-4 h-4" /> {draft ? 'Save Changes' : 'Saved'}
                  </button>
                </div>
              </div>

              {/* Internal Navigation Tabs */}
              <div className="flex border-b border-slate-700/50 mb-6">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      'flex items-center gap-2 px-6 py-3 font-semibold transition-all border-b-2',
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    )}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content Wrapper */}
              <div className="flex-1 min-h-0">
                {activeTab === 'design' && <S8_ControlDesignLab isEmbedded entryId={editing.id} />}
                {activeTab === 'gains' && <S9_GainScheduleEditor />}
                {activeTab === 'stability' && <S10_StabilityAnalysis />}
              </div>
            </>
          ) : (
            <div className="flex-1 border-2 border-dashed border-slate-700/50 rounded-xl flex items-center justify-center text-slate-500">
              Select a controller profile from the library
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
