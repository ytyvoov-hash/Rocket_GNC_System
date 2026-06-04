import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Environment, Trail, useGLTF, Cloud, Float, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, DepthOfField, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { connectTelemetry, disconnectTelemetry } from './services/telemetryWs';
import { resetTelemetry } from './store/telemetrySlice';
import { store } from './store/store';
import clsx from 'clsx';

interface RocketProps {
  pitch: number;
  yaw: number;
  roll: number;
  cadUrl: string | null;
}

// Procedural fallback if CAD is missing or failing
function ProceduralRocket() {
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[0.2, 0.4, 4, 32]} />
        <meshStandardMaterial color='#cbd5e1' metalness={0.8} roughness={0.2} />
        <mesh position={[0, 2.5, 0]}>
          <coneGeometry args={[0.2, 1, 32]} />
          <meshStandardMaterial color='#ef4444' metalness={0.5} roughness={0.3} />
        </mesh>
        <mesh position={[0, -2.5, 0]}>
          <coneGeometry args={[0.3, 1.5, 16]} />
          <meshBasicMaterial color='#38bdf8' transparent opacity={0.6} />
        </mesh>
      </mesh>
    </group>
  );
}

// Loads the actual GLB CAD Model
function CadRocket({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const clonedScene = useMemo(() => scene.clone(), [scene]);
  return <primitive object={clonedScene} />;
}

// Safely attempts to load CAD, catches errors
class ErrorBoundaryModel extends React.Component<{ url: string | null }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError || !this.props.url) return <ProceduralRocket />;
    return (
      <React.Suspense fallback={<ProceduralRocket />}>
        <CadRocket url={this.props.url} />
      </React.Suspense>
    );
  }
}

// The Rocket Wrapper applying Euler Telemetry
function RocketModel({ pitch, yaw, roll, cadUrl, thrust, velocity }: RocketProps & { thrust: number; velocity: number }) {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame(() => {
    if (groupRef.current) {
      const q = new THREE.Quaternion();

      // 1. Roll around local Y (nose)
      const qRoll = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        (roll * Math.PI) / 180
      );

      // 2. Pitch around local Z (tilts nose from +Y towards +X)
      // 90 deg = straight up (0 rotation). 0 deg = horizontal (-90 rotation around Z)
      const qPitch = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        ((pitch - 90) * Math.PI) / 180
      );

      // 3. Yaw around global Y (rotates the tilted system)
      // North is +X, East is +Z. Rotation from +X to +Z is a negative rotation around +Y.
      const qYaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        (-yaw * Math.PI) / 180
      );

      // Combine rotations: Yaw * Pitch * Roll
      q.multiply(qYaw).multiply(qPitch).multiply(qRoll);
      
      groupRef.current.quaternion.copy(q);
      
      // Add vibration/shake during high thrust
      if (thrust > 1000) {
        const shakeIntensity = (thrust / 5000) * 0.02;
        groupRef.current.position.set(
          (Math.random() - 0.5) * shakeIntensity,
          (Math.random() - 0.5) * shakeIntensity,
          (Math.random() - 0.5) * shakeIntensity
        );
      } else {
        groupRef.current.position.set(0, 0, 0);
      }
    }
  });

  return (
    <group ref={groupRef} scale={[2, 2, 2]}>
      <ErrorBoundaryModel url={cadUrl} />
      <ExhaustPlume thrust={thrust} velocity={velocity} />
    </group>
  );
}

// Enhanced Exhaust Plume Particle System
function ExhaustPlume({ thrust, velocity }: { thrust: number; velocity: number }) {
  const particleCount = 500;
  const particleSize = 0.3;
  
  if (thrust < 100) return null;
  
  return (
    <group position={[0, -2.5, 0]}>
      <Sparkles
        count={particleCount}
        size={particleSize}
        color="#ff6b35"
        opacity={Math.min(thrust / 5000, 0.9)}
        speed={velocity * 0.05 + 0.5}
        scale={[1, 2, 1]}
      />
      <Sparkles
        count={particleCount / 2}
        size={particleSize * 0.5}
        color="#ffcc00"
        opacity={Math.min(thrust / 5000, 0.7)}
        speed={velocity * 0.03 + 0.3}
        scale={[0.8, 1.5, 0.8]}
      />
    </group>
  );
}

// Procedural Tree Component
function Tree({ position, scale }: { position: [number, number, number]; scale: number }) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* Trunk */}
      <mesh position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.5, 2, 8]} />
        <meshStandardMaterial color="#5D4037" roughness={0.9} />
      </mesh>
      {/* Foliage */}
      <mesh position={[0, 3, 0]} castShadow>
        <coneGeometry args={[1.5, 3, 8]} />
        <meshStandardMaterial color="#2E7D32" roughness={0.8} />
      </mesh>
      <mesh position={[0, 4, 0]} castShadow>
        <coneGeometry args={[1.2, 2.5, 8]} />
        <meshStandardMaterial color="#388E3C" roughness={0.8} />
      </mesh>
    </group>
  );
}

// Procedural Mountain Component
function Mountain({ position, scale, height }: { position: [number, number, number]; scale: number; height: number }) {
  return (
    <mesh position={position} scale={[scale, height, scale]} castShadow receiveShadow>
      <coneGeometry args={[1, 1, 32]} />
      <meshStandardMaterial color="#5D4037" roughness={0.9} />
    </mesh>
  );
}

// Procedural Building Component
function Building({ position, width, depth, height }: { position: [number, number, number]; width: number; depth: number; height: number }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial color="#64748b" roughness={0.7} metalness={0.3} />
    </mesh>
  );
}

// Procedural Road Component
function Road({ position, width, length, rotation }: { position: [number, number, number]; width: number; length: number; rotation: number }) {
  return (
    <mesh position={position} rotation={[0, rotation, 0]} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial color="#334155" roughness={0.9} />
    </mesh>
  );
}

// Procedural Water Component
function Water({ position, width, length }: { position: [number, number, number]; width: number; length: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial color="#0ea5e9" roughness={0.3} metalness={0.1} transparent opacity={0.8} />
    </mesh>
  );
}

// Enhanced Dynamic Background & Earth Environment based on Altitude
function DynamicWorld({ altitude }: { altitude: number }) {
  const { scene } = useThree();

  useFrame(() => {
    // Natural sky gradient (blue to space)
    const sky = new THREE.Color('#87CEEB'); // light blue
    const space = new THREE.Color('#050505');
    const factor = Math.min(Math.max(altitude / 50000, 0), 1);
    scene.background = sky.clone().lerp(space, factor);
  });

  // Keep rocket at origin, move the world down
  const groundY = -Math.max(0, altitude);
  const earthRadius = 6371000;

  // Generate random tree positions
  const trees = useMemo(() => {
    const positions: [number, number, number][] = [];
    const scales: number[] = [];
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 50 + Math.random() * 200;
      positions.push([
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      ]);
      scales.push(0.8 + Math.random() * 0.8);
    }
    return { positions, scales };
  }, []);

  // Generate mountain positions
  const mountains = useMemo(() => {
    const positions: [number, number, number][] = [];
    const scales: number[] = [];
    const heights: number[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 300 + Math.random() * 200;
      positions.push([
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      ]);
      scales.push(50 + Math.random() * 50);
      heights.push(30 + Math.random() * 40);
    }
    return { positions, scales, heights };
  }, []);

  // Generate building positions
  const buildings = useMemo(() => {
    const positions: [number, number, number][] = [];
    const widths: number[] = [];
    const depths: number[] = [];
    const heights: number[] = [];
    for (let i = 0; i < 30; i++) {
      const x = (Math.random() - 0.5) * 400;
      const z = (Math.random() - 0.5) * 400;
      // Avoid launch pad area
      if (Math.abs(x) < 30 && Math.abs(z) < 30) continue;
      positions.push([x, 0, z]);
      widths.push(5 + Math.random() * 10);
      depths.push(5 + Math.random() * 10);
      heights.push(10 + Math.random() * 30);
    }
    return { positions, widths, depths, heights };
  }, []);

  // Generate road positions
  const roads = useMemo(() => {
    const positions: [number, number, number][] = [];
    const widths: number[] = [];
    const lengths: number[] = [];
    const rotations: number[] = [];
    
    // Main roads (cross pattern)
    positions.push([0, 0.1, 0]);
    widths.push(8);
    lengths.push(800);
    rotations.push(0);
    
    positions.push([0, 0.1, 0]);
    widths.push(8);
    lengths.push(800);
    rotations.push(Math.PI / 2);
    
    // Secondary roads
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(angle) * 200;
      const z = Math.sin(angle) * 200;
      positions.push([x, 0.1, z]);
      widths.push(6);
      lengths.push(400);
      rotations.push(angle);
    }
    
    return { positions, widths, lengths, rotations };
  }, []);

  // Generate water bodies
  const waterBodies = useMemo(() => {
    const positions: [number, number, number][] = [];
    const widths: number[] = [];
    const lengths: number[] = [];
    
    // Add a river
    positions.push([200, 0.05, 0]);
    widths.push(30);
    lengths.push(600);
    
    // Add a lake
    positions.push([-250, 0.05, 200]);
    widths.push(100);
    lengths.push(100);
    
    return { positions, widths, lengths };
  }, []);

  // Generate target site buildings
  const targetBuildings = useMemo(() => {
    const positions: [number, number, number][] = [];
    const widths: number[] = [];
    const depths: number[] = [];
    const heights: number[] = [];
    
    // Target site at approximately (1400, 100) in 3D world coordinates
    const targetX = 1400;
    const targetZ = 100;
    
    // Buildings around target site
    for (let i = 0; i < 9; i++) {
      const offsetX = (Math.random() - 0.5) * 100;
      const offsetZ = (Math.random() - 0.5) * 100;
      positions.push([targetX + offsetX, 0, targetZ + offsetZ]);
      widths.push(15 + Math.random() * 10);
      depths.push(15 + Math.random() * 10);
      heights.push(20 + Math.random() * 30);
    }
    
    return { positions, widths, depths, heights };
  }, []);

  // Generate target site trees
  const targetTrees = useMemo(() => {
    const positions: [number, number, number][] = [];
    const scales: number[] = [];
    
    // Target site at approximately (1400, 100) in 3D world coordinates
    const targetX = 1400;
    const targetZ = 100;
    
    // Trees around target site
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 50 + Math.random() * 80;
      positions.push([
        targetX + Math.cos(angle) * radius,
        0,
        targetZ + Math.sin(angle) * radius
      ]);
      scales.push(0.8 + Math.random() * 0.8);
    }
    
    return { positions, scales };
  }, []);

  return (
    <group>
      {/* Realistic terrain for low altitude */}
      {altitude < 100000 && (
        <group position={[0, groundY, 0]}>
          {/* Procedural ground with texture */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
            <planeGeometry args={[10000, 10000, 64, 64]} />
            <meshStandardMaterial 
              color="#4a7c4a" 
              roughness={0.9} 
              metalness={0.1}
              wireframe={false}
            />
          </mesh>
          
          {/* Mountains in the background */}
          {mountains.positions.map((pos, i) => (
            <Mountain 
              key={i}
              position={[pos[0], 0, pos[2]]}
              scale={mountains.scales[i]}
              height={mountains.heights[i]}
            />
          ))}
          
          {/* Water bodies */}
          {waterBodies.positions.map((pos, i) => (
            <Water
              key={i}
              position={[pos[0], pos[1], pos[2]]}
              width={waterBodies.widths[i]}
              length={waterBodies.lengths[i]}
            />
          ))}
          
          {/* Road network */}
          {roads.positions.map((pos, i) => (
            <Road
              key={i}
              position={[pos[0], pos[1], pos[2]]}
              width={roads.widths[i]}
              length={roads.lengths[i]}
              rotation={roads.rotations[i]}
            />
          ))}
          
          {/* Buildings */}
          {buildings.positions.map((pos, i) => (
            <Building
              key={i}
              position={[pos[0], buildings.heights[i] / 2, pos[2]]}
              width={buildings.widths[i]}
              depth={buildings.depths[i]}
              height={buildings.heights[i]}
            />
          ))}
          
          {/* Target site buildings */}
          {targetBuildings.positions.map((pos, i) => (
            <Building
              key={`target-building-${i}`}
              position={[pos[0], targetBuildings.heights[i] / 2, pos[2]]}
              width={targetBuildings.widths[i]}
              depth={targetBuildings.depths[i]}
              height={targetBuildings.heights[i]}
            />
          ))}
          
          {/* Trees scattered around */}
          {trees.positions.map((pos, i) => (
            <Tree 
              key={i}
              position={[pos[0], 0, pos[2]]}
              scale={trees.scales[i]}
            />
          ))}
          
          {/* Target site trees */}
          {targetTrees.positions.map((pos, i) => (
            <Tree 
              key={`target-tree-${i}`}
              position={[pos[0], 0, pos[2]]}
              scale={targetTrees.scales[i]}
            />
          ))}
          
          {/* Professional grid */}
          <gridHelper args={[10000, 100, '#475569', '#334155']} position={[0, 0, 0]} />
          
          {/* Detailed launch pad */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} receiveShadow>
            <planeGeometry args={[50, 50]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.8} metalness={0.3} />
          </mesh>
          
          {/* Enhanced launch tower */}
          <group position={[3, 0, 0]}>
            {/* Main tower structure */}
            <mesh position={[0, 7.5, 0]} castShadow>
              <boxGeometry args={[2, 15, 2]} />
              <meshStandardMaterial color="#475569" roughness={0.6} metalness={0.7} />
            </mesh>
            {/* Tower arm */}
            <mesh position={[0, 12, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
              <boxGeometry args={[8, 0.5, 0.5]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.4} metalness={0.8} />
            </mesh>
            {/* Tower base */}
            <mesh position={[0, 0.5, 0]} castShadow>
              <cylinderGeometry args={[3, 3, 1, 32]} />
              <meshStandardMaterial color="#334155" roughness={0.8} metalness={0.5} />
            </mesh>
          </group>
          
          {/* Runway */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, -100]} receiveShadow>
            <planeGeometry args={[30, 500]} />
            <meshStandardMaterial color="#1e293b" roughness={0.9} />
          </mesh>
          
          {/* Runway markings */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, -100]} receiveShadow>
            <planeGeometry args={[2, 400]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
        </group>
      )}

      {/* Clouds for realism */}
      {altitude < 20000 && (
        <>
          <Cloud opacity={0.6} speed={0.4} position={[50, 50, 50]} />
          <Cloud opacity={0.5} speed={0.3} position={[-30, 40, -40]} />
          <Cloud opacity={0.4} speed={0.5} position={[20, 60, -60]} />
        </>
      )}

      {/* Spherical Earth (Curvature) visible at high alt */}
      {altitude > 1000 && (
        <mesh position={[0, groundY - earthRadius - 10, 0]}>
          <sphereGeometry args={[earthRadius, 64, 64]} />
          <meshStandardMaterial color='#024B7A' roughness={0.8} metalness={0.2} />
        </mesh>
      )}
    </group>
  );
}

export default function S7_3DTelemetry({ isEmbedded }: { isEmbedded?: boolean }) {
  const dispatch = useAppDispatch();
  const telemetry = useAppSelector(s => s.telemetry);
  const activeRocket = useAppSelector(s => s.rocket.activeRocket);

  const [cadUrl, setCadUrl] = useState<string | null>(null);

  useEffect(() => {
    if (activeRocket?.id) {
      // Endpoint mapping from Airframe rendering
      setCadUrl(`/api/v1/templates/${activeRocket.id}/cad`);
    } else {
      setCadUrl(null);
    }
  }, [activeRocket?.id]);

  useEffect(() => {
    dispatch(resetTelemetry());
    const wsUrl = `${import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080'}/ws/telemetry`;
    connectTelemetry(wsUrl, store);
    return () => {
      disconnectTelemetry();
    };
  }, [dispatch]);

  const { pitch, yaw, roll } = telemetry.attitude;

  return (
    <div className="h-full flex flex-col">
      {!isEmbedded && (
        <header className="mb-4">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">3D Telemetry Viewer</h1>
          <p className="text-slate-400">Live 6-DOF visualization of flight attitude and trajectory stream.</p>
        </header>
      )}

      <div className="flex-1 flex flex-col gap-4">
        {/* 3D View - Reduced height */}
        <div className="h-[60%] bg-black rounded-xl overflow-hidden border border-slate-700/50 relative shadow-[0_0_30px_rgba(0,0,0,0.5)]">
          {/* Overlay HUD */}
          <div className="absolute top-6 left-6 z-10 font-mono text-sm pointer-events-none">
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-750 text-emerald-400 backdrop-blur-md space-y-1 shadow-lg">
              <div className="text-slate-400 text-xs uppercase font-semibold border-b border-slate-800 pb-1 mb-1 tracking-wider">Telemetry HUD</div>
              <div>MACH: <span className="text-white font-bold">{telemetry.mach.toFixed(2)}</span></div>
              <div>ALTITUDE: <span className="text-white font-bold">{telemetry.altitude.toFixed(1)} m</span></div>
              <div>VELOCITY: <span className="text-white font-bold">{telemetry.velocity.toFixed(1)} m/s</span></div>
              <div>PITCH: <span className="text-white font-bold">{pitch.toFixed(2)}°</span></div>
              <div>YAW: <span className="text-white font-bold">{yaw.toFixed(2)}°</span></div>
              <div>ROLL: <span className="text-white font-bold">{roll.toFixed(2)}°</span></div>
            </div>
          </div>

          <div className="absolute top-6 right-6 z-10 pointer-events-none">
            <div className="flex gap-2">
              <span className={clsx(
                "px-3 py-1 border rounded text-xs tracking-widest font-bold font-mono transition-all",
                telemetry.time > 0 
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse" 
                  : "bg-slate-500/20 text-slate-400 border-slate-500/30"
              )}>
                {telemetry.time > 0 ? `STREAMING (T+${telemetry.time.toFixed(1)}s)` : 'STANDBY'}
              </span>
              <span className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-xs tracking-widest font-bold">6-DOF</span>
            </div>
          </div>

          <Canvas camera={{ position: [0, 2, 10], fov: 45 }} shadows>
            <DynamicWorld altitude={telemetry.altitude} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1.5} color="#ffffff" castShadow />
            <Environment preset="city" />
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            
            <Trail width={2} color={'#38bdf8'} length={20} decay={1} local={false}>
              <RocketModel pitch={pitch} yaw={yaw} roll={roll} cadUrl={cadUrl} thrust={telemetry.phase === 'BoostS1' ? 5000 : 0} velocity={telemetry.velocity || 0} />
            </Trail>
            
            <OrbitControls 
              enablePan={true} 
              enableZoom={true} 
              enableRotate={true}
              autoRotate={false}
            />
            
            <EffectComposer>
              <Bloom
                luminanceThreshold={0.2}
                luminanceSmoothing={0.9}
                height={300}
              />
            </EffectComposer>
          </Canvas>
        </div>

        {/* 2D Target Map */}
        <div className="h-[40%] bg-slate-900 rounded-xl overflow-hidden border border-slate-700/50 relative shadow-[0_0_30px_rgba(0,0,0,0.5)]">
          <div className="absolute top-4 left-4 z-10 font-mono text-xs pointer-events-none">
            <div className="bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-750 text-emerald-400 backdrop-blur-md shadow-lg">
              <div className="text-slate-400 text-xs uppercase font-semibold tracking-wider">Target Map</div>
            </div>
          </div>
          <div className="w-full h-full relative bg-gradient-to-br from-green-900 to-green-800">
            {/* Map grid */}
            <svg className="w-full h-full" viewBox="0 0 1000 400">
              {/* Grid lines */}
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              
              {/* Roads */}
              <line x1="500" y1="0" x2="500" y2="400" stroke="#334155" strokeWidth="8" />
              <line x1="0" y1="200" x2="1000" y2="200" stroke="#334155" strokeWidth="8" />
              
              {/* Water */}
              <rect x="700" y="100" width="100" height="200" fill="#0ea5e9" opacity="0.6" />
              
              {/* Launch pad */}
              <circle cx="500" cy="200" r="15" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="2" />
              
              {/* Rocket position */}
              <circle cx={500 + (telemetry.posY || 0) * 0.5} cy={200 - (telemetry.posX || 0) * 0.5} r="8" fill="#ef4444" stroke="#ffffff" strokeWidth="2">
                <animate attributeName="r" values="8;10;8" dur="1s" repeatCount="indefinite" />
              </circle>
              
              {/* Target position (simulated) */}
              <circle cx="700" cy="150" r="10" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
              <text x="700" y="135" fill="#ffffff" fontSize="12" textAnchor="middle" fontFamily="monospace">TARGET</text>
              
              {/* Buildings around target */}
              <rect x="650" y="120" width="20" height="15" fill="#64748b" stroke="#475569" strokeWidth="1" />
              <rect x="680" y="125" width="15" height="20" fill="#64748b" stroke="#475569" strokeWidth="1" />
              <rect x="720" y="115" width="25" height="18" fill="#64748b" stroke="#475569" strokeWidth="1" />
              <rect x="660" y="170" width="18" height="22" fill="#64748b" stroke="#475569" strokeWidth="1" />
              <rect x="690" y="175" width="20" height="15" fill="#64748b" stroke="#475569" strokeWidth="1" />
              <rect x="730" y="165" width="22" height="20" fill="#64748b" stroke="#475569" strokeWidth="1" />
              <rect x="655" y="200" width="15" height="18" fill="#64748b" stroke="#475569" strokeWidth="1" />
              <rect x="685" y="205" width="18" height="15" fill="#64748b" stroke="#475569" strokeWidth="1" />
              <rect x="715" y="195" width="20" height="22" fill="#64748b" stroke="#475569" strokeWidth="1" />
              
              {/* Trees around target */}
              <circle cx="640" cy="140" r="5" fill="#2E7D32" />
              <circle cx="645" cy="145" r="4" fill="#388E3C" />
              <circle cx="750" cy="140" r="5" fill="#2E7D32" />
              <circle cx="745" cy="145" r="4" fill="#388E3C" />
              <circle cx="640" cy="180" r="5" fill="#2E7D32" />
              <circle cx="645" cy="185" r="4" fill="#388E3C" />
              <circle cx="750" cy="180" r="5" fill="#2E7D32" />
              <circle cx="745" cy="185" r="4" fill="#388E3C" />
              <circle cx="670" cy="110" r="5" fill="#2E7D32" />
              <circle cx="675" cy="115" r="4" fill="#388E3C" />
              <circle cx="720" cy="110" r="5" fill="#2E7D32" />
              <circle cx="725" cy="115" r="4" fill="#388E3C" />
              <circle cx="670" cy="220" r="5" fill="#2E7D32" />
              <circle cx="675" cy="225" r="4" fill="#388E3C" />
              <circle cx="720" cy="220" r="5" fill="#2E7D32" />
              <circle cx="725" cy="225" r="4" fill="#388E3C" />
              
              {/* Trajectory line */}
              <line x1="500" y1="200" x2={500 + (telemetry.posY || 0) * 0.5} y2={200 - (telemetry.posX || 0) * 0.5} stroke="#38bdf8" strokeWidth="2" strokeDasharray="5,5" />
              
              {/* Scale indicator */}
              <text x="50" y="380" fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="monospace">Scale: 1 unit = 2m</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
