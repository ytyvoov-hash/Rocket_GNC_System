import React, { useState, useEffect } from 'react';
import { Database, ShieldAlert, Search, Download, Filter, RefreshCw, History } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { fetchAuditTrail } from './services/api';

export interface AuditLogEntry {
  at_iso8601?: string;
  actor?: string;
  actor_role?: string;
  operator_id?: string;
  reason?: string;
  method?: string;
  path?: string;
  status?: number;
  target_kind?: string;
  target_id?: string;
  diff_json?: string;
  request_id?: string;
  client_ip?: string;
}

export default function S21_AuditTrail() {
  const { t, i18n } = useTranslation();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchActor, setSearchActor] = useState('');
  const [filterTarget, setFilterTarget] = useState('ALL');

  const loadLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const responseData = await fetchAuditTrail({ limit: 500 });
      // Resilience check: Backend returns { entries: [...] } but API wrapper might return raw response or array.
      let list: AuditLogEntry[] = [];
      if (Array.isArray(responseData)) {
        list = responseData as AuditLogEntry[];
      } else if (responseData && typeof responseData === 'object' && Array.isArray((responseData as any).entries)) {
        list = (responseData as any).entries as AuditLogEntry[];
      }
      
      // Sort desc by time (most recent first)
      list.sort((a, b) => {
        const tA = a.at_iso8601 ? new Date(a.at_iso8601).getTime() : 0;
        const tB = b.at_iso8601 ? new Date(b.at_iso8601).getTime() : 0;
        return tB - tA;
      });

      setLogs(list);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
      setError(t('audit.verification_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleExportCSV = () => {
    if (logs.length === 0) return;
    
    // Header Row
    const headers = [
      t('audit.table.log_id'),
      t('audit.table.timestamp'),
      t('audit.table.actor'),
      t('common.role'),
      t('common.operator'),
      t('audit.table.override_details'),
      t('audit.table.action'),
      t('common.path'),
      t('common.status'),
      t('audit.table.target'),
      'Target ID',
      t('audit.table.ip_address')
    ];
    
    // Data Rows
    const rows = filteredLogs.map(log => [
      log.request_id || '',
      log.at_iso8601 || '',
      log.actor || '',
      log.actor_role || '',
      log.operator_id || '',
      `"${(log.reason || '').replace(/"/g, '""')}"`,
      log.method || '',
      log.path || '',
      log.status || '',
      log.target_kind || '',
      log.target_id || '',
      log.client_ip || ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `gnc_audit_trail_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter logic
  const filteredLogs = logs.filter(log => {
    const actorMatch = (log.actor || '').toLowerCase().includes(searchActor.toLowerCase()) ||
                       (log.operator_id || '').toLowerCase().includes(searchActor.toLowerCase());
    
    const targetMatch = filterTarget === 'ALL' || log.target_kind === filterTarget;
    return actorMatch && targetMatch;
  });

  const getUniqueTargets = () => {
    const targets = new Set<string>();
    logs.forEach(log => {
      if (log.target_kind) targets.add(log.target_kind);
    });
    return Array.from(targets);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
            <Database className="w-8 h-8 text-blue-500" /> {t('audit.title')}
          </h1>
          <p className="text-slate-400">{t('audit.subtitle')}</p>
        </div>
        <button 
          onClick={loadLogs}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded border border-slate-700/50 transition-colors"
        >
          <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
          {t('audit.reload')}
        </button>
      </header>

      {/* Filters Toolbar */}
      <div className="bg-slate-900/60 p-4 border border-slate-700/50 rounded-xl flex flex-wrap gap-4 items-center justify-between backdrop-blur-md">
        <div className="flex flex-wrap gap-4 items-center flex-1">
          {/* Operator Search */}
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder={t('audit.search_placeholder')} 
              value={searchActor}
              onChange={e => setSearchActor(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Target Kind Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={filterTarget}
              onChange={e => setFilterTarget(e.target.value)}
              className="bg-slate-800 border border-slate-700/50 rounded-lg py-2 px-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">{t('audit.all_targets')}</option>
              {getUniqueTargets().map(t => (
                <option key={t} value={t}>{t.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Panel */}
        <div className="flex gap-2">
          <button 
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white font-medium rounded-lg text-sm transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:shadow-none"
          >
            <Download className="w-4 h-4" /> {t('audit.export_csv')}
          </button>
        </div>
      </div>

      {/* Audit Log Table Area */}
      <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl flex flex-col overflow-hidden flex-1 shadow-[0_0_30px_rgba(0,0,0,0.3)]">
        <div className="p-4 border-b border-slate-700/50 bg-slate-800/30 flex justify-between items-center">
          <div className="text-sm font-semibold text-slate-300">
            {filteredLogs.length === 1 
              ? t('audit.showing_entries_one') 
              : t('audit.showing_entries_other', { count: filteredLogs.length })}
          </div>
          <div className={clsx("flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-full border",
            error ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
          )}>
            <ShieldAlert className="w-4 h-4" /> 
            {error ? error : t('audit.verification_valid')}
          </div>
        </div>

        <div className="overflow-x-auto flex-1 relative min-h-[300px]">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/20 gap-3">
              <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-slate-400 text-sm font-mono">{t('audit.synchronizing')}</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
              <History className="w-16 h-16 text-slate-700 mb-4" />
              <p className="font-semibold text-lg text-slate-400">{t('audit.no_logs_found')}</p>
              <p className="text-sm text-slate-600 mt-1">{t('audit.no_logs_subtitle')}</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-10 border-b border-slate-700/50">
                  <th className="px-6 py-4 font-medium">{t('audit.table.log_id')}</th>
                  <th className="px-6 py-4 font-medium">{t('audit.table.timestamp')}</th>
                  <th className="px-6 py-4 font-medium">{t('audit.table.actor')}</th>
                  <th className="px-6 py-4 font-medium">{t('audit.table.target')}</th>
                  <th className="px-6 py-4 font-medium">{t('audit.table.action')}</th>
                  <th className="px-6 py-4 font-medium">{t('audit.table.override_details')}</th>
                  <th className="px-6 py-4 font-medium">{t('audit.table.ip_address')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 font-mono text-sm">
                {filteredLogs.map((log, idx) => {
                  const timestampStr = log.at_iso8601 
                    ? new Date(log.at_iso8601).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { hour12: false })
                    : 'N/A';
                  
                  return (
                    <tr key={idx} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-4 text-slate-500 text-xs max-w-[120px] truncate" title={log.request_id}>
                        {log.request_id ? log.request_id.slice(0, 8) : `LOG-${1000 + idx}`}
                      </td>
                      <td className="px-6 py-4 text-slate-400">{timestampStr}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-blue-400 font-bold">{log.actor || 'SYSTEM'}</span>
                          {log.actor_role && (
                            <span className="text-[10px] text-slate-500 font-semibold">{log.actor_role.toUpperCase()}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-indigo-400 font-medium">{log.target_kind || 'system'}</span>
                          {log.target_id && (
                            <span className="text-[10px] text-slate-500">{log.target_id.slice(0, 12)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={clsx("px-2.5 py-1 rounded-full text-xs font-bold border", 
                          log.method === 'GET' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                          log.method === 'POST' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          (log.method === 'PUT' || log.method === 'PATCH') ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                          log.method === 'DELETE' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                          "bg-slate-500/10 text-slate-400 border-slate-500/20"
                        )}>
                          {log.method || 'EVENT'}
                        </span>
                      </td>
                      <td className="px-6 py-4 max-w-md truncate text-slate-300" title={log.reason || log.diff_json}>
                        <div className="flex flex-col">
                          {log.operator_id && (
                            <span className="text-xs text-slate-400 font-bold mb-0.5">{t('audit.table.operator_override')}: {log.operator_id}</span>
                          )}
                          <span className="text-slate-300">{log.reason || log.path || t('audit.table.system_event')}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{log.client_ip || '127.0.0.1'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
