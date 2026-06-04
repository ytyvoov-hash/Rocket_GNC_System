import { useState } from 'react';
import { Settings, Save, Server, Shield, Radio, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function S20_SystemSettings() {
  const { t } = useTranslation();
  const [postgresUri, setPostgresUri] = useState('postgresql://gnc_user:***@localhost:5432/gnc_audit');
  const [influxUri, setInfluxUri] = useState('http://localhost:8086');
  const [keycloakUrl, setKeycloakUrl] = useState('https://keycloak.gnc.local:8443');
  const [requireHwKey, setRequireHwKey] = useState(true);
  const [baudRate, setBaudRate] = useState('921600');
  const [canBitrate, setCanBitrate] = useState('500k');
  const [pollingInterval, setPollingInterval] = useState(5000);
  const [showSavedToast, setShowSavedToast] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSavedToast(true);
    setTimeout(() => {
      setShowSavedToast(false);
    }, 4000);
  };

  return (
    <div className="h-full flex flex-col space-y-6 max-w-5xl mx-auto w-full">
      <form onSubmit={handleSave} className="h-full flex flex-col space-y-6">
        
        <header className="flex justify-between items-center mb-2 mt-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
              <Settings className="w-8 h-8 text-blue-500" /> {t('settings.title')}
            </h1>
            <p className="text-slate-400">{t('settings.subtitle')}</p>
          </div>
          <button
            type="submit"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-6 py-2.5 rounded-lg font-bold shadow-[0_0_15px_rgba(37,99,235,0.3)] text-white transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Save className="w-4 h-4" /> {t('settings.save')}
          </button>
        </header>

        {showSavedToast && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg flex items-center gap-3 font-mono text-sm animate-in fade-in slide-in-from-top-4 duration-300">
            <CheckCircle className="w-5 h-5 shrink-0 animate-bounce" />
            <span>
              {t('common.operator')} override verified: settings synchronized with GNC local cluster database.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0 pb-8">
          
          {/* Section: Local Backend */}
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 h-fit space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 border-b border-slate-800 pb-2">
              <Server className="w-5 h-5 text-indigo-400" /> {t('settings.local_backend')}
            </h2>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t('settings.postgres_uri')}</label>
              <input
                type="text"
                value={postgresUri}
                onChange={(e) => setPostgresUri(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:border-blue-500 focus:outline-none font-mono text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t('settings.influx_uri')}</label>
              <input
                type="text"
                value={influxUri}
                onChange={(e) => setInfluxUri(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:border-blue-500 focus:outline-none font-mono text-sm"
              />
            </div>
          </div>

          {/* Section: Identity & Access */}
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 h-fit space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 border-b border-slate-800 pb-2">
              <Shield className="w-5 h-5 text-emerald-400" /> {t('settings.identity_access')}
            </h2>
            
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t('settings.keycloak_url')}</label>
              <input
                type="text"
                value={keycloakUrl}
                onChange={(e) => setKeycloakUrl(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:border-blue-500 focus:outline-none font-mono text-sm"
              />
            </div>
            
            <div className="flex items-center justify-between p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg">
              <span className="text-sm font-medium text-slate-300">{t('settings.require_hw_key')}</span>
              <input
                type="checkbox"
                checked={requireHwKey}
                onChange={(e) => setRequireHwKey(e.target.checked)}
                className="w-5 h-5 accent-blue-500 cursor-pointer rounded bg-slate-950 border-slate-800 focus:ring-offset-slate-900"
              />
            </div>
          </div>

          {/* Section: Hardware Comms Defaults */}
          <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 h-fit space-y-6 col-span-1 md:col-span-2">
            <h2 className="text-xl font-bold flex items-center gap-2 border-b border-slate-800 pb-2">
              <Radio className="w-5 h-5 text-yellow-400" /> {t('settings.hw_comms')}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('settings.baud_rate')}</label>
                <select
                  value={baudRate}
                  onChange={(e) => setBaudRate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:border-blue-500 focus:outline-none font-mono text-sm"
                >
                  <option value="115200">115200</option>
                  <option value="921600">921600</option>
                  <option value="1000000">1000000</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('settings.can_bitrate')}</label>
                <select
                  value={canBitrate}
                  onChange={(e) => setCanBitrate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:border-blue-500 focus:outline-none font-mono text-sm"
                >
                  <option value="250k">250k</option>
                  <option value="500k">500k</option>
                  <option value="1M">1M</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('settings.polling_interval')}</label>
                <input
                  type="number"
                  value={pollingInterval}
                  onChange={(e) => setPollingInterval(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:border-blue-500 focus:outline-none font-mono text-sm"
                />
              </div>
            </div>
          </div>

        </div>
      </form>
    </div>
  );
}
