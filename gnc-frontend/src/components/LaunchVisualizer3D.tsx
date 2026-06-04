import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Sphere, Cone, Line } from '@react-three/drei';
import * as THREE from 'three';

interface LaunchVisualizer3DProps {
  attitudeDegrees: [number, number, number]; // [roll, pitch, yaw]
  targetRangeM: number;
  targetBearingDeg: number;
}

function RocketHeading({ attitudeDegrees }: { attitudeDegrees: [number, number, number] }) {
  const meshRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (meshRef.current) {
      const roll = attitudeDegrees[0];
      const pitch = attitudeDegrees[1];
      const yaw = attitudeDegrees[2];
      
      const q = new THREE.Quaternion();

      // 1. Roll: Rocket nose points +X initially in this component
      // Spin around X axis
      const qRoll = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        roll * (Math.PI / 180)
      );

      // 2. Pitch: Tilt nose from +X towards +Y (Up)
      // Rotation around +Z axis
      const qPitch = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        pitch * (Math.PI / 180)
      );

      // 3. Yaw: Rotate from North (+X) to East (+Z)
      // Negative rotation around +Y axis
      const qYaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        -yaw * (Math.PI / 180)
      );

      // Apply Yaw * Pitch * Roll
      q.multiply(qYaw).multiply(qPitch).multiply(qRoll);
      
      meshRef.current.quaternion.copy(q);
    }
  });

  return (
    <group ref={meshRef}>
      {/* A stylized rocket body pointing along +X (North) */}
      <Cone args={[0.5, 4, 16]} rotation={[0, 0, -Math.PI / 2]} position={[2, 0, 0]}>
        <meshStandardMaterial color="#3b82f6" />
      </Cone>
      {/* Fins */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 0.1]} />
        <meshStandardMaterial color="#1e40af" />
      </mesh>
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[1, 1, 0.1]} />
        <meshStandardMaterial color="#1e40af" />
      </mesh>
    </group>
  );
}

function TargetMarker({ range, bearing }: { range: number; bearing: number }) {
  // Convert bearing to radians. Bearing is clockwise from North (X axis).
  // So East is +Z, South is -X, West is -Z
  const bearingRad = bearing * (Math.PI / 180);
  
  // Scale down the range for visualization (e.g., max distance on screen is 50 units)
  const VISUAL_SCALE = Math.max(1, range / 30);
  const x = (range / VISUAL_SCALE) * Math.cos(bearingRad);
  const z = (range / VISUAL_SCALE) * Math.sin(bearingRad);

  return (
    <group position={[x, 0, z]}>
      <Sphere args={[1, 16, 16]}>
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
      </Sphere>
      <Text position={[0, 2, 0]} fontSize={1.5} color="white" anchorX="center" anchorY="middle">
        Target
      </Text>
      <Text position={[0, -1.5, 0]} fontSize={1} color="#cbd5e1" anchorX="center" anchorY="middle">
        {`${(range / 1000).toFixed(1)} km`}
      </Text>
    </group>
  );
}

export default function LaunchVisualizer3D({ attitudeDegrees, targetRangeM, targetBearingDeg }: LaunchVisualizer3DProps) {
  // Draw a line to the target
  const bearingRad = targetBearingDeg * (Math.PI / 180);
  const VISUAL_SCALE = Math.max(1, targetRangeM / 30);
  const x = (targetRangeM / VISUAL_SCALE) * Math.cos(bearingRad);
  const z = (targetRangeM / VISUAL_SCALE) * Math.sin(bearingRad);

  return (
    <div className="w-full h-80 bg-slate-950 rounded-xl overflow-hidden border border-slate-700/50 relative">
      <Canvas camera={{ position: [-10, 15, 10], fov: 45 }}>
        <color attach="background" args={['#020617']} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 20, 5]} intensity={1.5} color="#e2e8f0" />
        
        {/* Grid floor */}
        <Grid 
          infiniteGrid 
          fadeDistance={100} 
          sectionColor="#334155" 
          cellColor="#1e293b" 
          cellSize={1} 
          sectionSize={10} 
        />
        
        {/* Launch Pad Marker */}
        <Sphere args={[0.5, 16, 16]} position={[0, 0, 0]}>
          <meshStandardMaterial color="#22c55e" />
        </Sphere>
        <Text position={[0, -1.5, 0]} fontSize={1} color="#22c55e" anchorX="center" anchorY="middle">
          Launch Pad
        </Text>

        {/* Rocket */}
        <RocketHeading attitudeDegrees={attitudeDegrees} />

        {/* Target */}
        <TargetMarker range={targetRangeM} bearing={targetBearingDeg} />

        {/* Path Line */}
        <Line 
          points={[[0, 0, 0], [x, 0, z]]} 
          color="#334155" 
          lineWidth={2} 
          dashed 
          dashSize={1} 
          gapSize={0.5} 
        />

        {/* North/East Compass Lines */}
        <Line points={[[0, 0.1, 0], [10, 0.1, 0]]} color="#ef4444" lineWidth={3} /> {/* North = Red */}
        <Text position={[11, 0.5, 0]} fontSize={1} color="#ef4444">N</Text>
        <Line points={[[0, 0.1, 0], [0, 0.1, 10]]} color="#3b82f6" lineWidth={3} /> {/* East = Blue */}
        <Text position={[0, 0.5, 11]} fontSize={1} color="#3b82f6">E</Text>

        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.05} />
      </Canvas>
      <div className="absolute top-2 left-2 pointer-events-none bg-slate-900/80 px-2 py-1 rounded text-xs text-slate-400 font-medium tracking-wide">
        3D LAUNCH VISUALIZER
      </div>
    </div>
  );
}
