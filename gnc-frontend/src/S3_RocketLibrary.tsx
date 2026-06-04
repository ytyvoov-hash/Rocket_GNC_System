import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Plus, Copy, Eye, Trash2, X, ShieldCheck } from 'lucide-react';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { setActiveRocket, syncLibrary } from './store/rocketSlice';
import { fetchTemplates, fetchTemplate, importTemplate, deleteTemplate, duplicateTemplate } from './services/api';
import getClient from './services/api';
import { useTranslation } from 'react-i18next';

export default function S3_RocketLibrary() {
  const { t } = useTranslation();
  const rockets = useAppSelector(state => state.rocket.library);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All');
  
  // New Rocket Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRocket, setNewRocket] = useState({
    template_id: '',
    display_name: '',
    type: 'Canard-Controlled Single-Stage',
    num_stages: 1,
    mass_dry_kg: 200,
    propellant_mass_kg: 150,
    ref_length_m: 3.5,
    ref_diameter_m: 0.25,
    controller_type: 'fins'
  });

  // 1. Dynamic physical template sync
  const loadLibrary = async () => {
    setLoading(true);
    try {
      const summaries = await fetchTemplates();
      // Load details for each active template concurrently to build flat convenient metrics
      const details = await Promise.all(
        summaries.map(async (s: any) => {
          try {
            const full = await fetchTemplate(s.template_id) as any;
            const rocketData = full.rocket || {};
            const stages = rocketData.stages || [];
            
            const totalMass = stages.reduce(
              (sum: number, st: any) => sum + (st.physical?.mass_dry_kg || 0) + (st.physical?.propellant_mass_kg || 0), 
              0
            );
            const refLength = stages[0]?.geometry?.ref_length_m || 0;
            const refDiameter = stages[0]?.geometry?.ref_diameter_m || 0;
            const refCg = stages[0]?.physical?.cg_dry_body_m?.[0] || 0;

            return {
              id: s.template_id,
              name: s.display_name || s.template_id,
              display_name: s.display_name || s.template_id,
              type: s.type || 'unknown',
              status: s.status || 'draft',
              num_stages: s.num_stages || stages.length || 1,
              stages: stages,
              mass: totalMass || rocketData.mass || 0,
              length: refLength || rocketData.length || 0,
              diameter: refDiameter || rocketData.diameter || 0,
              cgPosition: refCg,
              cpPosition: refCg + 0.22,
              hardware_mapping_file: full.rocket?.hardware_mapping_file || 'hardware_mapping.yaml'
            } as any;
          } catch (err) {
            console.error(`Failed to load details for ${s.template_id}:`, err);
            return {
              id: s.template_id,
              name: s.display_name || s.template_id,
              display_name: s.display_name || s.template_id,
              type: s.type || 'unknown',
              status: s.status || 'draft',
              num_stages: s.num_stages || 0,
              stages: [],
              mass: 0,
              length: 0,
              diameter: 0,
              cgPosition: 0,
              cpPosition: 0,
              hardware_mapping_file: 'hardware_mapping.yaml'
            } as any;
          }
        })
      );
      
      dispatch(syncLibrary(details as any));
    } catch (err) {
      console.error('Failed to load templates from C++ backend:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  const handleView = async (id: string) => {
    dispatch(setActiveRocket(id));
    
    // Notify the backend simulation engine to load and cache the rocket's CSV files
    // (atmosphere table, aero coeffs, thrust curves) into memory for real-time 100Hz integration.
    try {
      await getClient().post('/simulation/load-rocket', { template_id: id });
    } catch (err) {
      console.error(`Failed to load rocket ${id} into backend simulation cache:`, err);
    }
    
    navigate('/editor');
  };

  // 2. Clone physical template
  const handleDuplicate = async (id: string) => {
    setLoading(true);
    try {
      await duplicateTemplate(id);
      await loadLibrary();
    } catch (err) {
      console.error('Failed to duplicate rocket:', err);
      alert('Failed to duplicate template folder.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Delete physical template
  const handleDelete = async (id: string) => {
    if (!confirm(`Are you sure you want to permanently delete the rocket "${id}" and delete all its physical files from the workspace?`)) {
      return;
    }
    setLoading(true);
    try {
      await deleteTemplate(id);
      await loadLibrary();
    } catch (err) {
      console.error('Failed to delete rocket:', err);
      alert('Failed to delete physical template.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Create Brand New Rocket
  const handleCreateRocket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRocket.template_id || !newRocket.display_name) {
      alert('Template ID and Display Name are required!');
      return;
    }
    setLoading(true);
    try {
      await getClient().post('/templates', {
        template_id: newRocket.template_id,
        display_name: newRocket.display_name,
        type: newRocket.type,
        num_stages: Number(newRocket.num_stages),
        mass_dry_kg: Number(newRocket.mass_dry_kg),
        propellant_mass_kg: Number(newRocket.propellant_mass_kg),
        ref_length_m: Number(newRocket.ref_length_m),
        ref_diameter_m: Number(newRocket.ref_diameter_m),
        controller_type: newRocket.controller_type
      });
      setIsModalOpen(false);
      // Reset form
      setNewRocket({
        template_id: '',
        display_name: '',
        type: 'Canard-Controlled Single-Stage',
        num_stages: 1,
        mass_dry_kg: 200,
        propellant_mass_kg: 150,
        ref_length_m: 3.5,
        ref_diameter_m: 0.25,
        controller_type: 'fins'
      });
      await loadLibrary();
    } catch (err) {
      console.error('Failed to create new rocket template:', err);
      alert('Failed to create new rocket files. ID might be duplicated.');
    } finally {
      setLoading(false);
    }
  };

  // Filter & Search Logic
  const filteredRockets = rockets.filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.type.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterType === 'All') return matchesSearch;
    if (filterType === 'Ready') return matchesSearch && r.status === 'flight-ready';
    if (filterType === 'Draft') return matchesSearch && r.status === 'draft';
    return matchesSearch;
  });

  return (
    <div className="h-full flex flex-col relative">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">{t('library.title')}</h1>
          <p className="text-slate-400">{t('library.subtitle')}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded-lg font-medium transition-all shadow-[0_0_15px_rgba(37,99,235,0.2)] text-white"
          >
            <Plus className="w-5 h-5" /> {t('library.new_rocket')}
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex gap-4 mb-8">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('library.search_placeholder')}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 focus:outline-none cursor-pointer"
        >
          <option value="All">{t('library.all_types')}</option>
          <option value="Ready">{t('library.flight_ready')}</option>
          <option value="Draft">{t('library.draft_configs')}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-mono">{t('library.syncing')}</p>
        </div>
      ) : filteredRockets.length === 0 ? (
        <div className="flex-1 bg-slate-900/10 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center p-12 text-center">
          <ShieldCheck className="w-16 h-16 text-slate-700 mb-4" />
          <h3 className="text-xl font-semibold mb-2">{t('library.no_rockets')}</h3>
          <p className="text-slate-500 text-sm max-w-sm">
            {t('library.no_rockets_desc')}
          </p>
        </div>
      ) : (
        /* Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredRockets.map((rocket) => (
            <div key={rocket.id} className="bg-slate-900/40 border border-slate-700/50 rounded-xl overflow-hidden hover:border-blue-500/50 transition-all group flex flex-col relative shadow-md backdrop-blur-sm">
              <div className="h-48 bg-gradient-to-b from-slate-800/50 to-slate-900/50 relative flex items-center justify-center p-4">
                {/* 3D Geometry Representation */}
                <div className="w-8 h-32 bg-slate-700 rounded-t-[50%] rounded-b-md relative shadow-2xl group-hover:scale-105 transition-transform duration-500">
                  <div className="absolute -left-2 -right-2 bottom-0 h-6 bg-slate-600 rounded-sm clip-polygon" />
                </div>
                <div className="absolute top-3 right-3 flex gap-2">
                  <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded ${
                    rocket.status === 'flight-ready' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {rocket.status}
                  </span>
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="text-xl font-bold mb-1 truncate text-slate-100">{rocket.name}</h3>
                <p className="text-slate-400 text-sm mb-4 truncate">{rocket.type}</p>
                
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-300 mb-6 flex-1">
                  <div className="flex flex-col"><span className="text-slate-500 text-xs uppercase">{t('library.mass')}</span>{rocket.mass.toLocaleString()} kg</div>
                  <div className="flex flex-col"><span className="text-slate-500 text-xs uppercase">{t('library.length')}</span>{rocket.length} m</div>
                  <div className="flex flex-col"><span className="text-slate-500 text-xs uppercase">{t('library.diameter')}</span>{rocket.diameter} m</div>
                  <div className="flex flex-col"><span className="text-slate-500 text-xs uppercase">{t('library.stages')}</span>{rocket.num_stages} {t('library.stages')}</div>
                </div>

                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => handleView(rocket.id)}
                    className="flex-1 flex justify-center items-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-sm font-medium transition-colors text-slate-200"
                  >
                    <Eye className="w-4 h-4" /> {t('library.view')}
                  </button>
                  <button
                    onClick={() => handleDuplicate(rocket.id)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors text-slate-400 hover:text-slate-200"
                    title={t('library.duplicate')}
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(rocket.id)}
                    className="p-2 bg-slate-800 hover:bg-red-950/50 border border-slate-700 hover:border-red-900/50 rounded-md transition-colors text-slate-400 hover:text-red-400"
                    title={t('library.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DESIGN NEW ROCKET MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-100">{t('library.design_new')}</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRocket} className="p-6 space-y-4 overflow-y-auto flex-1 text-slate-300">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    {t('library.template_id')}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GH"
                    value={newRocket.template_id}
                    onChange={(e) => setNewRocket({...newRocket, template_id: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '')})}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    {t('library.display_name')}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GH Two-Stage"
                    value={newRocket.display_name}
                    onChange={(e) => setNewRocket({...newRocket, display_name: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  {t('library.airframe_type')}
                </label>
                <input
                  type="text"
                  value={newRocket.type}
                  onChange={(e) => setNewRocket({...newRocket, type: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    {t('library.stage_count')}
                  </label>
                  <select
                    value={newRocket.num_stages}
                    onChange={(e) => setNewRocket({...newRocket, num_stages: Number(e.target.value)})}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value={1}>1 Stage (Single)</option>
                    <option value={2}>2 Stages (Dual)</option>
                    <option value={3}>3 Stages (Multi)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    {t('library.primary_controller')}
                  </label>
                  <select
                    value={newRocket.controller_type}
                    onChange={(e) => setNewRocket({...newRocket, controller_type: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="fins">Aerodynamic Fins</option>
                    <option value="tvc">Thrust Vector (TVC)</option>
                    <option value="hybrid">Hybrid (Fins + TVC)</option>
                    <option value="none">Ballistic (None)</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-800 my-4 pt-4">
                <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">{t('library.physical_dimensions')}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{t('library.dry_mass')}</label>
                    <input
                      type="number"
                      value={newRocket.mass_dry_kg}
                      onChange={(e) => setNewRocket({...newRocket, mass_dry_kg: Number(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{t('library.propellant_mass')}</label>
                    <input
                      type="number"
                      value={newRocket.propellant_mass_kg}
                      onChange={(e) => setNewRocket({...newRocket, propellant_mass_kg: Number(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{t('library.ref_length')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newRocket.ref_length_m}
                      onChange={(e) => setNewRocket({...newRocket, ref_length_m: Number(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">{t('library.ref_diameter')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newRocket.ref_diameter_m}
                      onChange={(e) => setNewRocket({...newRocket, ref_diameter_m: Number(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-6 flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-sm font-medium transition-colors"
                >
                  {t('library.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-medium transition-colors"
                >
                  {t('library.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
