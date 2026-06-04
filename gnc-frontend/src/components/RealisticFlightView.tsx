import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment, OrbitControls, Cloud, Sparkles, Sky } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useAppSelector } from '../store/hooks';
import clsx from 'clsx';

// Safely attempts to load CAD, catches errors
class ErrorBoundaryModel extends React.Component<{ url: string | null, rotX: number, rotY: number, rotZ: number }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError || !this.props.url) return <ProceduralRocket />;
    return (
      <React.Suspense fallback={<ProceduralRocket />}>
        <CadRocket url={this.props.url} rotX={this.props.rotX} rotY={this.props.rotY} rotZ={this.props.rotZ} />
      </React.Suspense>
    );
  }
}

function ProceduralRocket() {
  return (
    <group>
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.2, 0.4, 4, 32]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <coneGeometry args={[0.2, 1, 32]} />
        <meshStandardMaterial color="#ef4444" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.5, 0]}>
        <coneGeometry args={[0.3, 1.5, 16]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

function CadRocket({ url, rotX, rotY, rotZ }: { url: string, rotX: number, rotY: number, rotZ: number }) {
  const { scene } = useGLTF(url);
  
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    
    // Center the model in X and Z, but align the BASE (min Y) to Y=0
    // So the rocket sits *on* the ground, not halfway through it!
    const box = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const min = box.min;
    
    // Shift model so bottom is exactly at y=0
    clone.position.set(-center.x, -min.y, -center.z);

    const wrapper = new THREE.Group();
    
    // Apply manual 90-degree rotations
    wrapper.rotation.x = (rotX * Math.PI) / 2;
    wrapper.rotation.y = (rotY * Math.PI) / 2;
    wrapper.rotation.z = (rotZ * Math.PI) / 2;
    
    wrapper.add(clone);
    return wrapper;
  }, [scene, rotX, rotY, rotZ]);

  return <primitive object={clonedScene} />;
}

interface RocketProps {
  pitch: number;
  yaw: number;
  roll: number;
  altitude: number;
  posX: number;
  posY: number;
  launchAlt: number;
  cadUrl: string | null;
  rotX: number;
  rotY: number;
  rotZ: number;
  alignMode: 'velocity' | 'attitude';
  showArrows: boolean;
}

// ---------------------------------------------------------------------------
// Procedural Generation & Math Helpers
// ---------------------------------------------------------------------------

// Simple circular canvas texture for soft particles
const circleTexture = (() => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
  }
  return new THREE.CanvasTexture(canvas);
})();

// Noise and fBm for terrain
const noise2D = (x: number, y: number) => {
  const hash = (p: number) => {
    const s = Math.sin(p) * 43758.5453;
    return s - Math.floor(s);
  };
  const getVal = (ix: number, iy: number) => {
    return hash(ix * 127.1 + iy * 311.7);
  };
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);
  const a = getVal(ix, iy);
  const b = getVal(ix + 1, iy);
  const c = getVal(ix, iy + 1);
  const d = getVal(ix + 1, iy + 1);
  return a * (1 - ux) * (1 - uy) +
         b * ux * (1 - uy) +
         c * (1 - ux) * uy +
         d * ux * uy;
};

const fbm = (x: number, y: number, octaves = 4) => {
  let value = 0.0;
  let amplitude = 1.0;
  let frequency = 1.0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, y * frequency);
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value;
};

const getTerrainHeight = (x: number, z: number) => {
  const dist = Math.sqrt(x * x + z * z);
  if (dist < 300) return 0; // Perfectly flat launch area
  
  // Height map based on fBm
  let height = (fbm(x * 0.0003 + 0.5, z * 0.0003 + 0.5) - 0.4) * 600;
  
  // Smooth transition from flat launch pad
  const factor = Math.max(0, dist / 300);
  height *= Math.min(1.0, factor * factor);
  return height;
};

// ---------------------------------------------------------------------------
// World Objects
// ---------------------------------------------------------------------------

function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(10000, 10000, 128, 128);
    const pos = geo.attributes.position;
    const colors = [];
    
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const h = getTerrainHeight(x, y);
      pos.setZ(i, h);
      
      // Multi-color shading based on height
      const color = new THREE.Color();
      if (h < 5) {
        color.setHSL(0.33, 0.4, 0.2 + (h + 5) * 0.003); // grassy green
      } else if (h < 150) {
        color.setHSL(0.08, 0.3, 0.22 + (h - 5) * 0.001); // rock / soil
      } else {
        color.setRGB(0.92, 0.92, 0.92); // snow peak
      }
      colors.push(color.r, color.g, color.b);
    }
    
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors={true} roughness={0.9} metalness={0.05} flatShading />
    </mesh>
  );
}

function Tree({ position, scale }: { position: [number, number, number]; scale: number }) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* Trunk */}
      <mesh position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.35, 2, 8]} />
        <meshStandardMaterial color="#4E342E" roughness={0.9} />
      </mesh>
      {/* Foliage */}
      <mesh position={[0, 2.8, 0]} castShadow>
        <coneGeometry args={[1.2, 2.4, 8]} />
        <meshStandardMaterial color="#1B5E20" roughness={0.8} />
      </mesh>
      <mesh position={[0, 3.8, 0]} castShadow>
        <coneGeometry args={[0.9, 2.0, 8]} />
        <meshStandardMaterial color="#2E7D32" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Mountain({ position, scale, height }: { position: [number, number, number]; scale: number; height: number }) {
  return (
    <mesh position={position} scale={[scale, height, scale]} castShadow receiveShadow>
      <coneGeometry args={[1, 1, 32]} />
      <meshStandardMaterial color="#3E2723" roughness={0.95} metalness={0.05} />
    </mesh>
  );
}

function Building({ position, width, depth, height }: { position: [number, number, number]; width: number; depth: number; height: number }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial color="#334155" roughness={0.7} metalness={0.4} />
    </mesh>
  );
}

function Road({ position, width, length, rotation }: { position: [number, number, number]; width: number; length: number; rotation: number }) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, rotation]} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial color="#1e293b" roughness={0.95} />
    </mesh>
  );
}

function Water({ position, width, length }: { position: [number, number, number]; width: number; length: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshStandardMaterial color="#0284c7" roughness={0.2} metalness={0.6} transparent opacity={0.85} />
    </mesh>
  );
}

// 3D Points-based Exhaust Plume Component (Volumetric Fire + Smoke)
function ExhaustPlume({ thrust, velocity }: { thrust: number; velocity: number }) {
  const fireCount = 180;
  const smokeCount = 250;
  
  const fireRef = useRef<THREE.Points>(null);
  const smokeRef = useRef<THREE.Points>(null);

  const [fireData, smokeData] = useMemo(() => {
    const firePos = new Float32Array(fireCount * 3);
    const fireVels = new Float32Array(fireCount * 3);
    const fireAges = new Float32Array(fireCount);

    const smokePos = new Float32Array(smokeCount * 3);
    const smokeVels = new Float32Array(smokeCount * 3);
    const smokeAges = new Float32Array(smokeCount);

    for (let i = 0; i < fireCount; i++) {
      fireAges[i] = Math.random();
    }
    for (let i = 0; i < smokeCount; i++) {
      smokeAges[i] = Math.random();
    }

    return [
      { pos: firePos, vels: fireVels, ages: fireAges },
      { pos: smokePos, vels: smokeVels, ages: smokeAges }
    ];
  }, []);

  useFrame((state, delta) => {
    const active = thrust > 10;
    const speedScale = Math.min(2.0, 0.4 + velocity * 0.005);
    
    // 1. Update Fire (High velocity, fading fast)
    if (fireRef.current) {
      const geo = fireRef.current.geometry;
      const posAttr = geo.attributes.position;
      
      for (let i = 0; i < fireCount; i++) {
        fireData.ages[i] += delta * 5.0; // very fast life cycle
        if (fireData.ages[i] > 1.0 || !active) {
          if (active) {
            fireData.ages[i] = 0;
            posAttr.setXYZ(i, (Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08);
            fireData.vels[i*3] = (Math.random() - 0.5) * 0.4;
            fireData.vels[i*3+1] = -4 - Math.random() * 5; // local tailwards direction
            fireData.vels[i*3+2] = (Math.random() - 0.5) * 0.4;
          } else {
            posAttr.setXYZ(i, 9999, 9999, 9999);
          }
        } else {
          const px = posAttr.getX(i) + fireData.vels[i*3] * delta * speedScale;
          const py = posAttr.getY(i) + fireData.vels[i*3+1] * delta * speedScale;
          const pz = posAttr.getZ(i) + fireData.vels[i*3+2] * delta * speedScale;
          posAttr.setXYZ(i, px, py, pz);
        }
      }
      posAttr.needsUpdate = true;
    }

    // 2. Update Smoke (Broad dispersion, slow drift)
    if (smokeRef.current) {
      const geo = smokeRef.current.geometry;
      const posAttr = geo.attributes.position;
      
      for (let i = 0; i < smokeCount; i++) {
        smokeData.ages[i] += delta * 1.2;
        if (smokeData.ages[i] > 1.0 || !active) {
          if (active) {
            smokeData.ages[i] = 0;
            posAttr.setXYZ(i, (Math.random() - 0.5) * 0.15, -0.8, (Math.random() - 0.5) * 0.15);
            smokeData.vels[i*3] = (Math.random() - 0.5) * 1.8;
            smokeData.vels[i*3+1] = -2 - Math.random() * 2;
            smokeData.vels[i*3+2] = (Math.random() - 0.5) * 1.8;
          } else {
            posAttr.setXYZ(i, 9999, 9999, 9999);
          }
        } else {
          const px = posAttr.getX(i) + smokeData.vels[i*3] * delta * speedScale;
          const py = posAttr.getY(i) + smokeData.vels[i*3+1] * delta * speedScale;
          const pz = posAttr.getZ(i) + smokeData.vels[i*3+2] * delta * speedScale;
          posAttr.setXYZ(i, px, py, pz);
        }
      }
      posAttr.needsUpdate = true;
    }
  });

  if (thrust < 10) return null;

  return (
    <group position={[0, -0.2, 0]}>
      {/* Volumetric Fire Points */}
      <points ref={fireRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[fireData.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.65}
          color="#ff4c00"
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          map={circleTexture || undefined}
        />
      </points>
      {/* Volumetric Smoke Points */}
      <points ref={smokeRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[smokeData.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={2.2}
          color="#475569"
          transparent
          opacity={0.25}
          depthWrite={false}
          map={circleTexture || undefined}
        />
      </points>
    </group>
  );
}

function RocketModel({ pitch, yaw, roll, altitude, posX, posY, launchAlt, cadUrl, rotX, rotY, rotZ, alignMode, showArrows }: RocketProps) {
  const groupRef = useRef<THREE.Group>(null);
  
  const lastPosRef = useRef(new THREE.Vector3());
  const velocityDirRef = useRef(new THREE.Vector3(0, 1, 0)); // Default straight up
  const attitudeQuatRef = useRef(new THREE.Quaternion());
  const velocityRef = useRef(0);

  useFrame(() => {
    if (!groupRef.current) return;

    // 1. Calculate World Position
    const groundY = launchAlt - altitude;
    const worldZ = posX;
    const worldX = -posY;
    const currentPos = new THREE.Vector3(worldX, groundY, worldZ);

    // 2. Calculate Velocity Vector based on real world global coordinates
    if (lastPosRef.current.lengthSq() === 0) {
      lastPosRef.current.copy(currentPos);
    } else {
      const globalPos = new THREE.Vector3(posY, altitude - launchAlt, -posX);
      const lastGlobal = new THREE.Vector3(-lastPosRef.current.x, -lastPosRef.current.y, -lastPosRef.current.z);
      
      const realDelta = new THREE.Vector3().subVectors(globalPos, lastGlobal);
      if (realDelta.lengthSq() > 0.0001) {
        velocityDirRef.current.copy(realDelta).normalize();
        velocityRef.current = realDelta.length() * 60; // Approximate velocity (assuming 60fps)
      }
      lastPosRef.current.copy(currentPos);
    }

    // 3. Calculate Attitude Quaternion from telemetry
    const qAtt = new THREE.Quaternion();
    const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -roll * Math.PI / 180);
    // Backend pitch: 90 is vertical UP, 0 is horizontal.
    // Tilt calculation: 90 - 90 = 0 (no X rotation -> points +Y UP).
    // Tilt calculation: 90 - 0 = 90 (rotates 90 deg -> points -Z North).
    const tilt = 90 - pitch;
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -tilt * Math.PI / 180);
    // Backend yaw: 0 is North (-Z), 90 is East (+X)
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw * Math.PI / 180);
    qAtt.multiply(qYaw).multiply(qPitch).multiply(qRoll);
    attitudeQuatRef.current.copy(qAtt);

    // 4. Apply Alignment
    if (alignMode === 'velocity') {
      const up = new THREE.Vector3(0, 1, 0);
      const qVel = new THREE.Quaternion().setFromUnitVectors(up, velocityDirRef.current);
      
      // We apply roll from telemetry so the rocket still spins correctly around its axis
      const finalQ = qVel.clone().multiply(qRoll);
      
      groupRef.current.quaternion.slerp(finalQ, 0.2);
    } else {
      groupRef.current.quaternion.slerp(qAtt, 0.2);
    }
    
    // Add vibration/shake during high thrust
    const thrust = velocityRef.current > 10 ? 5000 : 0; // Simulate thrust based on velocity
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
  });

  return (
    <group>
      <group ref={groupRef} scale={[2, 2, 2]}>
        <ErrorBoundaryModel url={cadUrl} rotX={rotX} rotY={rotY} rotZ={rotZ} />
        <ExhaustPlume thrust={velocityRef.current > 10 ? 5000 : 0} velocity={velocityRef.current} />
      </group>
      
      {/* Aerodynamic Vectors for Engineering Analysis */}
      {showArrows && (
        <group>
          {/* Green: Velocity Vector */}
          <ArrowHelper dir={velocityDirRef.current} color="#10b981" length={8} />
          {/* Red: Attitude Vector */}
          <ArrowHelper dir={new THREE.Vector3(0,1,0).applyQuaternion(attitudeQuatRef.current)} color="#ef4444" length={8} />
        </group>
      )}
    </group>
  );
}

function ArrowHelper({ dir, color, length }: { dir: THREE.Vector3, color: string, length: number }) {
  const ref = useRef<THREE.Group>(null);
  
  useFrame(() => {
    if (ref.current) {
      const up = new THREE.Vector3(0, 1, 0);
      ref.current.quaternion.setFromUnitVectors(up, dir);
    }
  });

  return (
    <group ref={ref}>
      <mesh position={[0, length / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.05, length, 8]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <mesh position={[0, length, 0]}>
        <coneGeometry args={[0.2, 0.6, 8]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </group>
  );
}

function ProfessionalWorld({ altitude, posX, posY, launchAlt }: { altitude: number, posX: number, posY: number, launchAlt: number }) {
  // Professional, clean aerospace visualization environment (STK style)
  const groundY = launchAlt - altitude;
  const worldZ = posX;
  const worldX = -posY;

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
    <group position={[worldX, groundY, worldZ]}>
      
      {/* Procedural multi-colored terrain */}
      <Terrain />
      
      {/* Mountains in the background */}
      {mountains.positions.map((pos, i) => (
        <Mountain 
          key={i}
          position={[pos[0], getTerrainHeight(pos[0], pos[2]) - 5.0, pos[2]]}
          scale={mountains.scales[i]}
          height={mountains.heights[i]}
        />
      ))}
      
      {/* Water bodies */}
      {waterBodies.positions.map((pos, i) => (
        <Water
          key={i}
          position={[pos[0], getTerrainHeight(pos[0], pos[2]) + 0.02, pos[2]]}
          width={waterBodies.widths[i]}
          length={waterBodies.lengths[i]}
        />
      ))}
      
      {/* Road network */}
      {roads.positions.map((pos, i) => (
        <Road
          key={i}
          position={[pos[0], getTerrainHeight(pos[0], pos[2]) + 0.05, pos[2]]}
          width={roads.widths[i]}
          length={roads.lengths[i]}
          rotation={roads.rotations[i]}
        />
      ))}
      
      {/* Buildings */}
      {buildings.positions.map((pos, i) => (
        <Building
          key={i}
          position={[pos[0], getTerrainHeight(pos[0], pos[2]) + buildings.heights[i] / 2, pos[2]]}
          width={buildings.widths[i]}
          depth={buildings.depths[i]}
          height={buildings.heights[i]}
        />
      ))}
      
      {/* Trees scattered around */}
      {trees.positions.map((pos, i) => (
        <Tree 
          key={i}
          position={[pos[0], getTerrainHeight(pos[0], pos[2]), pos[2]]}
          scale={trees.scales[i]}
        />
      ))}
      
      {/* Target site buildings */}
      {targetBuildings.positions.map((pos, i) => (
        <Building
          key={`target-building-${i}`}
          position={[pos[0], getTerrainHeight(pos[0], pos[2]) + targetBuildings.heights[i] / 2, pos[2]]}
          width={targetBuildings.widths[i]}
          depth={targetBuildings.depths[i]}
          height={targetBuildings.heights[i]}
        />
      ))}
      
      {/* Target site trees */}
      {targetTrees.positions.map((pos, i) => (
        <Tree 
          key={`target-tree-${i}`}
          position={[pos[0], getTerrainHeight(pos[0], pos[2]), pos[2]]}
          scale={targetTrees.scales[i]}
        />
      ))}
      
      {/* Professional Grid Lines */}
      <gridHelper args={[100000, 1000, 0x475569, 0x334155]} position={[0, 0.1, 0]} />

      {/* Launch Pad Base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.8} metalness={0.3} />
      </mesh>
      
      {/* Enhanced launch tower */}
      <group position={[3, 0, 0]}>
        <mesh position={[0, 7.5, 0]} castShadow>
          <boxGeometry args={[2, 15, 2]} />
          <meshStandardMaterial color="#475569" roughness={0.6} metalness={0.7} />
        </mesh>
        <mesh position={[0, 12, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
          <boxGeometry args={[8, 0.5, 0.5]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.4} metalness={0.8} />
        </mesh>
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
      
      {/* Reference Axis (North = Z-, East = X+) */}
      <axesHelper args={[100]} position={[0, 0.3, 0]} />
      
      {/* Clouds for realism */}
      {altitude < 20000 && (
        <>
          <Cloud opacity={0.6} speed={0.4} position={[50, 50, 50]} />
          <Cloud opacity={0.5} speed={0.3} position={[-30, 40, -40]} />
          <Cloud opacity={0.4} speed={0.5} position={[20, 60, -60]} />
        </>
      )}

    </group>
  );
}

export default function RealisticFlightView({ 
  launchAlt,
  telemetry
}: { 
  launchAlt: number,
  telemetry: {
    altitude: number,
    posX: number,
    posY: number,
    attitude: { pitch: number, yaw: number, roll: number }
  }
}) {
  const activeRocket = useAppSelector(s => s.rocket.activeRocket);

  const [cadUrl, setCadUrl] = useState<string | null>(null);
  
  // CAD Align
  const [rotX, setRotX] = useState(0);
  const [rotY, setRotY] = useState(0);
  const [rotZ, setRotZ] = useState(0);

  // Professional Engineering Toggles
  const [alignMode, setAlignMode] = useState<'velocity' | 'attitude'>('velocity');
  const [showArrows, setShowArrows] = useState(false);

  useEffect(() => {
    if (activeRocket?.id) {
      setCadUrl(`/api/v1/templates/${activeRocket.id}/cad`);
    } else {
      setCadUrl(null);
    }
  }, [activeRocket?.id]);

  const { pitch, yaw, roll } = telemetry.attitude;

  return (
    <div className="absolute inset-0 z-0 bg-slate-950">
      {/* Clean, dark void background common in aerospace software */}
      <Canvas camera={{ position: [20, 15, 20], fov: 45 }} shadows>
        <fog attach="fog" args={['#0f172a', 200, 8000]} />
        <Sky sunPosition={[500, 1000, 200]} />
        
        <ProfessionalWorld altitude={telemetry.altitude} posX={telemetry.posX} posY={telemetry.posY} launchAlt={launchAlt} />
        
        {/* Realistic crisp lighting */}
        <ambientLight intensity={0.6} color="#e2e8f0" />
        <directionalLight 
          position={[500, 1000, 200]} 
          intensity={1.5} 
          color="#ffffff" 
          castShadow 
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-50}
          shadow-camera-right={50}
          shadow-camera-top={50}
          shadow-camera-bottom={-50}
        />
        
        <Environment preset="city" />
        
        <RocketModel 
          pitch={pitch} yaw={yaw} roll={roll} 
          altitude={telemetry.altitude} posX={telemetry.posX} posY={telemetry.posY} launchAlt={launchAlt}
          cadUrl={cadUrl} 
          rotX={rotX} rotY={rotY} rotZ={rotZ}
          alignMode={alignMode} showArrows={showArrows}
        />
        
        <OrbitControls 
          enablePan={true} 
          enableZoom={true} 
          enableRotate={true}
          autoRotate={false}
          maxPolarAngle={Math.PI / 2}
          target={[0, 10, 0]}
        />
        
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.2}
            luminanceSmoothing={0.9}
            height={300}
          />
          <Vignette eskil={false} offset={0.1} darkness={1.1} />
        </EffectComposer>
      </Canvas>
      
      {/* Professional UI Overlay */}
      <div className="absolute top-4 right-4 z-10 pointer-events-auto flex flex-col gap-3">
        
        <div className="bg-slate-900/95 text-slate-200 p-4 rounded border border-slate-700 shadow-xl flex flex-col gap-3 w-64 select-none font-mono text-sm">
          <div className="font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-2 mb-1">Flight Dynamics</div>
          
          <label className="flex items-center gap-3 cursor-pointer hover:text-white transition-colors">
            <input type="checkbox" checked={alignMode === 'velocity'} onChange={(e) => setAlignMode(e.target.checked ? 'velocity' : 'attitude')} className="form-checkbox bg-slate-800 border-slate-600 rounded text-blue-500" />
            Align to Velocity Vector
          </label>
          
          <label className="flex items-center gap-3 cursor-pointer hover:text-white transition-colors">
            <input type="checkbox" checked={showArrows} onChange={(e) => setShowArrows(e.target.checked)} className="form-checkbox bg-slate-800 border-slate-600 rounded text-blue-500" />
            Show Aero Vectors (AoA)
          </label>
        </div>

        <div className="bg-slate-900/95 text-slate-200 p-4 rounded border border-slate-700 shadow-xl flex flex-col gap-3 w-64 select-none font-mono text-sm">
          <div className="font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-2 mb-1">CAD Offset Calibration</div>
          <div className="flex gap-2">
            <button className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 py-1.5 rounded transition-colors" onClick={() => setRotX(x => (x + 1) % 4)}>X+90°</button>
            <button className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 py-1.5 rounded transition-colors" onClick={() => setRotY(y => (y + 1) % 4)}>Y+90°</button>
            <button className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 py-1.5 rounded transition-colors" onClick={() => setRotZ(z => (z + 1) % 4)}>Z+90°</button>
          </div>
        </div>

      </div>
    </div>
  );
}
