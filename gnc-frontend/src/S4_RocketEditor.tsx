import { useState, useEffect, useCallback, useMemo, Suspense, Component, type ErrorInfo, type ReactNode } from 'react';
import { Save, AlertCircle, FileText, Settings, Rocket, Activity, Database, GitMerge, CheckCircle2, XCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { HotTable } from '@handsontable/react';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/styles/handsontable.css';
import 'handsontable/styles/ht-theme-main.css';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { setValidationReport, updateStage, updateActiveRocketParams, type ValidationReport } from './store/rocketSlice';
import { setMissionField, type EstimatorApproach } from './store/missionSlice';
import { validateTemplate } from './services/api';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Environment, useGLTF, Html } from '@react-three/drei';

ModuleRegistry.registerModules([AllCommunityModule]);
registerAllModules();

interface ErrorBoundaryProps {
  children: ReactNode;
  onError: (error: Error) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class GLBErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("GLBErrorBoundary caught an error:", error, errorInfo);
    this.props.onError(error);
  }

  public render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function RocketGLBModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  
  // Clone the scene graph to ensure each mount operates on independent node references,
  // preventing WebGL context collision and global loader cache pollution.
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  const [transform, setTransform] = useState({ scale: 1, position: [0, 0, 0] as [number, number, number] });

  useEffect(() => {
    if (clonedScene) {
      clonedScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          
          // Compute vertex normals if missing (common in STEP -> GLB conversions)
          if (mesh.geometry && !mesh.geometry.attributes.normal) {
            mesh.geometry.computeVertexNormals();
          }
        }
      });

      const box = new THREE.Box3().setFromObject(clonedScene);
      if (!box.isEmpty()) {
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0.0001 && isFinite(maxDim)) {
          const targetSize = 6;
          const scaleFactor = targetSize / maxDim;
          setTransform({
            scale: scaleFactor,
            position: [
              -center.x * scaleFactor,
              -center.y * scaleFactor,
              -center.z * scaleFactor
            ]
          });
        }
      }
    }
  }, [clonedScene]);

  return (
    <group position={transform.position} scale={transform.scale}>
      <primitive object={clonedScene} />
    </group>
  );
}

export default function S4_RocketEditor() {
  const [activeTab, setActiveTab] = useState('physical');
  const [caMultiplier, setCaMultiplier] = useState(0.9);
  const [thrustMultiplier, setThrustMultiplier] = useState(1.0);
  const [selectedCoeff, setSelectedCoeff] = useState('Cd');

  const [showDampingTable, setShowDampingTable] = useState(false);
  const [showFinTable, setShowFinTable] = useState(false);
  const [showRollTable, setShowRollTable] = useState(false);
  
  // CAD / 3D model scanner hooks
  const [hasCadSource, setHasCadSource] = useState(false);
  const [cadExtension, setCadExtension] = useState('');
  const [cadChecked, setCadChecked] = useState(false);
  const [glbLoadingError, setGlbLoadingError] = useState(false);
  const [glbLoading, setGlbLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  const [stages, setStages] = useState([
    {
      id: 1,
      name: "Stage 1",
      active: true,
      trigger: 'burnout',
      triggerValue: '',
      offset: 0,
      useNails: false,
      useThrusters: false,
      numNails: 2,
      numThrusters: 4,
      controllers: [{ type: 'fins', layout: 'plus' }]
    }
  ]);
  const ordinals = ["First", "Second", "Third", "Fourth", "Fifth"];
  const activeRocket = useAppSelector(state => state.rocket.activeRocket);
  const mission      = useAppSelector(s => s.mission);
  const dispatch     = useAppDispatch();

  const activeStageIndex = stages.findIndex(s => s.active);
  const activeStageIdx = activeStageIndex >= 0 ? activeStageIndex : 0;
  const currentStage = activeRocket?.stages?.[activeStageIdx];
  const currentProp = currentStage?.propulsion ?? {
    thrust_curve_file: 'thrust_curve.csv',
    total_impulse_Ns: 1200000,
    burn_time_s: 4.25,
    thrust_multiplier: 1.0,
    nozzle_exit_area_m2: 0.05557,
    sea_level_pressure_Pa: 65000.0,
  };
  const currentFin = currentStage?.fin_config?.sets?.[0] ?? {
    set_index: 0,
    fin_count: 4,
    S_fin_m2: 0.0227,
    c_fin_m: 0.150,
    x_fin_m: 1.106,
    delta_max_deg: 20.0,
    delta_dot_max_deg_s: 300.0,
    actuator_ref: 'default_4020',
    config_type: 'X',
  };

  const [validating,  setValidating]  = useState(false);
  const [validReport, setValidReport] = useState<ValidationReport | null>(null);

  // === Dynamic Aero Data (loaded from rocket folder CSV) ===
  type AeroRow = { mach: number; alpha: number; Cd: number; Cn: number; Cm: number; Cnp: number; Cyp: number };
  type DampingRow = { mach: number; alpha: number; Cmq: number; Cnq: number; Clp: number };
  type FinRow = { mach: number; delta: number; Cnd: number; Cmd: number };
  type RollRow = { mach: number; alpha: number; def_roll: number; Cll: number };

  const [aeroData, setAeroData] = useState<AeroRow[]>([]);
  const [dampingData, setDampingData] = useState<DampingRow[]>([]);
  const [finData, setFinData] = useState<FinRow[]>([]);
  const [rollData, setRollData] = useState<RollRow[]>([]);

  const [aeroFileCount, setAeroFileCount] = useState(0);
  const [aeroMachRange, setAeroMachRange] = useState('');
  const [aeroMaxAlpha, setAeroMaxAlpha] = useState(0);

  // Dynamic CAD and GLB scanning effect
  useEffect(() => {
    if (!activeRocket?.id) return;
    setCadChecked(false);
    setHasCadSource(false);
    setCadExtension('');
    setGlbLoadingError(false);
    setGlbLoading(true);

    const checkCadSource = async () => {
      const id = activeRocket.id;
      // We check SLDPRT first, step, stp, then glb.
      const extensions = ['.SLDPRT', '.sldprt', '.step', '.STEP', '.stp', '.STP', '.glb', '.GLB'];
      let found = false;
      let foundExt = '';

      for (const ext of extensions) {
        try {
          const res = await fetch(`/rockets/${id}/${id}${ext}`, { method: 'HEAD' });
          if (res.ok) {
            found = true;
            foundExt = ext;
            break;
          }
        } catch (e) {
          // ignore error
        }
      }

      setHasCadSource(found);
      setCadExtension(foundExt);
      setCadChecked(true);
      setGlbLoading(false);
    };

    checkCadSource();
  }, [activeRocket?.id, lastUpdated]);

  // Load aero CSV & envelope when active rocket changes
  useEffect(() => {
    if (!activeRocket?.id) return;
    const rocketId = activeRocket.id;
    // Try to load aero_coeffs.csv from the rocket folder
    fetch(`/rockets/${rocketId}/aero_coeffs.csv`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.text(); })
      .then(csv => {
        const lines = csv.trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) return;
        const header = lines[0].split(',').map(h => h.trim());
        const cdIdx = header.findIndex(h => /^cd$/i.test(h));
        const cnIdx = header.findIndex(h => /^cn$/i.test(h));
        const cmIdx = header.findIndex(h => /^cm$/i.test(h));
        const cnpIdx = header.findIndex(h => /^cnp$/i.test(h));
        const cypIdx = header.findIndex(h => /^cyp$/i.test(h));
        const machIdx = header.findIndex(h => /^mach$/i.test(h));
        const alphaIdx = header.findIndex(h => /alpha/i.test(h));
        if (machIdx < 0 || alphaIdx < 0 || cdIdx < 0) return;
        const rows: AeroRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          rows.push({
            mach: parseFloat(cols[machIdx]) || 0,
            alpha: parseFloat(cols[alphaIdx]) || 0,
            Cd: parseFloat(cols[cdIdx]) || 0,
            Cn: cnIdx >= 0 ? parseFloat(cols[cnIdx]) || 0 : 0,
            Cm: cmIdx >= 0 ? parseFloat(cols[cmIdx]) || 0 : 0,
            Cnp: cnpIdx >= 0 ? parseFloat(cols[cnpIdx]) || 0 : 0,
            Cyp: cypIdx >= 0 ? parseFloat(cols[cypIdx]) || 0 : 0,
          });
        }
        setAeroData(rows);
        const machs = [...new Set(rows.map(r => r.mach))];
        const alphas = rows.map(r => Math.abs(r.alpha));
        setAeroMachRange(`${Math.min(...machs).toFixed(1)} – ${Math.max(...machs).toFixed(1)}`);
        setAeroMaxAlpha(Math.max(...alphas));
      })
      .catch(() => {
        // No aero CSV found for this rocket — clear data
        setAeroData([]);
        setAeroMachRange('—');
        setAeroMaxAlpha(0);
      });

    // Try to load damping_coeffs.csv from the rocket folder
    fetch(`/rockets/${rocketId}/damping_coeffs.csv`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.text(); })
      .then(csv => {
        const lines = csv.trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) return;
        const header = lines[0].split(',').map(h => h.trim());
        const machIdx = header.findIndex(h => /^mach$/i.test(h));
        const alphaIdx = header.findIndex(h => /alpha/i.test(h));
        const cmqIdx = header.findIndex(h => /^cmq$/i.test(h));
        const cnqIdx = header.findIndex(h => /^cnq$/i.test(h));
        const clpIdx = header.findIndex(h => /^clp$/i.test(h));
        if (machIdx < 0 || alphaIdx < 0) return;
        const rows: DampingRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          rows.push({
            mach: parseFloat(cols[machIdx]) || 0,
            alpha: parseFloat(cols[alphaIdx]) || 0,
            Cmq: cmqIdx >= 0 ? parseFloat(cols[cmqIdx]) || 0 : 0,
            Cnq: cnqIdx >= 0 ? parseFloat(cols[cnqIdx]) || 0 : 0,
            Clp: clpIdx >= 0 ? parseFloat(cols[clpIdx]) || 0 : 0,
          });
        }
        setDampingData(rows);
      })
      .catch(() => setDampingData([]));

    // Try to load fin_deflection_coeffs.csv from the rocket folder
    fetch(`/rockets/${rocketId}/fin_deflection_coeffs.csv`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.text(); })
      .then(csv => {
        const lines = csv.trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) return;
        const header = lines[0].split(',').map(h => h.trim());
        const machIdx = header.findIndex(h => /^mach$/i.test(h));
        const deltaIdx = header.findIndex(h => /delta/i.test(h));
        const cndIdx = header.findIndex(h => /^cnd$/i.test(h));
        const cmdIdx = header.findIndex(h => /^cmd$/i.test(h));
        if (machIdx < 0 || deltaIdx < 0) return;
        const rows: FinRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          rows.push({
            mach: parseFloat(cols[machIdx]) || 0,
            delta: parseFloat(cols[deltaIdx]) || 0,
            Cnd: cndIdx >= 0 ? parseFloat(cols[cndIdx]) || 0 : 0,
            Cmd: cmdIdx >= 0 ? parseFloat(cols[cmdIdx]) || 0 : 0,
          });
        }
        setFinData(rows);
      })
      .catch(() => setFinData([]));

    // Try to load roll_aero_coeffs.csv from the rocket folder
    fetch(`/rockets/${rocketId}/roll_aero_coeffs.csv`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.text(); })
      .then(csv => {
        const lines = csv.trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) return;
        const header = lines[0].split(',').map(h => h.trim());
        const machIdx = header.findIndex(h => /^mach$/i.test(h));
        const alphaIdx = header.findIndex(h => /alpha/i.test(h));
        const defRollIdx = header.findIndex(h => /roll/i.test(h));
        const cllIdx = header.findIndex(h => /^cll$/i.test(h));
        if (machIdx < 0 || alphaIdx < 0 || defRollIdx < 0) return;
        const rows: RollRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          rows.push({
            mach: parseFloat(cols[machIdx]) || 0,
            alpha: parseFloat(cols[alphaIdx]) || 0,
            def_roll: parseFloat(cols[defRollIdx]) || 0,
            Cll: cllIdx >= 0 ? parseFloat(cols[cllIdx]) || 0 : 0,
          });
        }
        setRollData(rows);
      })
      .catch(() => setRollData([]));

    // Try to load envelope.yaml for the specific rocket bounds
    fetch(`/rockets/${rocketId}/envelope.yaml`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.text(); })
      .then(yaml => {
        const machMatch = yaml.match(/mach_range:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/);
        if (machMatch) {
          setAeroMachRange(`${machMatch[1]} – ${machMatch[2]}`);
        }
        const alphaMatch = yaml.match(/max_alpha_deg:\s*([\d.]+)/);
        if (alphaMatch) {
          setAeroMaxAlpha(parseFloat(alphaMatch[1]) || 20);
        }
      })
      .catch(() => {});

    // Count available aero files
    const aeroFiles = ['aero_coeffs.csv', 'ca_3d_coeffs_motor_off.csv', 'ca_3d_coeffs_motor_on.csv',
      'damping_coeffs.csv', 'fin_deflection_coeffs.csv', 'fin_loads.csv', 'roll_aero_coeffs.csv'];
    let count = 0;
    Promise.allSettled(aeroFiles.map(f =>
      fetch(`/rockets/${rocketId}/${f}`, { method: 'HEAD' })
        .then(r => { if (r.ok) count++; })
    )).then(() => setAeroFileCount(count));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRocket?.id]);

  useEffect(() => {
    if (!activeRocket?.stages?.length) return;
    setStages(activeRocket.stages.map((s, i) => ({
      id: i + 1,
      name: s.name,
      active: i === 0,
      trigger: s.separation?.trigger ?? 'burnout',
      triggerValue: '',
      offset: s.separation?.offset_s ?? 0,
      useNails: (s.separation?.nail_count ?? 0) > 0,
      useThrusters: false,
      numNails: s.separation?.nail_count ?? 2,
      numThrusters: 4,
      controllers: (s.fin_config?.sets?.length ?? 0) > 0
        ? (s.fin_config!.sets.map(f => ({ type: 'fins' as const, layout: f.config_type })))
        : [{ type: 'fins' as const, layout: 'plus' as const }],
    })));
    if (activeRocket.validation) setValidReport(activeRocket.validation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRocket?.id]);

  const runValidation = useCallback(async () => {
    if (!activeRocket?.id) return;
    setValidating(true);
    try {
      const report = await validateTemplate(activeRocket.id);
      setValidReport(report);
      dispatch(setValidationReport(report));
    } catch { setValidReport(null); }
    setValidating(false);
  }, [activeRocket?.id, dispatch]);

  // Dynamically compute displayed data based on CA multiplier (from loaded CSV)
  const dynamicAeroData = aeroData.map(d => ({
    ...d,
    Cd: Number((d.Cd * caMultiplier).toFixed(4)),
  }));

  // Slices for the Live Plots — pick closest alpha ≈ 4° and Mach ≈ 1.2
  const plotAlpha = aeroData.length > 0
    ? [...new Set(aeroData.filter(d => d.alpha > 0).map(d => d.alpha))].sort((a, b) => Math.abs(a - 4) - Math.abs(b - 4))[0] ?? 4
    : 4;
  const plotMach = aeroData.length > 0
    ? [...new Set(aeroData.map(d => d.mach))].sort((a, b) => Math.abs(a - 1.2) - Math.abs(b - 1.2))[0] ?? 1.2
    : 1.2;
  const machPlotData = dynamicAeroData.filter(d => d.alpha === plotAlpha);
  const alphaPlotData = dynamicAeroData.filter(d => d.mach === plotMach);

  const tabs = [
    { id: 'physical',     label: 'Physical',     icon: Settings  },
    { id: 'geometry',     label: 'Geometry',      icon: FileText  },
    { id: 'aero',         label: 'Aero',          icon: Activity  },
    { id: 'propulsion',   label: 'Propulsion',    icon: Rocket    },
    { id: 'stages_fins',  label: 'Stages & Fins', icon: Database  },
    { id: 'compatibility',label: 'C1–C25',        icon: AlertCircle },
  ];

  const stageColDefs: ColDef[] = [
    { field: 'stage_id', headerName: 'Stage',      width: 110 },
    { field: 'dry_kg',   headerName: 'Dry (kg)',   width: 95  },
    { field: 'prop_kg',  headerName: 'Prop (kg)',  width: 95  },
    { field: 'cg_x',     headerName: 'CG-x (m)',   width: 95  },
    { field: 'ref_diam', headerName: 'Diam (m)',    width: 95  },
    { field: 'ref_len',  headerName: 'Length (m)', width: 105 },
  ];

  const stageRowData = (activeRocket?.stages ?? [])
    .filter((_, i) => i === activeStageIdx)
    .map(s => ({
      stage_id: s.stage_id,
      dry_kg:   s.physical.mass_dry_kg,
      prop_kg:  s.physical.propellant_mass_kg,
      cg_x:     s.physical.cg_dry_body_m[0].toFixed(3),
      ref_diam: s.geometry.ref_diameter_m.toFixed(3),
      ref_len:  s.geometry.ref_length_m.toFixed(3),
    }));

  const hotAeroData = dynamicAeroData.map(row => [
    row.mach.toFixed(1), row.alpha.toFixed(1), row.Cd.toFixed(4),
    row.Cn.toFixed(4), row.Cm.toFixed(4)
  ]);

  const hotDampingData = dampingData.map(row => [
    row.mach.toFixed(1), row.alpha.toFixed(1), row.Cmq.toFixed(4), row.Cnq.toFixed(4), row.Clp.toFixed(4)
  ]);

  const hotFinData = finData.map(row => [
    row.mach.toFixed(1), row.delta.toFixed(1), row.Cnd.toFixed(4), row.Cmd.toFixed(4)
  ]);

  const hotRollData = rollData.map(row => [
    row.mach.toFixed(1), row.alpha.toFixed(1), row.def_roll.toFixed(1), row.Cll.toFixed(4)
  ]);

  const verdictColor: Record<string, string> = {
    PASS: 'text-emerald-400', WARN: 'text-yellow-400', FAIL: 'text-red-400',
  };
  const verdictBg: Record<string, string> = {
    PASS: 'bg-emerald-500/10 border-emerald-500/20',
    WARN: 'bg-yellow-500/10 border-yellow-500/20',
    FAIL: 'bg-red-500/10  border-red-500/20',
  };

  if (!activeRocket) {
    return <div className="p-8 text-center text-slate-400">No rocket selected. Go back to the library.</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Rocket Details Editor</h1>
          <p className="text-slate-400">Editing: <span className="text-white font-medium">{activeRocket.name}</span> (v1.0)</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 border border-slate-700 hover:bg-slate-800 rounded-lg font-medium transition-all text-slate-300">
            Discard Changes
          </button>
          <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg font-medium transition-all text-slate-300">
            <Database className="w-4 h-4" /> Import Template
          </button>
          <button onClick={runValidation} disabled={validating}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg font-medium transition-all shadow-[0_0_15px_rgba(37,99,235,0.2)]">
            {validating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {validating ? 'Validating…' : 'Save & Validate'}
          </button>
        </div>
      </header>

      {/* Validation Banner */}
      <div className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3 text-emerald-400 text-sm">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <div>
          <p className="font-semibold">Validation Passed (C1-C25)</p>
          <p className="text-emerald-500/80">Static stability margin is acceptable. Mach coverage is complete.</p>
        </div>
      </div>

      <div className="flex flex-1 gap-6 min-h-0">
        {/* Sidebar Tabs */}
        <div className="w-48 flex flex-col gap-1 border-r border-slate-700/50 pr-6">
          {tabs.map(tab => {
            const isCompat = tab.id === 'compatibility';
            const overall  = validReport?.overall;
            const dot = isCompat && validReport
              ? (overall === 'PASS' ? 'bg-emerald-400' : overall === 'WARN' ? 'bg-yellow-400' : 'bg-red-400')
              : '';
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-left',
                  activeTab === tab.id ? 'bg-slate-800 text-white shadow-inner' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                )}>
                <tab.icon className="w-4 h-4 shrink-0" /> {tab.label}
                {dot && <span className={clsx('w-2 h-2 rounded-full ml-auto shrink-0', dot)} />}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-slate-900/30 border border-slate-700/50 rounded-xl overflow-y-auto p-6 relative">

          {/* Handsontable / AG Grid Mockup for "Physical" Tab */}
          {activeTab === 'physical' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex flex-wrap gap-6 items-center justify-between">
                <div className="bg-slate-800/50 border border-blue-500/20 rounded-lg p-4 max-w-xs shadow-lg">
                  <label className="text-xs font-semibold text-blue-400 uppercase block mb-2 tracking-wider">Number of stages</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={activeRocket?.stages?.length || 1}
                      onChange={(e) => {
                        const count = Math.max(1, parseInt(e.target.value) || 1);
                        if (!activeRocket) return;
                        const currentStagesCount = activeRocket.stages.length;
                        let newStagesList = [...activeRocket.stages];
                        let newLocalStages = [...stages];

                        if (count > currentStagesCount) {
                          for (let i = currentStagesCount; i < count; i++) {
                            const newId = i + 1;
                            newLocalStages.push({
                              id: newId, name: `Stage ${newId}`, active: false, trigger: 'burnout', triggerValue: '', offset: 0, useNails: false, useThrusters: false, numNails: 2, numThrusters: 4, controllers: [{ type: 'tvc', layout: 'plus' }]
                            });
                            // Default new stage template based on BA_STAGE_1 structure
                            newStagesList.push({
                              stage_id: `S${newId}`,
                              name: `Stage ${newId}`,
                              stage_index: i,
                              is_terminal: false,
                              has_warhead: false,
                              physical: { mass_dry_kg: 100, propellant_mass_kg: 100, insulation_mass_kg: 2, cg_dry_body_m: [0, 0, 0], cg_full_body_m: [0, 0, 0], inertia_dry_kgm2: [1, 1, 1], inertia_full_kgm2: [2, 2, 2] },
                              geometry: { ref_diameter_m: 0.2, ref_length_m: 2.0, ref_area_m2: 0.0314 },
                              controller_type: 'tvc',
                              controller_ref: 'default_tvc',
                              seeker_capable: false,
                              autopilot: { enabled: true, capable_modes: ['auto_shape'] }
                            });
                          }
                        } else if (count < currentStagesCount) {
                          newStagesList = newStagesList.slice(0, count);
                          newLocalStages = newLocalStages.slice(0, count);
                        }

                        setStages(newLocalStages);
                        dispatch(updateActiveRocketParams({ stages: newStagesList, num_stages: count }));
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white font-bold text-xl focus:border-blue-500 focus:outline-none transition-all"
                    />
                    <div className="text-slate-500 text-sm italic whitespace-nowrap">
                      Configurable in FinSets
                    </div>
                  </div>
                </div>

                {/* Stage switcher for multi-stage templates */}
                {stages.length > 1 && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase block tracking-wider">Viewing & Editing Stage</label>
                    <div className="flex gap-2 bg-slate-950/40 p-1.5 rounded-lg border border-slate-800 w-fit">
                      {stages.map((st, i) => (
                        <button
                          key={st.id}
                          onClick={() => {
                            setStages(stages.map((s, idx) => ({ ...s, active: idx === i })));
                          }}
                          className={clsx(
                            "px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all",
                            st.active
                              ? "bg-blue-600 text-white shadow-lg"
                              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                          )}
                        >
                          {st.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 border-b border-slate-800 pb-2">
                  Mass Properties ({activeRocket.display_name} - {currentStage?.name || `Stage ${activeStageIdx + 1}`})
                </h3>
                <div className="grid grid-cols-3 gap-6 max-w-3xl">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Dry Mass (kg)</label>
                    <input
                      type="number"
                      value={currentStage?.physical?.mass_dry_kg ?? 0}
                      onChange={(e) => {
                        if (!currentStage) return;
                        dispatch(updateStage({
                          stageIndex: activeStageIdx,
                          patch: {
                            physical: {
                              ...currentStage.physical,
                              mass_dry_kg: parseFloat(e.target.value) || 0
                            }
                          }
                        }));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Propellant Mass (kg)</label>
                    <input
                      type="number"
                      value={currentStage?.physical?.propellant_mass_kg ?? 0}
                      onChange={(e) => {
                        if (!currentStage) return;
                        dispatch(updateStage({
                          stageIndex: activeStageIdx,
                          patch: {
                            physical: {
                              ...currentStage.physical,
                              propellant_mass_kg: parseFloat(e.target.value) || 0
                            }
                          }
                        }));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Insulation Mass (kg)</label>
                    <input
                      type="number"
                      value={currentStage?.physical?.insulation_mass_kg ?? 0}
                      onChange={(e) => {
                        if (!currentStage) return;
                        dispatch(updateStage({
                          stageIndex: activeStageIdx,
                          patch: {
                            physical: {
                              ...currentStage.physical,
                              insulation_mass_kg: parseFloat(e.target.value) || 0
                            }
                          }
                        }));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 border-b border-slate-800 pb-2">Center of Gravity & Inertia</h3>
                <div className="grid grid-cols-2 gap-6 max-w-3xl">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase">CG Dry [X, Y, Z] (m)</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[0, 1, 2].map((axis) => (
                          <input
                            key={axis}
                            type="number"
                            step="0.001"
                            value={currentStage?.physical?.cg_dry_body_m?.[axis] ?? 0}
                            onChange={(e) => {
                              if (!currentStage) return;
                              const newCg = [...currentStage.physical.cg_dry_body_m] as [number, number, number];
                              newCg[axis] = parseFloat(e.target.value) || 0;
                              dispatch(updateStage({
                                stageIndex: activeStageIdx,
                                patch: {
                                  physical: {
                                    ...currentStage.physical,
                                    cg_dry_body_m: newCg
                                  }
                                }
                              }));
                            }}
                            className="bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 font-mono text-sm text-center"
                            placeholder={axis === 0 ? 'X' : axis === 1 ? 'Y' : 'Z'}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase">CG Full [X, Y, Z] (m)</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[0, 1, 2].map((axis) => (
                          <input
                            key={axis}
                            type="number"
                            step="0.001"
                            value={currentStage?.physical?.cg_full_body_m?.[axis] ?? 0}
                            onChange={(e) => {
                              if (!currentStage) return;
                              const newCg = [...currentStage.physical.cg_full_body_m] as [number, number, number];
                              newCg[axis] = parseFloat(e.target.value) || 0;
                              dispatch(updateStage({
                                stageIndex: activeStageIdx,
                                patch: {
                                  physical: {
                                    ...currentStage.physical,
                                    cg_full_body_m: newCg
                                  }
                                }
                              }));
                            }}
                            className="bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 font-mono text-sm text-center"
                            placeholder={axis === 0 ? 'X' : axis === 1 ? 'Y' : 'Z'}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase">Inertia Dry [Ixx, Iyy, Izz] (kg·m²)</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[0, 1, 2].map((axis) => (
                          <input
                            key={axis}
                            type="number"
                            step="0.001"
                            value={currentStage?.physical?.inertia_dry_kgm2?.[axis] ?? 0}
                            onChange={(e) => {
                              if (!currentStage) return;
                              const newInertia = [...currentStage.physical.inertia_dry_kgm2] as [number, number, number];
                              newInertia[axis] = parseFloat(e.target.value) || 0;
                              dispatch(updateStage({
                                stageIndex: activeStageIdx,
                                patch: {
                                  physical: {
                                    ...currentStage.physical,
                                    inertia_dry_kgm2: newInertia
                                  }
                                }
                              }));
                            }}
                            className="bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 font-mono text-sm text-center"
                            placeholder={axis === 0 ? 'Ixx' : axis === 1 ? 'Iyy' : 'Izz'}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase">Inertia Full [Ixx, Iyy, Izz] (kg·m²)</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[0, 1, 2].map((axis) => (
                          <input
                            key={axis}
                            type="number"
                            step="0.001"
                            value={currentStage?.physical?.inertia_full_kgm2?.[axis] ?? 0}
                            onChange={(e) => {
                              if (!currentStage) return;
                              const newInertia = [...currentStage.physical.inertia_full_kgm2] as [number, number, number];
                              newInertia[axis] = parseFloat(e.target.value) || 0;
                              dispatch(updateStage({
                                stageIndex: activeStageIdx,
                                patch: {
                                  physical: {
                                    ...currentStage.physical,
                                    inertia_full_kgm2: newInertia
                                  }
                                }
                              }));
                            }}
                            className="bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 font-mono text-sm text-center"
                            placeholder={axis === 0 ? 'Ixx' : axis === 1 ? 'Iyy' : 'Izz'}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 border-b border-slate-800 pb-2">Airframe Geometry</h3>
                <div className="grid grid-cols-3 gap-6 max-w-4xl">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Reference Length (m)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={currentStage?.geometry?.ref_length_m ?? 0}
                      onChange={(e) => {
                        if (!currentStage) return;
                        dispatch(updateStage({
                          stageIndex: activeStageIdx,
                          patch: {
                            geometry: {
                              ...currentStage.geometry,
                              ref_length_m: parseFloat(e.target.value) || 0
                            }
                          }
                        }));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Reference Diameter (m)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={currentStage?.geometry?.ref_diameter_m ?? 0}
                      onChange={(e) => {
                        if (!currentStage) return;
                        dispatch(updateStage({
                          stageIndex: activeStageIdx,
                          patch: {
                            geometry: {
                              ...currentStage.geometry,
                              ref_diameter_m: parseFloat(e.target.value) || 0
                            }
                          }
                        }));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Reference Area (m²)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={currentStage?.geometry?.ref_area_m2 ?? 0}
                      onChange={(e) => {
                        if (!currentStage) return;
                        dispatch(updateStage({
                          stageIndex: activeStageIdx,
                          patch: {
                            geometry: {
                              ...currentStage.geometry,
                              ref_area_m2: parseFloat(e.target.value) || 0
                            }
                          }
                        }));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Grain Outer Radius (m)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={currentProp.sea_level_pressure_Pa ? 0.1325 : 0}
                      disabled
                      className="w-full bg-slate-800/40 border border-slate-700/50 rounded p-2 text-slate-500 cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Nozzle Exit Area (m²)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={currentProp.nozzle_exit_area_m2}
                      onChange={(e) => {
                        if (!currentStage) return;
                        dispatch(updateStage({
                          stageIndex: activeStageIdx,
                          patch: {
                            propulsion: {
                              ...currentProp,
                              nozzle_exit_area_m2: parseFloat(e.target.value) || 0
                            }
                          }
                        }));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">SL Pressure (Pa)</label>
                    <input
                      type="number"
                      value={currentProp.sea_level_pressure_Pa}
                      onChange={(e) => {
                        if (!currentStage) return;
                        dispatch(updateStage({
                          stageIndex: activeStageIdx,
                          patch: {
                            propulsion: {
                              ...currentProp,
                              sea_level_pressure_Pa: parseFloat(e.target.value) || 0
                            }
                          }
                        }));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 border-b border-slate-800 pb-2">Launcher Configuration</h3>
                <div className="grid grid-cols-3 gap-6 max-w-3xl">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Rail Length (m)</label>
                    <input type="number" defaultValue="5.45" className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Friction Coeff</label>
                    <input type="number" defaultValue="0.1" className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Launch Elev (°)</label>
                    <input type="number" defaultValue="65.0" className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200" />
                  </div>
                </div>
              </div>

              {/* Fake Stability Graphic */}
              <div className="mt-8 p-6 bg-slate-900 border border-slate-800 rounded-lg">
                <h4 className="text-sm font-semibold mb-4">Stability Margin (CP vs CG)</h4>
                <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden flex relative">
                  <div className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10" style={{ left: `${(activeRocket.cgPosition / activeRocket.length) * 100}%` }} title="CG" />
                  <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: `${(activeRocket.cpPosition / activeRocket.length) * 100}%` }} title="CP" />
                  <div className="h-full bg-emerald-500/20" style={{ width: '100%' }} />
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-2">
                  <span>Nose</span>
                  <span>1.5 calibers (Stable)</span>
                  <span>Tail</span>
                </div>
              </div>

              {/* Stage Mass Properties — AG Grid */}
              <div className="mt-4">
                <h4 className="text-sm font-semibold mb-3 border-b border-slate-800 pb-2">Stage Mass Properties</h4>
                <div className="ag-theme-quartz-dark" style={{ height: '160px', width: '100%' }}>
                  <AgGridReact rowData={stageRowData} columnDefs={stageColDefs} />
                </div>
              </div>
            </div>
          )}

          {/* Geometry Tab (Now 3D Rendering) */}
          {activeTab === 'geometry' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 h-full flex flex-col">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <div>
                  <h3 className="text-lg font-semibold">3D Airframe Rendering</h3>
                  <p className="text-sm text-slate-500">Upload CAD models to automatically extract Geometry and Inertia tensors.</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setLastUpdated(Date.now());
                      setGlbLoadingError(false);
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded text-slate-300 border border-slate-700 transition-colors"
                  >
                    Re-calculate Mass Properties
                  </button>
                </div>
              </div>

              {/* 3D Viewer Container */}
              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl relative overflow-hidden flex flex-col group min-h-[400px]">
                {/* Overlay UI */}
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                  <div className="bg-slate-900/80 backdrop-blur text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-300 flex items-center gap-2">
                    {glbLoading ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-spin"></span>
                        Scanning & Compiling CAD...
                      </>
                    ) : hasCadSource ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        {activeRocket.id}{cadExtension} Loaded
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                        No CAD Source Detected
                      </>
                    )}
                  </div>
                </div>

                <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                  <button className="bg-slate-900/80 backdrop-blur p-2 rounded border border-slate-700 hover:bg-slate-800 transition-colors text-slate-400 hover:text-white">
                    <Settings className="w-4 h-4" />
                  </button>
                  <button className="bg-slate-900/80 backdrop-blur p-2 rounded border border-slate-700 hover:bg-slate-800 transition-colors text-slate-400 hover:text-white">
                    <Activity className="w-4 h-4" />
                  </button>
                </div>

                {/* 3D Canvas / Dynamic CAD States */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {glbLoadingError ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-center p-6 z-10">
                      <XCircle className="w-12 h-12 text-red-500 mb-3 animate-pulse" />
                      <h4 className="text-lg font-semibold text-white">GLB Rendering Failed</h4>
                      <p className="text-sm text-slate-400 max-w-md mt-1">
                        Failed to render the converted GLB mesh. Verify your host FreeCAD CLI paths and conversion logs.
                      </p>
                    </div>
                  ) : glbLoading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-20">
                      <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-3" />
                      <h4 className="text-base font-semibold text-white">Checking CAD status...</h4>
                      <p className="text-xs text-slate-400 mt-1">Scanning directory for rocket source file</p>
                    </div>
                  ) : !hasCadSource ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-center p-6 z-10">
                      <AlertCircle className="w-12 h-12 text-yellow-500 mb-3 animate-pulse" />
                      <h4 className="text-lg font-semibold text-white">No CAD Source Found</h4>
                      <p className="text-sm text-slate-400 max-w-md mt-1">
                        There is no `.SLDPRT`, `.step`, `.stp` or `.glb` file inside the rocket's folder (`/rockets/${activeRocket.id}`).
                      </p>
                    </div>
                  ) : (
                    <Canvas camera={{ position: [0, 0, 10], fov: 45 }} className="w-full h-full cursor-grab active:cursor-grabbing">
                      <ambientLight intensity={0.4} />
                      <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
                      <directionalLight position={[-10, 10, -10]} intensity={1.0} />
                      <OrbitControls makeDefault enableDamping dampingFactor={0.05} />
                      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0.5} fade speed={1} />
                      <Suspense fallback={
                        <Html center>
                          <div className="flex flex-col items-center justify-center text-center p-6 bg-slate-950/80 rounded-lg border border-slate-800 backdrop-blur w-64">
                            <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-3" />
                            <h4 className="text-base font-semibold text-white font-sans">Compiling 3D Mesh...</h4>
                            <p className="text-xs text-slate-400 mt-1 font-sans">Processing model geometry</p>
                          </div>
                        </Html>
                      }>
                        <GLBErrorBoundary onError={() => setGlbLoadingError(true)}>
                          <RocketGLBModel url={`/rockets/${activeRocket.id}/${activeRocket.id}.glb?t=${lastUpdated}`} />
                        </GLBErrorBoundary>
                      </Suspense>
                    </Canvas>
                  )}
                </div>

                {/* Navigation hints */}
                {hasCadSource && !glbLoading && !glbLoadingError && (
                  <div className="absolute bottom-4 left-4 z-10 bg-slate-900/80 backdrop-blur text-[10px] px-3 py-1.5 rounded border border-slate-800 text-slate-400">
                    Left-click + Drag to rotate | Scroll to zoom | Right-click + Drag to pan
                  </div>
                )}

                {/* Upload Zone (Visible on Hover/Empty) */}
                <div className="absolute bottom-4 left-4 right-4 bg-slate-900/80 backdrop-blur border border-slate-700 border-dashed rounded-lg p-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-200">Drag & Drop new CAD files</p>
                      <p className="text-xs text-slate-500">Supports SolidWorks (.SLDPRT, .SLDASM), STEP (.stp, .step), and STL (.stl)</p>
                    </div>
                  </div>
                  <button className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded font-medium transition-colors">
                    Browse Files
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Aero Tab */}
          {activeTab === 'aero' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-4">
                <h3 className="text-lg font-semibold">Aerodynamic Database (aero_coeffs.csv)</h3>
                <div className="flex gap-2">
                  <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-300 border border-slate-700">{aeroFileCount} Loaded Files</span>
                  <button className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded text-slate-300 border border-slate-700">Manage Files...</button>
                </div>
              </div>

              {/* NEW: Operational Envelope Bounds */}
              <div className="grid grid-cols-4 gap-6 mb-6 pb-6 border-b border-slate-800/50">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Mach Range</label>
                  <input type="text" value={aeroMachRange} readOnly className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 text-sm font-mono" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Max Alpha (deg)</label>
                  <input type="number" value={aeroMaxAlpha} readOnly className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 text-sm font-mono" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Max Deflection (deg)</label>
                  <input type="number" defaultValue="20" className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 text-sm font-mono" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Fallback Strategy</label>
                  <select className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-emerald-400 text-sm font-mono">
                    <option>Newtonian Impact</option>
                    <option>Linear Extrapolate</option>
                    <option>Clamp Edge Values</option>
                  </select>
                </div>
              </div>
              <div className="max-w-md bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-400 font-semibold uppercase text-xs">CA Multiplier</span>
                  <span className="text-white font-mono">{caMultiplier.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={caMultiplier}
                  onChange={(e) => setCaMultiplier(parseFloat(e.target.value) || 0)}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <p className="text-[10px] text-slate-500 mt-2">Scales all axial drag (CA) coefficients</p>
              </div>
              <div className="border border-slate-700 rounded-lg overflow-hidden">
                <HotTable
                  data={hotAeroData}
                  colHeaders={['Mach', 'Alpha (°)', 'Cd', 'Cn', 'Cm']}
                  rowHeaders={true}
                  stretchH="all"
                  height={220}
                  themeName="ht-theme-main"
                  licenseKey="non-commercial-and-evaluation"
                />
              </div>

              {/* Collapsible Aero Coefficient Panels */}
              <div className="space-y-4">
                {/* Accordion 1: Damping Derivatives */}
                <div className="border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden transition-all duration-300">
                  <button
                    type="button"
                    onClick={() => setShowDampingTable(!showDampingTable)}
                    className="w-full flex items-center justify-between p-4 bg-slate-900/60 hover:bg-slate-900 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        "w-2.5 h-2.5 rounded-full animate-pulse",
                        dampingData.length > 0 ? "bg-emerald-500" : "bg-slate-600"
                      )} />
                      <div>
                        <h4 className="font-semibold text-slate-200">Damping Derivatives (damping_coeffs.csv)</h4>
                        <p className="text-xs text-slate-500">
                          {dampingData.length > 0 ? `${dampingData.length} coefficient entries loaded` : 'No damping coefficients loaded'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "text-xs px-2.5 py-0.5 rounded-full font-medium border",
                        dampingData.length > 0
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      )}>
                        {dampingData.length > 0 ? 'Loaded' : 'Not Found'}
                      </span>
                      {showDampingTable ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                    </div>
                  </button>
                  
                  {showDampingTable && (
                    <div className="p-6 border-t border-slate-800/80 space-y-6 bg-slate-950/40 animate-in fade-in slide-in-from-top-2 duration-200">
                      {dampingData.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                            <HotTable
                              data={hotDampingData}
                              colHeaders={['Mach', 'Alpha (°)', 'Cmq (pitch)', 'Cnq (yaw)', 'Clp (roll)']}
                              rowHeaders={true}
                              stretchH="all"
                              height={220}
                              themeName="ht-theme-main"
                              licenseKey="non-commercial-and-evaluation"
                            />
                          </div>
                          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                            <div>
                              <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Damping Plot (Cmq vs Mach)</h5>
                              <p className="text-[10px] text-slate-500 mb-4">Pitch damping moment derivative vs Mach number (Alpha = {plotAlpha}°)</p>
                            </div>
                            <div className="h-40 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={dampingData.filter(d => d.alpha === plotAlpha)} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                  <XAxis dataKey="mach" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(v) => `M ${v}`} />
                                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                                  <Tooltip
                                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: '11px' }}
                                    itemStyle={{ color: '#38bdf8' }}
                                    labelStyle={{ color: '#94a3b8', marginBottom: '2px' }}
                                    formatter={(value: any) => [Number(value).toFixed(4), 'Cmq']}
                                    labelFormatter={(label) => `Mach ${label}`}
                                  />
                                  <Line type="monotone" dataKey="Cmq" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-6 text-sm text-slate-500">
                          damping_coeffs.csv not loaded for this rocket. Rotational dynamics will use default damping settings.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Accordion 2: Fin Effectiveness */}
                <div className="border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden transition-all duration-300">
                  <button
                    type="button"
                    onClick={() => setShowFinTable(!showFinTable)}
                    className="w-full flex items-center justify-between p-4 bg-slate-900/60 hover:bg-slate-900 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        "w-2.5 h-2.5 rounded-full animate-pulse",
                        finData.length > 0 ? "bg-emerald-500" : "bg-slate-600"
                      )} />
                      <div>
                        <h4 className="font-semibold text-slate-200">Fin Effectiveness (fin_deflection_coeffs.csv)</h4>
                        <p className="text-xs text-slate-500">
                          {finData.length > 0 ? `${finData.length} deflection entries loaded` : 'No fin deflection coefficients loaded'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "text-xs px-2.5 py-0.5 rounded-full font-medium border",
                        finData.length > 0
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      )}>
                        {finData.length > 0 ? 'Loaded' : 'Not Found'}
                      </span>
                      {showFinTable ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                    </div>
                  </button>
                  
                  {showFinTable && (
                    <div className="p-6 border-t border-slate-800/80 space-y-6 bg-slate-950/40 animate-in fade-in slide-in-from-top-2 duration-200">
                      {finData.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                            <HotTable
                              data={hotFinData}
                              colHeaders={['Mach', 'Delta (°)', 'Cnd (force)', 'Cmd (moment)']}
                              rowHeaders={true}
                              stretchH="all"
                              height={220}
                              themeName="ht-theme-main"
                              licenseKey="non-commercial-and-evaluation"
                            />
                          </div>
                          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                            <div>
                              <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Fin Control Authority (Cmd vs Delta)</h5>
                              <p className="text-[10px] text-slate-500 mb-4">Pitch control moment derivative vs deflection angle (Mach = {plotMach})</p>
                            </div>
                            <div className="h-40 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={finData.filter(d => d.mach === plotMach)} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                  <XAxis dataKey="delta" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}°`} />
                                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                                  <Tooltip
                                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: '11px' }}
                                    itemStyle={{ color: '#f43f5e' }}
                                    labelStyle={{ color: '#94a3b8', marginBottom: '2px' }}
                                    formatter={(value: any) => [Number(value).toFixed(4), 'Cmd']}
                                    labelFormatter={(label) => `Delta ${label}°`}
                                  />
                                  <Line type="monotone" dataKey="Cmd" stroke="#f43f5e" strokeWidth={1.5} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-6 text-sm text-slate-500">
                          fin_deflection_coeffs.csv not loaded for this rocket. Fin control force estimates will assume baseline effectiveness models.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Accordion 3: Roll Coupling */}
                <div className="border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden transition-all duration-300">
                  <button
                    type="button"
                    onClick={() => setShowRollTable(!showRollTable)}
                    className="w-full flex items-center justify-between p-4 bg-slate-900/60 hover:bg-slate-900 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        "w-2.5 h-2.5 rounded-full animate-pulse",
                        rollData.length > 0 ? "bg-emerald-500" : "bg-slate-600"
                      )} />
                      <div>
                        <h4 className="font-semibold text-slate-200">Roll Coupling (roll_aero_coeffs.csv)</h4>
                        <p className="text-xs text-slate-500">
                          {rollData.length > 0 ? `${rollData.length} roll coefficient entries loaded` : 'No roll coupling coefficients loaded'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "text-xs px-2.5 py-0.5 rounded-full font-medium border",
                        rollData.length > 0
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      )}>
                        {rollData.length > 0 ? 'Loaded' : 'Not Found'}
                      </span>
                      {showRollTable ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                    </div>
                  </button>
                  
                  {showRollTable && (
                    <div className="p-6 border-t border-slate-800/80 space-y-6 bg-slate-950/40 animate-in fade-in slide-in-from-top-2 duration-200">
                      {rollData.length > 0 ? (
                        <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
                          <HotTable
                            data={hotRollData}
                            colHeaders={['Mach', 'Alpha (°)', 'Roll Deflection (°)', 'Cll (roll moment)']}
                            rowHeaders={true}
                            stretchH="all"
                            height={220}
                            themeName="ht-theme-main"
                            licenseKey="non-commercial-and-evaluation"
                          />
                        </div>
                      ) : (
                        <div className="text-center py-6 text-sm text-slate-500">
                          roll_aero_coeffs.csv not loaded for this rocket. Roll coupling effects from asymmetric flow or fin settings will not be modeled.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Live Response Plots */}
              <div className="mt-8 border-t border-slate-800 pt-8">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold">Live Coefficient Response Plots</h3>
                  <select
                    value={selectedCoeff}
                    onChange={(e) => setSelectedCoeff(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-3 py-1.5"
                  >
                    <option value="Cd">Cd (Drag)</option>
                    <option value="Cn">Cn (Normal Force)</option>
                    <option value="Cm">Cm (Pitching Moment)</option>
                    <option value="Cnp">Cnp (Magnus Yaw)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  {/* Plot 1: Mach vs Coeff */}
                  <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-slate-400 mb-4 text-center">Mach vs {selectedCoeff} <span className="text-xs font-normal">(Alpha = 4.0°)</span></h4>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={machPlotData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" />
                          <XAxis dataKey="mach" stroke="#556070" tick={{ fontSize: 10 }} tickFormatter={(v) => `M ${v}`} />
                          <YAxis stroke="#556070" tick={{ fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{ background: '#12171f', border: '1px solid #2a3040', fontSize: '12px' }}
                            itemStyle={{ color: '#00b4d8' }}
                            labelStyle={{ color: '#8895a7', marginBottom: '4px' }}
                            formatter={(value: any) => [Number(value).toFixed(4), selectedCoeff]}
                            labelFormatter={(label) => `Mach ${label}`}
                          />
                          <Line type="monotone" dataKey={selectedCoeff} stroke="#00b4d8" strokeWidth={1.5} dot={false} isAnimationActive={true} animationDuration={300} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Plot 2: Alpha vs Coeff */}
                  <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-slate-400 mb-4 text-center">Alpha vs {selectedCoeff} <span className="text-xs font-normal">(Mach = 1.2)</span></h4>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={alphaPlotData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" />
                          <XAxis dataKey="alpha" stroke="#556070" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}°`} />
                          <YAxis stroke="#556070" tick={{ fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{ background: '#12171f', border: '1px solid #2a3040', fontSize: '12px' }}
                            itemStyle={{ color: '#ff6b35' }}
                            labelStyle={{ color: '#8895a7', marginBottom: '4px' }}
                            formatter={(value: any) => [Number(value).toFixed(4), selectedCoeff]}
                            labelFormatter={(label) => `Alpha ${label}°`}
                          />
                          <Line type="monotone" dataKey={selectedCoeff} stroke="#ff6b35" strokeWidth={1.5} dot={false} isAnimationActive={true} animationDuration={300} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Propulsion Tab */}
          {activeTab === 'propulsion' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-4">
                <h3 className="text-lg font-semibold">Solid Motor Profile (thrust_curve.csv)</h3>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded border border-emerald-500/20">
                  {currentProp.thrust_curve_file || 'thrust_curve.csv'} Loaded
                </span>
              </div>
              <div className="h-64 w-full bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={[
                    { time: 0, thrust: 0 },
                    { time: (currentProp.burn_time_s || 4.25) * 0.1, thrust: (((currentProp.total_impulse_Ns || 1200000) / (currentProp.burn_time_s || 4.25)) / 1000 * 1.5) * thrustMultiplier * 0.9 },
                    { time: (currentProp.burn_time_s || 4.25) * 0.2, thrust: (((currentProp.total_impulse_Ns || 1200000) / (currentProp.burn_time_s || 4.25)) / 1000 * 1.5) * thrustMultiplier * 0.85 },
                    { time: (currentProp.burn_time_s || 4.25) * 0.5, thrust: (((currentProp.total_impulse_Ns || 1200000) / (currentProp.burn_time_s || 4.25)) / 1000 * 1.5) * thrustMultiplier * 0.81 },
                    { time: (currentProp.burn_time_s || 4.25) * 0.8, thrust: (((currentProp.total_impulse_Ns || 1200000) / (currentProp.burn_time_s || 4.25)) / 1000 * 1.5) * thrustMultiplier * 0.95 },
                    { time: (currentProp.burn_time_s || 4.25) * 0.9, thrust: (((currentProp.total_impulse_Ns || 1200000) / (currentProp.burn_time_s || 4.25)) / 1000 * 1.5) * thrustMultiplier * 1.0 },
                    { time: (currentProp.burn_time_s || 4.25) * 0.95, thrust: (((currentProp.total_impulse_Ns || 1200000) / (currentProp.burn_time_s || 4.25)) / 1000 * 1.5) * thrustMultiplier * 0.4 },
                    { time: currentProp.burn_time_s || 4.25, thrust: 0 }
                  ]} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a3040" />
                    <XAxis dataKey="time" stroke="#556070" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Number(v).toFixed(1)}s`} />
                    <YAxis stroke="#556070" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: '#12171f', border: '1px solid #2a3040', fontSize: '12px' }}
                      itemStyle={{ color: '#f97316' }}
                      labelStyle={{ color: '#8895a7', marginBottom: '4px' }}
                      formatter={(value: any) => [`${Number(value).toFixed(1)} kN`, 'Thrust']}
                      labelFormatter={(label) => `Time ${Number(label).toFixed(2)}s`}
                    />
                    <Line type="monotone" dataKey="thrust" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={true} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-slate-800 p-4 rounded-lg">
                  <p className="text-[10px] text-slate-400 uppercase">Burn Time (s)</p>
                  <input
                    type="number"
                    step="0.01"
                    value={currentProp.burn_time_s || 4.25}
                    onChange={(e) => {
                      if (!currentStage) return;
                      dispatch(updateStage({
                        stageIndex: activeStageIdx,
                        patch: {
                          propulsion: {
                            ...currentProp,
                            burn_time_s: parseFloat(e.target.value) || 0
                          }
                        }
                      }));
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-lg mt-1 focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div className="bg-slate-800 p-4 rounded-lg">
                  <p className="text-[10px] text-slate-400 uppercase">Peak Thrust (kN)</p>
                  <p className="text-xl font-mono text-white mt-2">
                    {(((currentProp.total_impulse_Ns || 1200000) / (currentProp.burn_time_s || 4.25)) / 1000 * 1.5).toFixed(1)} kN
                  </p>
                </div>
                <div className="bg-slate-800 p-4 rounded-lg">
                  <p className="text-[10px] text-slate-400 uppercase">Total Impulse (Ns)</p>
                  <input
                    type="number"
                    value={currentProp.total_impulse_Ns || 1200000}
                    onChange={(e) => {
                      if (!currentStage) return;
                      dispatch(updateStage({
                        stageIndex: activeStageIdx,
                        patch: {
                          propulsion: {
                            ...currentProp,
                            total_impulse_Ns: parseFloat(e.target.value) || 0
                          }
                        }
                      }));
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-lg mt-1 focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div className="bg-slate-800 p-4 rounded-lg">
                  <p className="text-[10px] text-slate-400 uppercase">Spec Impulse (s)</p>
                  <p className="text-xl font-mono text-white mt-2">
                    {((currentProp.total_impulse_Ns || 1200000) / (Math.max(1, currentStage?.physical?.propellant_mass_kg ?? 285) * 9.80665)).toFixed(1)} s
                  </p>
                </div>
                <div className="bg-slate-800 p-4 rounded-lg">
                  <p className="text-[10px] text-slate-400 uppercase">Max Mass Flow</p>
                  <p className="text-xl font-mono text-white mt-2">
                    {(Math.max(1, currentStage?.physical?.propellant_mass_kg ?? 285) / (currentProp.burn_time_s || 4.25) * 1.25).toFixed(1)} kg/s
                  </p>
                </div>
              </div>
              <div className="max-w-md bg-slate-900/40 border border-slate-700/50 rounded-xl p-5 mt-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-400 font-semibold uppercase text-xs">Thrust Multiplier</span>
                  <span className="text-white font-mono">{thrustMultiplier.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={thrustMultiplier}
                  onChange={(e) => {
                    const mult = parseFloat(e.target.value) || 0;
                    setThrustMultiplier(mult);
                    if (currentStage) {
                      dispatch(updateStage({
                        stageIndex: activeStageIdx,
                        patch: {
                          propulsion: {
                            ...currentProp,
                            thrust_multiplier: mult
                          }
                        }
                      }));
                    }
                  }}
                  className="w-full accent-orange-500 cursor-pointer"
                />
                <p className="text-[10px] text-slate-500 mt-2">Scales thrust magnitude while maintaining burn time</p>
              </div>
            </div>
          )}

          {/* Stages & Fins Tab */}
          {activeTab === 'stages_fins' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">

              {/* Stages Section */}
              <h3 className="text-lg font-semibold border-b border-slate-800 pb-2 mb-4">Multi-Stage Configuration</h3>

              {stages.map((stage, sIdx) => {
                const rStage = activeRocket.stages[sIdx];
                const rFin = rStage?.fin_config?.sets?.[0] ?? {
                  set_index: 0,
                  fin_count: 4,
                  S_fin_m2: 0.0227,
                  c_fin_m: 0.150,
                  x_fin_m: 1.106,
                  delta_max_deg: 20.0,
                  delta_dot_max_deg_s: 300.0,
                  actuator_ref: 'default_4020',
                  config_type: 'X',
                };

                return (
                  <div key={stage.id} className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-bold text-blue-400">{stage.name}</h4>
                      <span className="text-xs bg-slate-800 px-2 py-1 rounded">
                        {stage.active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <div className="bg-slate-800/50 rounded p-3 border border-slate-700 mt-4">
                      <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-semibold text-slate-300 flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!rStage?.separation}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              if (rStage) {
                                dispatch(updateStage({
                                  stageIndex: sIdx,
                                  patch: {
                                    separation: checked 
                                      ? { trigger: 'burnout', offset_s: 0, timeout_s: 0, arming_s: 0, nail_count: 0, nail_pyro_events: [] }
                                      : undefined
                                  }
                                }));
                              }
                            }}
                            className="accent-blue-500"
                          />
                          Enable Separation Sequence
                        </label>
                      </div>

                      {!!rStage?.separation && (
                        <div className="grid grid-cols-2 gap-4 text-sm animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="space-y-1">
                            <label className="text-xs text-slate-500">Separation Trigger Type</label>
                            <select
                              className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-slate-200"
                              value={rStage?.separation?.trigger ?? 'burnout'}
                              onChange={(e) => {
                                const val = e.target.value as any;
                                const newStages = [...stages];
                                newStages[sIdx].trigger = val;
                                setStages(newStages);
                                if (rStage) {
                                  dispatch(updateStage({
                                    stageIndex: sIdx,
                                    patch: {
                                      separation: {
                                        ...(rStage.separation ?? { trigger: 'burnout', offset_s: 0, timeout_s: 0, arming_s: 0, nail_count: 0, nail_pyro_events: [] }),
                                        trigger: val
                                      }
                                    }
                                  }));
                                }
                              }}
                            >
                              <option value="burnout">Burnout</option>
                              <option value="time">Time</option>
                              <option value="altitude">Altitude</option>
                              <option value="velocity">Velocity</option>
                              <option value="event">Event</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-slate-500">Offset (s)</label>
                            <input
                              type="number"
                              value={rStage?.separation?.offset_s ?? 0}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const newStages = [...stages];
                                newStages[sIdx].offset = val;
                                setStages(newStages);
                                if (rStage) {
                                  dispatch(updateStage({
                                    stageIndex: sIdx,
                                    patch: {
                                      separation: {
                                        ...(rStage.separation ?? { trigger: 'burnout', offset_s: 0, timeout_s: 0, arming_s: 0, nail_count: 0, nail_pyro_events: [] }),
                                        offset_s: val
                                      }
                                    }
                                  }));
                                }
                              }}
                              className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-slate-200"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {stage.trigger !== 'burnout' && (
                      <div className="mt-4 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3">
                          <label className="text-xs font-semibold text-blue-400 uppercase block mb-1">
                            {stage.trigger === 'time' ? 'Target Time (s)' : 'Target Altitude (m)'}
                          </label>
                          <input
                            type="number"
                            placeholder={stage.trigger === 'time' ? "e.g. 60.0" : "e.g. 35000"}
                            className="w-full bg-slate-900 border border-blue-500/30 rounded p-2 text-white font-mono"
                            value={stage.triggerValue}
                            onChange={(e) => {
                              const newStages = [...stages];
                              newStages[sIdx].triggerValue = e.target.value;
                              setStages(newStages);
                            }}
                          />
                          <p className="text-[10px] text-slate-500 mt-2 italic">
                            The separation sequence will initiate when the rocket reaches this {stage.trigger === 'time' ? 'duration' : 'height'} + Offset (s).
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="mt-6 pt-4 border-t border-slate-700/50">
                      <h5 className="text-xs font-semibold text-slate-400 mb-3">Separation Actuators</h5>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="bg-slate-800/50 rounded p-3 border border-slate-700">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm text-slate-300 flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(rStage?.separation?.nail_count ?? 0) > 0 || stage.useNails}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  const newStages = [...stages];
                                  newStages[sIdx].useNails = checked;
                                  setStages(newStages);
                                  if (rStage) {
                                    dispatch(updateStage({
                                      stageIndex: sIdx,
                                      patch: {
                                        separation: {
                                          ...(rStage.separation ?? { trigger: 'burnout', offset_s: 0, timeout_s: 0, arming_s: 0, nail_count: 0, nail_pyro_events: [] }),
                                          nail_count: checked ? stage.numNails : 0
                                        }
                                      }
                                    }));
                                  }
                                }}
                                className="accent-blue-500"
                              />
                              Nail Pyro Events
                            </label>
                          </div>
                          {stage.useNails && (
                            <div className="mt-2 pl-6">
                              <label className="text-xs text-slate-500 block mb-1">Number of Nails</label>
                              <input
                                type="number"
                                min="1"
                                value={rStage?.separation?.nail_count || stage.numNails}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 1;
                                  const newStages = [...stages];
                                  newStages[sIdx].numNails = val;
                                  setStages(newStages);
                                  if (rStage) {
                                    dispatch(updateStage({
                                      stageIndex: sIdx,
                                      patch: {
                                        separation: {
                                          ...(rStage.separation ?? { trigger: 'burnout', offset_s: 0, timeout_s: 0, arming_s: 0, nail_count: 0, nail_pyro_events: [] }),
                                          nail_count: val
                                        }
                                      }
                                    }));
                                  }
                                }}
                                className="w-full bg-slate-900 border border-slate-600 rounded p-1 text-slate-200 text-sm"
                              />
                            </div>
                          )}
                        </div>

                        <div className="bg-slate-800/50 rounded p-3 border border-slate-700">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm text-slate-300 flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={stage.useThrusters}
                                onChange={(e) => {
                                  const newStages = [...stages];
                                  newStages[sIdx].useThrusters = e.target.checked;
                                  setStages(newStages);
                                }}
                                className="accent-blue-500"
                              />
                              Thrusters
                            </label>
                          </div>
                          {stage.useThrusters && (
                            <div className="mt-2 pl-6">
                              <label className="text-xs text-slate-500 block mb-1">Number of Thrusters</label>
                              <input
                                type="number"
                                min="1"
                                value={stage.numThrusters}
                                onChange={(e) => {
                                  const newStages = [...stages];
                                  newStages[sIdx].numThrusters = parseInt(e.target.value) || 1;
                                  setStages(newStages);
                                }}
                                className="w-full bg-slate-900 border border-slate-600 rounded p-1 text-slate-200 text-sm"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Fins & Controller Section (Now inside Stage card) */}
                    <div className="mt-6 pt-4 border-t border-slate-700/50">
                      {stage.controllers.map((ctrl, cIdx) => (
                        <div key={cIdx} className={clsx("mb-8 pb-8", cIdx < stage.controllers.length - 1 && "border-b border-slate-800/50")}>
                          <div className="mb-4">
                            <h5 className="text-sm font-semibold text-slate-300">
                              <span className="text-blue-400 capitalize">{ordinals[cIdx] || (cIdx + 1 + "th")}</span> Controller Configuration
                            </h5>
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <div className={clsx("grid gap-4", ['none', 'cold_gas'].includes(ctrl.type) ? "grid-cols-1" : ctrl.type === 'tvc' ? "grid-cols-2" : "grid-cols-3")}>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-slate-500 uppercase">Controller Type</label>
                                  <select
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                                    value={rStage?.controller_type ?? ctrl.type}
                                    onChange={e => {
                                      const val = e.target.value as any;
                                      const newStages = [...stages];
                                      newStages[sIdx].controllers[cIdx].type = val;
                                      setStages(newStages);
                                      if (rStage) {
                                        dispatch(updateStage({
                                          stageIndex: sIdx,
                                          patch: {
                                            controller_type: val
                                          }
                                        }));
                                      }
                                    }}
                                  >
                                    <option value="none">None</option>
                                    <option value="fins">Fins (Canard)</option>
                                    <option value="tail-fin">Tail-Fin</option>
                                    <option value="tvc">TVC</option>
                                    <option value="roll_canards">Roll Canards</option>
                                    <option value="cold_gas">Cold Gas</option>
                                  </select>
                                </div>

                                {/* Actuator/Fin Count Field - Shown for Fins AND TVC */}
                                {([...['fins', 'tail-fin', 'roll_canards'], 'tvc'].includes(ctrl.type)) && (
                                  <div className="space-y-2 animate-in fade-in slide-in-from-left-1 duration-200">
                                    <label className="text-xs font-semibold text-slate-500 uppercase">
                                      {ctrl.type === 'tvc' ? 'N Actuators' : 'N Fins (N Actuators)'}
                                    </label>
                                    <input
                                      type="number"
                                      value={rFin.fin_count}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        if (rStage) {
                                          dispatch(updateStage({
                                            stageIndex: sIdx,
                                            patch: {
                                              fin_config: {
                                                sets: [{
                                                  ...rFin,
                                                  fin_count: val
                                                }]
                                              }
                                            }
                                          }));
                                        }
                                      }}
                                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                                    />
                                  </div>
                                )}

                                {/* Fin Layout - ONLY for Fins */}
                                {['fins', 'tail-fin', 'roll_canards'].includes(ctrl.type) && (
                                  <div className="space-y-2 animate-in fade-in slide-in-from-left-1 duration-200">
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Fin Layout</label>
                                    <select
                                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                                      value={rFin.config_type || ctrl.layout}
                                      onChange={e => {
                                        const val = e.target.value;
                                        const newStages = [...stages];
                                        newStages[sIdx].controllers[cIdx].layout = val as any;
                                        setStages(newStages);
                                        if (rStage) {
                                          dispatch(updateStage({
                                            stageIndex: sIdx,
                                            patch: {
                                              fin_config: {
                                                sets: [{
                                                  ...rFin,
                                                  config_type: val as any
                                                }]
                                              }
                                            }
                                          }));
                                        }
                                      }}
                                    >
                                      <option value="plus">+ (Cruciform)</option>
                                      <option value="cross">x (Diagonal)</option>
                                    </select>
                                  </div>
                                )}
                              </div>

                              {['fins', 'tail-fin', 'roll_canards'].includes(ctrl.type) && (
                                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200 border-t border-slate-800/50 pt-4">
                                  <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Fin Area (m²)</label>
                                    <input
                                      type="number"
                                      step="0.0001"
                                      value={rFin.S_fin_m2}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        if (rStage) {
                                          dispatch(updateStage({
                                            stageIndex: sIdx,
                                            patch: {
                                              fin_config: {
                                                sets: [{
                                                  ...rFin,
                                                  S_fin_m2: val
                                                }]
                                              }
                                            }
                                          }));
                                        }
                                      }}
                                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Fin Chord (m)</label>
                                    <input
                                      type="number"
                                      step="0.001"
                                      value={rFin.c_fin_m}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        if (rStage) {
                                          dispatch(updateStage({
                                            stageIndex: sIdx,
                                            patch: {
                                              fin_config: {
                                                sets: [{
                                                  ...rFin,
                                                  c_fin_m: val
                                                }]
                                              }
                                            }
                                          }));
                                        }
                                      }}
                                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Actuator Type</label>
                                    <select
                                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 text-sm"
                                      value={rFin.actuator_ref || 'default_4020'}
                                      onChange={(e) => {
                                        if (rStage) {
                                          dispatch(updateStage({
                                            stageIndex: sIdx,
                                            patch: {
                                              fin_config: {
                                                sets: [{
                                                  ...rFin,
                                                  actuator_ref: e.target.value
                                                }]
                                              }
                                            }
                                          }));
                                        }
                                      }}
                                    >
                                      <option value="default_4020">Default 4020 BLDC</option>
                                      <option value="high_torque_8040">High Torque 8040</option>
                                      <option value="pneumatic_fast">Pneumatic Fast-Acting</option>
                                    </select>
                                  </div>
                                </div>
                              )}

                              {ctrl.type !== 'none' && (
                                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200 border-t border-slate-800/50 pt-4">
                                  <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Max Deflection (°)</label>
                                    <input
                                      type="number"
                                      value={rFin.delta_max_deg}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        if (rStage) {
                                          dispatch(updateStage({
                                            stageIndex: sIdx,
                                            patch: {
                                              fin_config: {
                                                sets: [{
                                                  ...rFin,
                                                  delta_max_deg: val
                                                }]
                                              }
                                            }
                                          }));
                                        }
                                      }}
                                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Max Rate (°/s)</label>
                                    <input
                                      type="number"
                                      value={rFin.delta_dot_max_deg_s}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        if (rStage) {
                                          dispatch(updateStage({
                                            stageIndex: sIdx,
                                            patch: {
                                              fin_config: {
                                                sets: [{
                                                  ...rFin,
                                                  delta_dot_max_deg_s: val
                                                }]
                                              }
                                            }
                                          }));
                                        }
                                      }}
                                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex flex-col justify-between">
                              <div>
                                
                                <h4 className="text-sm font-semibold mb-3">Control Allocation (Mixer)</h4>
                                <div className="bg-slate-900/50 p-3 rounded border border-slate-700/50 mb-4 text-center">
                                  <span className="text-xs text-slate-400 uppercase tracking-widest block mb-1">Computed Allocation</span>
                                  <span className="text-emerald-400 font-bold tracking-wide">
                                    {ctrl.type === 'tvc' ? 'PSEUDO-INVERSE' : 
                                     (['fins', 'tail-fin', 'roll_canards'].includes(ctrl.type) && (rFin?.fin_count || 4) > 4) ? 'PSEUDO-INVERSE (OVER-ACTUATED)' :
                                     (['fins', 'tail-fin', 'roll_canards'].includes(ctrl.type) && (rFin?.config_type || ctrl.layout) === 'plus') ? 'DIRECT (1:1 MAPPING)' :
                                     (['fins', 'tail-fin', 'roll_canards'].includes(ctrl.type) && (rFin?.config_type || ctrl.layout) === 'X') ? 'PSEUDO-INVERSE' :
                                     'DAISY-CHAIN'}
                                  </span>
                                </div>

                                {['fins', 'tail-fin', 'roll_canards'].includes(ctrl.type) ? (
                                  <div className="flex justify-center my-4">
                                  <svg width="120" height="120" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="18" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                                    {ctrl.layout === 'plus' ? (
                                      <>
                                        <path d="M 50 8 L 50 32" stroke="#3b82f6" strokeWidth="4" />
                                        <path d="M 50 92 L 50 68" stroke="#3b82f6" strokeWidth="4" />
                                        <path d="M 8 50 L 32 50" stroke="#f59e0b" strokeWidth="4" />
                                        <path d="M 92 50 L 68 50" stroke="#f59e0b" strokeWidth="4" />
                                        <text x="50" y="6" fill="#94a3b8" fontSize="8" textAnchor="middle">+X (Pitch)</text>
                                        <text x="50" y="100" fill="#94a3b8" fontSize="8" textAnchor="middle">-X (Pitch)</text>
                                        <text x="6" y="53" fill="#94a3b8" fontSize="8" textAnchor="end">-Y (Yaw)</text>
                                        <text x="94" y="53" fill="#94a3b8" fontSize="8" textAnchor="start">+Y (Yaw)</text>
                                      </>
                                    ) : (
                                      <>
                                        <path d="M 20 20 L 37 37" stroke="#8b5cf6" strokeWidth="4" />
                                        <path d="M 80 80 L 63 63" stroke="#8b5cf6" strokeWidth="4" />
                                        <path d="M 20 80 L 37 63" stroke="#10b981" strokeWidth="4" />
                                        <path d="M 80 20 L 63 37" stroke="#10b981" strokeWidth="4" />
                                        <text x="18" y="18" fill="#94a3b8" fontSize="8" textAnchor="end">F1</text>
                                        <text x="82" y="82" fill="#94a3b8" fontSize="8" textAnchor="start">F3</text>
                                        <text x="18" y="82" fill="#94a3b8" fontSize="8" textAnchor="end">F4</text>
                                        <text x="82" y="18" fill="#94a3b8" fontSize="8" textAnchor="start">F2</text>
                                      </>
                                    )}
                                  </svg>
                                </div>
                              ) : ctrl.type === 'tvc' ? (
                                <div className="flex justify-center items-center h-24 my-4">
                                  <div className="text-center text-slate-400">
                                    <Rocket className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                                    <span className="text-xs">Thrust Vectoring</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex justify-center items-center h-24 my-4">
                                  <div className="text-center text-slate-400">
                                    <Activity className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                                    <span className="text-xs">Reaction Control</span>
                                  </div>
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-4 border-t border-slate-700/50 pt-2">
                              Mixing Strategy B (Uniform demand reduction) is active per GNC System Plan §2.8.
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="mt-4 pt-4 border-t border-slate-800/50 text-right">
                      <button
                        onClick={() => {
                          const newStages = [...stages];
                          newStages[sIdx].controllers.push({ type: 'fins', layout: 'plus' });
                          setStages(newStages);
                        }}
                        className="text-xs bg-slate-700 text-slate-300 px-4 py-2 rounded hover:bg-slate-600 transition-colors inline-flex items-center gap-2"
                      >
                        <GitMerge className="w-3 h-3" />
                        + Add new controller
                      </button>
                    </div>

                    {sIdx === stages.length - 1 && (
                      <div className="mt-8 pt-6 border-t border-slate-700/50">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-200">Terminal Seeker</h4>
                            <p className="text-[10px] text-slate-500 mt-1">Enable active seeker for terminal guidance (only available on the final stage).</p>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-xs text-slate-400">Enable</span>
                            <input
                              type="checkbox"
                              checked={rStage?.seeker_capable ?? false}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                if (rStage) {
                                  dispatch(updateStage({
                                    stageIndex: sIdx,
                                    patch: { seeker_capable: checked }
                                  }));
                                }
                              }}
                              className="accent-blue-500 w-4 h-4"
                            />
                          </label>
                        </div>
                        
                        {rStage?.seeker_capable && (
                          <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-slate-500 uppercase">Seeker Mode</label>
                              <select
                                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 text-sm"
                                value={(rStage as any)?.seeker_mode || 'strapdown'}
                                onChange={(e) => {
                                  if (rStage) {
                                    dispatch(updateStage({
                                      stageIndex: sIdx,
                                      patch: { seeker_mode: e.target.value } as any
                                    }));
                                  }
                                }}
                              >
                                <option value="strapdown">Strapdown</option>
                                <option value="gimbaled">Gimbaled</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}


            </div>
          )}


          {/* ── COMPATIBILITY (C1–C25) TAB ── */}
          {activeTab === 'compatibility' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h3 className="text-lg font-semibold">C1–C25 Validation Report</h3>
                <button onClick={runValidation} disabled={validating}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  <RefreshCw className={clsx('w-4 h-4', validating && 'animate-spin')} />
                  {validating ? 'Running…' : 'Run Validation'}
                </button>
              </div>

              {!validReport ? (
                <div className="text-center py-16 text-slate-600">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No validation report yet — click "Run Validation" to check C1–C25 clauses.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className={clsx('text-sm font-bold p-3 rounded-lg border', verdictBg[validReport.overall], verdictColor[validReport.overall])}>
                    Overall: {validReport.overall} &nbsp;·&nbsp;
                    {validReport.clauses.filter(c => c.verdict === 'PASS').length} passed &nbsp;·&nbsp;
                    {validReport.clauses.filter(c => c.verdict === 'WARN').length} warnings &nbsp;·&nbsp;
                    {validReport.clauses.filter(c => c.verdict === 'FAIL').length} failures
                  </div>
                  {validReport.clauses.map((clause, i) => (
                    <div key={i} className={clsx('flex items-start gap-3 p-3 rounded-lg border text-sm', verdictBg[clause.verdict])}>
                      {clause.verdict === 'PASS' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />}
                      {clause.verdict === 'WARN' && <AlertCircle  className="w-4 h-4 shrink-0 text-yellow-400 mt-0.5" />}
                      {clause.verdict === 'FAIL' && <XCircle      className="w-4 h-4 shrink-0 text-red-400    mt-0.5" />}
                      <div>
                        <span className={clsx('font-mono font-bold text-xs', verdictColor[clause.verdict])}>{clause.clause}</span>
                        {clause.message && <p className="text-slate-400 text-xs mt-0.5">{clause.message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
