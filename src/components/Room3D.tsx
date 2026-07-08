"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

// cm → m
const M = 0.01;
const WALL_HEIGHT = 1.2; // 壁の高さ(m)。俯瞰しやすいよう低め
const WALL_THICK = 0.04;

type Room3DProps = {
  widthCm: number;
  depthCm: number;
};

function RoomMesh({ w, d }: { w: number; d: number }) {
  const wallColor = "#e7e5e4";
  return (
    <group>
      {/* 床 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#fafaf9" />
      </mesh>
      {/* 4枚の壁（中が見えるよう半透明） */}
      <mesh position={[0, WALL_HEIGHT / 2, -d / 2]}>
        <boxGeometry args={[w, WALL_HEIGHT, WALL_THICK]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0.45} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT / 2, d / 2]}>
        <boxGeometry args={[w, WALL_HEIGHT, WALL_THICK]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0.45} />
      </mesh>
      <mesh position={[-w / 2, WALL_HEIGHT / 2, 0]}>
        <boxGeometry args={[WALL_THICK, WALL_HEIGHT, d]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0.45} />
      </mesh>
      <mesh position={[w / 2, WALL_HEIGHT / 2, 0]}>
        <boxGeometry args={[WALL_THICK, WALL_HEIGHT, d]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

export default function Room3D({ widthCm, depthCm }: Room3DProps) {
  const valid =
    Number.isFinite(widthCm) && Number.isFinite(depthCm) && widthCm > 0 && depthCm > 0;
  const w = (valid ? widthCm : 100) * M;
  const d = (valid ? depthCm : 100) * M;
  const span = Math.max(w, d);

  return (
    <div className="h-[400px] w-full max-w-[700px] overflow-hidden rounded-lg border border-stone-300 bg-white">
      {valid ? (
        <Canvas camera={{ position: [w * 0.9, span * 1.2, d * 1.4], fov: 50 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[5, 10, 5]} intensity={0.8} />
          <RoomMesh w={w} d={d} />
          <OrbitControls target={[0, 0, 0]} />
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center text-stone-400">
          部屋のサイズを入力してください
        </div>
      )}
    </div>
  );
}
