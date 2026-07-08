"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { PlacedItem, Opening } from "./RoomCanvas";
import { FURNITURE_PALETTE } from "./furniturePalette";

// cm → m
const M = 0.01;
const WALL_HEIGHT = 1.2; // 壁の高さ(m)。俯瞰しやすいよう低め
const WALL_THICK = 0.04;

type Room3DProps = {
  widthCm: number;
  depthCm: number;
  placedItems: PlacedItem[];
  openings: Opening[];
};

// 家具の種類ごとの高さ(m)。未登録は既定値。
const HEIGHT_BY_TYPE: Record<string, number> = {
  ソファ: 0.4,
  ダイニングテーブル: 0.7,
  ローテーブル: 0.35,
  ベッド: 0.4,
  デスク: 0.7,
  チェア: 0.45,
  本棚: 1.2,
  テレビ台: 0.4,
  チェスト: 0.8,
  ワードローブ: 1.8,
};
const heightForType = (t: string) => HEIGHT_BY_TYPE[t] ?? 0.4;

function RoomMesh({ w, d }: { w: number; d: number }) {
  const wallColor = "#e7e5e4";
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#fafaf9" />
      </mesh>
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

function Furniture3D({
  items,
  roomWcm,
  roomDcm,
}: {
  items: PlacedItem[];
  roomWcm: number;
  roomDcm: number;
}) {
  return (
    <>
      {items.map((it, i) => {
        const h = heightForType(it.type);
        const color = it.owned
          ? "#9ca3af"
          : FURNITURE_PALETTE[i % FURNITURE_PALETTE.length].fill;
        const px = (it.xCm + it.widthCm / 2 - roomWcm / 2) * M;
        const pz = (it.yCm + it.depthCm / 2 - roomDcm / 2) * M;
        return (
          <mesh key={it.uid} position={[px, h / 2, pz]}>
            <boxGeometry args={[it.widthCm * M, h, it.depthCm * M]} />
            <meshStandardMaterial
              color={color}
              transparent={it.owned}
              opacity={it.owned ? 0.6 : 1}
            />
          </mesh>
        );
      })}
    </>
  );
}

function Openings3D({
  openings,
  roomWcm,
  roomDcm,
}: {
  openings: Opening[];
  roomWcm: number;
  roomDcm: number;
}) {
  return (
    <>
      {openings.map((op) => {
        const wallLen = op.wall === "top" || op.wall === "bottom" ? roomWcm : roomDcm;
        const half = op.widthCm / 2;
        const center = Math.min(Math.max(op.offsetCm, half), wallLen - half);
        const isDoor = op.kind === "door";
        const height = isDoor ? 1.0 : 0.4;
        const y = isDoor ? height / 2 : 0.95;
        const color = isDoor ? "#c2410c" : "#0369a1";
        const t = WALL_THICK * 1.4;
        let position: [number, number, number];
        let args: [number, number, number];
        if (op.wall === "top" || op.wall === "bottom") {
          const px = (center - roomWcm / 2) * M;
          const pz = ((op.wall === "top" ? 0 : roomDcm) - roomDcm / 2) * M;
          position = [px, y, pz];
          args = [op.widthCm * M, height, t];
        } else {
          const pz = (center - roomDcm / 2) * M;
          const px = ((op.wall === "left" ? 0 : roomWcm) - roomWcm / 2) * M;
          position = [px, y, pz];
          args = [t, height, op.widthCm * M];
        }
        return (
          <mesh key={op.id} position={position}>
            <boxGeometry args={args} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
    </>
  );
}

export default function Room3D({ widthCm, depthCm, placedItems, openings }: Room3DProps) {
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
          <Furniture3D items={placedItems} roomWcm={widthCm} roomDcm={depthCm} />
          <Openings3D openings={openings} roomWcm={widthCm} roomDcm={depthCm} />
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
