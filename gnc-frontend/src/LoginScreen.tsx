import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, KeyRound, Shield, AlertCircle, ArrowRight, LogIn } from 'lucide-react';
import clsx from 'clsx';
import { useAppDispatch } from './store/hooks';
import { login } from './store/authSlice';
import { setHardwareKey } from './store/systemSlice';
import { keycloak, isKeycloakEnabled } from './services/keycloak';
import { auditWrite } from './utils/audit';
import { useTranslation } from 'react-i18next';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hardwareKeyChecked, setHardwareKeyChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }
    setLoading(true);
    setError('');
    // Simulate login and redirect
    setTimeout(() => {
      setLoading(false);
      const role = username.includes('admin') ? 'admin' : username.includes('operator') ? 'operator' : 'engineer';
      dispatch(login({ operatorId: username, role }));
      dispatch(setHardwareKey(hardwareKeyChecked));
      auditWrite(dispatch, username, 'FORM_LOGIN');
      navigate('/dashboard');
    }, 1000);
  };


  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient light */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />

      {/* Main Glass Panel */}
      <div className="glass-panel w-full max-w-4xl grid md:grid-cols-2 overflow-hidden shadow-2xl z-10 relative">
        
        {/* Left Side: Branding / Info */}
        <div className="p-10 flex flex-col justify-between bg-slate-900/50 border-r border-slate-700/50">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <Shield className="w-8 h-8 text-blue-500" />
              <span className="font-bold text-2xl tracking-tight">{t('platform_name')}</span>
            </div>
            <h1 className="text-3xl font-bold mb-4">{t('login.subtitle')}</h1>
            <p className="text-slate-400 mb-8 leading-relaxed">
              {t('login.description')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{t('login.mtls')}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span>{t('login.keycloak_active')}</span>
            </div>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="p-10 flex flex-col justify-center relative">
          <h2 className="text-2xl font-semibold mb-6">{t('login.title')}</h2>

          {isKeycloakEnabled && (
            <button
              type="button"
              onClick={() => keycloak?.login()}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 mb-6 border border-blue-500/50 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-sm font-medium transition-all"
            >
              <LogIn className="w-4 h-4" /> {t('login.sso_button')}
            </button>
          )}

          {isKeycloakEnabled && (
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-slate-700" />
              <div className="text-xs text-slate-600 mt-2 border-t border-slate-700 pt-2">
                {isKeycloakEnabled ? 'Keycloak OIDC active — click SSO to authenticate' : 'Keycloak OIDC (set VITE_KEYCLOAK_URL to enable)'}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 rounded bg-red-500/10 border border-red-500/50 flex items-start gap-3 text-red-400 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2 uppercase tracking-wide">
                {t('login.operator_id')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <User className="h-5 w-5" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-lg bg-slate-900/50 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="e.g. alice_eng"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2 uppercase tracking-wide">
                {t('login.password')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-lg bg-slate-900/50 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 mb-6">
              <div className="flex items-center">
                <input
                  id="hardware-key"
                  type="checkbox"
                  checked={hardwareKeyChecked}
                  onChange={(e) => setHardwareKeyChecked(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                />
                <label htmlFor="hardware-key" className="ml-2 block text-sm text-slate-400 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> {t('login.hardware_key')}
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={clsx(
                "w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white transition-all",
                loading 
                  ? "bg-blue-600/50 cursor-not-allowed" 
                  : "bg-blue-600 hover:bg-blue-500 hover:shadow-[0_0_15px_rgba(37,99,235,0.4)]"
              )}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {t('login.authenticate')} <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* RBAC Info */}
          <div className="mt-8 pt-6 border-t border-slate-800 text-xs text-slate-500 flex justify-between">
            <span>{t('login.roles_info')}</span>
            <a href="#" className="hover:text-slate-300 transition-colors">{t('login.request_access')}</a>
          </div>
        </div>
      </div>
    </div>
  );
}
