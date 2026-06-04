import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { Rocket, LayoutDashboard, Database, Settings, LogOut, AlertTriangle, Languages, Activity, Menu, X, Wrench, Cpu, Compass, Crosshair, Sliders, Map, MonitorPlay, Dices, HeartPulse, HardDriveDownload, ClipboardCheck, Power, Radio, LineChart, RotateCcw, GitCompare, History } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { logout } from './store/authSlice';

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { operatorId, isAuthenticated } = useAppSelector(state => state.auth);
  const { activeRocket } = useAppSelector(state => state.rocket);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.dir  = i18n.language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Route Guard: If no rocket is active, redirect from protected routes back to the library.
  const allowedPathsWithoutRocket = ['/', '/dashboard', '/library', '/settings'];
  if (activeRocket === null && !allowedPathsWithoutRocket.includes(location.pathname)) {
    return <Navigate to="/library" replace />;
  }

  type NavItem = {
    to: string;
    icon: any;
    label: string;
    group?: string;
  };

  const navItems: NavItem[] = [
    // Core System
    { to: '/dashboard',    icon: LayoutDashboard,  label: t('nav.s2_dashboard')  },
    
    // Group 1: Hardware Assets
    { to: '/library',      icon: Database,         label: t('nav.s3_library'), group: t('nav.group_hardware') },
    { to: '/editor',       icon: Wrench,           label: t('nav.s4_editor'), group: t('nav.group_hardware') },
    { to: '/actuators',    icon: Cpu,              label: t('nav.actuators'), group: t('nav.group_hardware') },
    
    // Group 2: GNC Workbenches (Algorithm Libraries)
    { to: '/guidance',     icon: Compass,          label: t('nav.guidance'), group: t('nav.group_gnc') },
    { to: '/estimation',   icon: Crosshair,        label: t('nav.estimation'), group: t('nav.group_gnc') },
    { to: '/workbench',    icon: Sliders,          label: t('nav.workbench'), group: t('nav.group_gnc') },
    
    // Group 3: Mission Operations
    { to: '/mission',      icon: Map,              label: t('nav.s5_mission'), group: t('nav.group_mission') },
    { to: '/simulation',   icon: MonitorPlay,      label: t('nav.simulation'), group: t('nav.group_mission') },
    { to: '/monte-carlo',  icon: Dices,            label: t('nav.s11_monte'), group: t('nav.group_mission') },
    { to: '/health',       icon: HeartPulse,       label: t('nav.s13_health'), group: t('nav.group_mission') },
    { to: '/firmware',     icon: HardDriveDownload,label: t('nav.s19_firmware'), group: t('nav.group_mission') },
    { to: '/checklist',    icon: ClipboardCheck,   label: t('nav.s14_checklist'), group: t('nav.group_mission') },
    { to: '/launch',       icon: Power,            label: t('nav.s15_launch'), group: t('nav.group_mission') },
  
    // Group 4: Flight & Post-Flight
    { to: '/monitor',      icon: Radio,            label: t('nav.s16_monitor'), group: t('nav.group_flight') },
    { to: '/post-flight',  icon: LineChart,        label: t('nav.s17_postflight'), group: t('nav.group_flight') },
    { to: '/replay',       icon: RotateCcw,        label: t('nav.s18_replay'), group: t('nav.group_flight') },
    { to: '/comparison',   icon: GitCompare,       label: t('nav.s22_comparison'), group: t('nav.group_flight') },
    { to: '/audit',        icon: History,          label: t('nav.s21_audit'), group: t('nav.group_flight') },
  ];

  const filteredNavItems = navItems.filter(item => {
    // S2 Dashboard, and S3 Library are always visible in sidebar
    if (['/dashboard', '/library'].includes(item.to)) {
      return true;
    }
    // Other items require an active rocket selection
    return activeRocket !== null;
  });

  const handleLogout = () => {
    dispatch(logout());
    navigate('/');
  };

  const toggleLang = () =>
    i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar');

  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex relative overflow-hidden font-sans">
      {/* Shared Ambient Background */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Sidebar Navigation */}
      <aside className={clsx("glass-panel m-4 flex flex-col justify-between overflow-hidden shadow-2xl relative z-10 transition-all duration-300", isSidebarOpen ? "w-64" : "w-20")}>
        <div className="flex flex-col flex-1 min-h-0">
          <div className="p-4 border-b border-slate-700/50 flex flex-col items-center gap-3 shrink-0">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 shrink-0 rounded bg-blue-600 flex items-center justify-center font-bold">G</div>
                {isSidebarOpen && <span className="font-bold text-lg tracking-tight whitespace-nowrap">{t('platform_name')}</span>}
              </div>
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors shrink-0"
              >
                {isSidebarOpen ? <Menu className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
            {isSidebarOpen && operatorId && (
              <div className="w-full text-xs text-blue-400 font-mono text-center bg-blue-900/20 py-1 rounded border border-blue-500/30">
                {t('common.operator')}: {operatorId}
              </div>
            )}
          </div>
          
          <nav className="p-4 space-y-4 flex-1 overflow-y-auto no-scrollbar">
            {(() => {
              const items = filteredNavItems;
              const groups = [...new Set(items.map(item => item.group).filter(Boolean))];
              const ungrouped = items.filter(item => !item.group);
              
              return (
                <>
                  <div className="space-y-1">
                    {ungrouped.map(item => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        title={!isSidebarOpen ? item.label : undefined}
                        className={({ isActive }) => clsx(
                          "flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm",
                          isActive 
                            ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.15)]" 
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50",
                          !isSidebarOpen && "justify-center px-2"
                        )}
                      >
                        <item.icon className={clsx("w-4 h-4 shrink-0", !isSidebarOpen && "w-5 h-5")} />
                        {isSidebarOpen && <span className="font-medium truncate">{item.label}</span>}
                      </NavLink>
                    ))}
                  </div>

                  {groups.map(group => {
                    const groupItems = items.filter(item => item.group === group);
                    if (groupItems.length === 0) return null;
                    return (
                      <div key={group as string} className="space-y-1">
                        {isSidebarOpen && (
                          <div className="text-[10px] uppercase text-slate-500 font-bold mb-2 tracking-wider px-4 mt-2 truncate">
                            {group}
                          </div>
                        )}
                        {!isSidebarOpen && <div className="h-px bg-slate-800 my-2" />}
                        {groupItems.map(item => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            title={!isSidebarOpen ? item.label : undefined}
                            className={({ isActive }) => clsx(
                              "flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm",
                              isActive 
                                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.15)]" 
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50",
                              !isSidebarOpen && "justify-center px-2"
                            )}
                          >
                            <item.icon className={clsx("w-4 h-4 shrink-0", !isSidebarOpen && "w-5 h-5")} />
                            {isSidebarOpen && <span className="font-medium truncate">{item.label}</span>}
                          </NavLink>
                        ))}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-700/50 space-y-2">
          <button onClick={toggleLang}
            title={!isSidebarOpen ? "Language" : undefined}
            className={clsx("flex w-full items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all", !isSidebarOpen && "justify-center px-2")}>
            <Languages className={clsx("w-5 h-5 shrink-0", !isSidebarOpen && "w-6 h-6")} />
            {isSidebarOpen && <span className="font-medium truncate">{i18n.language === 'ar' ? 'English' : 'العربية'}</span>}
          </button>
          <NavLink
            to="/settings"
            title={!isSidebarOpen ? t('nav.settings') : undefined}
            className={({ isActive }) => clsx(
              "flex w-full items-center gap-3 px-4 py-3 rounded-lg transition-all",
              isActive
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50",
              !isSidebarOpen && "justify-center px-2"
            )}
          >
            <Settings className={clsx("w-5 h-5 shrink-0", !isSidebarOpen && "w-6 h-6")} />
            {isSidebarOpen && <span className="font-medium truncate">{t('nav.settings')}</span>}
          </NavLink>
          <button onClick={handleLogout} 
            title={!isSidebarOpen ? t('nav.logout') : undefined}
            className={clsx("flex w-full items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all", !isSidebarOpen && "justify-center px-2")}>
            <LogOut className={clsx("w-5 h-5 shrink-0", !isSidebarOpen && "w-6 h-6")} />
            {isSidebarOpen && <span className="font-medium truncate">{t('nav.logout')}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 m-4 ml-0 glass-panel overflow-y-auto relative z-10 p-8 shadow-2xl transition-all duration-300">
        <Outlet />
      </main>
    </div>
  );
}
