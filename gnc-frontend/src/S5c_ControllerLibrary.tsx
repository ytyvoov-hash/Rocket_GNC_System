import { useState } from 'react';
import { Plus, Trash2, GitBranch, Save } from 'lucide-react';
import { useAppSelector, useAppDispatch } from './store/hooks';
import {
  addControllerEntry, updateControllerEntry, removeControllerEntry,
  type ControllerModelType
} from './store/controllerLibrarySlice';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

export default function S5c_ControllerLibrary() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const entries = useAppSelector(state => state.controllerLibrary.entries);
  const entriesList = Object.values(entries);
  const [selectedId, setSelectedId] = useState<string | null>(entriesList[0]?.id || null);

  const selectedEntry = selectedId ? entries[selectedId] : undefined;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 h-[calc(100vh-64px)] flex flex-col">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <GitBranch className="w-8 h-8 text-indigo-400" />
            {t('controllers.title')}
          </h1>
          <p className="text-slate-400 mt-2">{t('controllers.subtitle')}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              const newId = `ctrl_${Math.random().toString(36).substr(2, 6)}`;
              dispatch(addControllerEntry({
                id: newId,
                name: 'New Controller',
                type: 'pid',
                description: 'Description',
                gains: {}, algorithm: 'PID', controller_type: 'pid'
              }));
              setSelectedId(newId);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" /> {t('controllers.add')}
          </button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-80 bg-slate-900 border border-slate-700/50 rounded-xl overflow-y-auto flex flex-col">
          {entriesList.map(entry => (
            <button
              key={entry.id}
              onClick={() => setSelectedId(entry.id)}
              className={clsx(
                'w-full text-left p-4 border-b border-slate-800 transition-colors hover:bg-slate-800/50',
                selectedId === entry.id ? 'bg-slate-800/80 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'
              )}
            >
              <div className="font-semibold text-slate-200">{entry.name}</div>
              <div className="text-xs text-slate-500 mt-1 flex justify-between">
                <span>{entry.type.toUpperCase()}</span>
              </div>
            </button>
          ))}
          {entriesList.length === 0 && (
            <div className="p-8 text-center text-slate-500 italic">No controllers in library</div>
          )}
        </div>

        {/* Editor */}
        <div className="flex-1 bg-slate-900 border border-slate-700/50 rounded-xl overflow-y-auto p-6">
          {selectedEntry ? (
            <div className="space-y-6 max-w-3xl">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-slate-200 mb-1">Edit Controller Definition</h2>
                  <p className="text-sm text-slate-500">ID: {selectedEntry.id}</p>
                </div>
                <button
                  onClick={() => {
                    dispatch(removeControllerEntry(selectedEntry.id));
                    setSelectedId(entriesList[0]?.id || null);
                  }}
                  className="text-slate-400 hover:text-red-400 p-2 rounded-lg hover:bg-slate-800"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Name</label>
                  <input
                    type="text"
                    value={selectedEntry.name}
                    onChange={e => dispatch(updateControllerEntry({ id: selectedEntry.id, updates: { name: e.target.value } }))}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Type</label>
                  <select
                    value={selectedEntry.type}
                    onChange={e => dispatch(updateControllerEntry({ id: selectedEntry.id, updates: { type: e.target.value as ControllerModelType } }))}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="pid">PID (Proportional Integral Derivative)</option>
                    <option value="lqr">LQR (Linear Quadratic Regulator)</option>
                    <option value="acados">ACADOS MPC</option>
                    <option value="casadi">CasADi Non-linear Opt</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Description</label>
                <textarea
                  value={selectedEntry.description}
                  onChange={e => dispatch(updateControllerEntry({ id: selectedEntry.id, updates: { description: e.target.value } }))}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 resize-none h-24"
                />
              </div>

              <div className="pt-6 border-t border-slate-700/50">
                <h3 className="text-lg font-semibold text-slate-300 mb-4">Tuning Parameters</h3>
                {selectedEntry.type === 'pid' && (
                  <div className="grid grid-cols-3 gap-4">
                    {['kp', 'ki', 'kd'].map(k => (
                      <div key={k}>
                        <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">{k}</label>
                        <input
                          type="number"
                          step="0.01"
                          value={(selectedEntry.gains[k] as number) || 0}
                          onChange={e => dispatch(updateControllerEntry({ id: selectedEntry.id, updates: { gains: { ...selectedEntry.gains, [k]: parseFloat(e.target.value) } } }))}
                          className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    ))}
                  </div>
                )}
                {selectedEntry.type === 'lqr' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">Q Matrix (Diagonal elements, comma-separated)</label>
                      <input
                        type="text"
                        value={((selectedEntry.gains.q_diag as number[]) || []).join(', ')}
                        onChange={e => {
                          const arr = e.target.value.split(',').map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
                          dispatch(updateControllerEntry({ id: selectedEntry.id, updates: { gains: { ...selectedEntry.gains, q_diag: arr } } }));
                        }}
                        placeholder="10, 10, 10, 1, 1, 1"
                        className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wider text-slate-500 mb-1 block">R Matrix (Diagonal elements, comma-separated)</label>
                      <input
                        type="text"
                        value={((selectedEntry.gains.r_diag as number[]) || []).join(', ')}
                        onChange={e => {
                          const arr = e.target.value.split(',').map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
                          dispatch(updateControllerEntry({ id: selectedEntry.id, updates: { gains: { ...selectedEntry.gains, r_diag: arr } } }));
                        }}
                        placeholder="1, 1, 1"
                        className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
                {['acados', 'casadi'].includes(selectedEntry.type) && (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-200/80 text-sm">
                    Advanced MPC and CasADi solvers require code-generation on the backend. Parameters cannot be edited directly via UI; please upload a trained model package.
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500">
              Select a controller to edit or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
