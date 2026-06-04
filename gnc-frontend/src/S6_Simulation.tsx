import React, { useState } from 'react';
import S6a_Sim3DOF from './S6a_Sim3DOF';
import S6b_SimTuning from './S6b_SimTuning';
import S6c_SimFull from './S6c_SimFull';
import clsx from 'clsx';
import { Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function S6_Simulation() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'3dof' | '6dof_tuning' | '6dof_full'>('3dof');

  return (
    <div className="h-full flex flex-col space-y-2">
      {/* Header and Tabs */}
      <header className="flex justify-between items-end border-b border-slate-800 pb-2 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1 flex items-center gap-3">
            <Layers className="w-7 h-7 text-indigo-500" /> {t('simulation.title')}
          </h1>
          <p className="text-slate-400 text-sm">{t('simulation.subtitle')}</p>
        </div>
        <div className="flex gap-1 bg-slate-900/60 border border-slate-700/50 rounded-xl p-1 shrink-0">
          <button
            onClick={() => setActiveTab('3dof')}
            className={clsx('px-4 py-1.5 text-sm font-medium rounded-lg transition-all', activeTab === '3dof' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800')}
          >
            {t('simulation.3dof_basic')}
          </button>
          <button
            onClick={() => setActiveTab('6dof_tuning')}
            className={clsx('px-4 py-1.5 text-sm font-medium rounded-lg transition-all', activeTab === '6dof_tuning' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800')}
          >
            {t('simulation.6dof_tuning')}
          </button>
          <button
            onClick={() => setActiveTab('6dof_full')}
            className={clsx('px-4 py-1.5 text-sm font-medium rounded-lg transition-all', activeTab === '6dof_full' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800')}
          >
            {t('simulation.6dof_full')}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === '3dof' && <S6a_Sim3DOF hideHeader />}
        {activeTab === '6dof_tuning' && <S6b_SimTuning hideHeader />}
        {activeTab === '6dof_full' && <S6c_SimFull hideHeader />}
      </div>
    </div>
  );
}
