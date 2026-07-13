"use client";

import { useMemo, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { PlacedItem, Opening } from "./RoomCanvas";
import type { PolyPoint } from "./roomShape";
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
  roomPolygon: PolyPoint[];
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

// 部屋のポリゴン（cm・左上原点）を中心原点のワールド座標(m)に変換して床と壁を描く。
function RoomMesh({
  polygon,
  roomWcm,
  roomDcm,
}: {
  polygon: PolyPoint[];
  roomWcm: number;
  roomDcm: number;
}) {
  const wallColor = "#e7e5e4";
  // ワールド座標の頂点 (X, Z)。床は中心原点で描く。
  const pts = polygon.map((p) => ({
    x: (p.xCm - roomWcm / 2) * M,
    z: (p.yCm - roomDcm / 2) * M,
  }));

  // 頂点列の内容が変わったときだけ床ジオメトリを作り直すためのキー
  const polyKey = pts.map((p) => `${p.x.toFixed(4)},${p.z.toFixed(4)}`).join(";");

  // 床（ポリゴン形状）。XY平面のShapeを作り、-90°回転でXZ平面に寝かせる。
  const floorGeom = useMemo(() => {
    const shape = new THREE.Shape();
    pts.forEach((p, i) => {
      // 回転 -90°(X軸) で local(x,y)→world(x,0,-y) となるため y=-z を渡す
      if (i === 0) shape.moveTo(p.x, -p.z);
      else shape.lineTo(p.x, -p.z);
    });
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polyKey]);

  // 壁（各辺に沿った薄い箱）
  const walls = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return null;
    const midX = (p.x + q.x) / 2;
    const midZ = (p.z + q.z) / 2;
    const rotY = -Math.atan2(dz, dx);
    return (
      <mesh key={`wall-${i}`} position={[midX, WALL_HEIGHT / 2, midZ]} rotation={[0, rotY, 0]}>
        <boxGeometry args={[len + WALL_THICK, WALL_HEIGHT, WALL_THICK]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0.45} />
      </mesh>
    );
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={floorGeom}>
        <meshStandardMaterial color="#fafaf9" side={THREE.DoubleSide} />
      </mesh>
      {walls}
    </group>
  );
}

// 色を明暗調整（f<1で暗く、f>1で明るく）。脚や引き出し面の陰影に使う。
function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * f);
  c.g = Math.min(1, c.g * f);
  c.b = Math.min(1, c.b * f);
  return `#${c.getHexString()}`;
}

// 家具モデルを構成する直方体パーツ1個。原点は家具の底面中心、yは上向き。
function Box({
  args,
  pos,
  color,
  opacity,
}: {
  args: [number, number, number];
  pos: [number, number, number];
  color: string;
  opacity: number;
}) {
  return (
    <mesh position={pos}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

type ModelProps = { w: number; d: number; color: string; op: number };

// 天板＋4本脚のテーブル（ダイニング/ロー兼用）。奥行方向(-z)を背面とする。
function TableModel({ w, d, color, op, topH }: ModelProps & { topH: number }) {
  const legC = shade(color, 0.7);
  const topThick = 0.05;
  const lt = 0.05;
  const legH = topH - topThick;
  const lx = w / 2 - lt / 2 - 0.03;
  const lz = d / 2 - lt / 2 - 0.03;
  return (
    <group>
      <Box args={[lt, legH, lt]} pos={[lx, legH / 2, lz]} color={legC} opacity={op} />
      <Box args={[lt, legH, lt]} pos={[-lx, legH / 2, lz]} color={legC} opacity={op} />
      <Box args={[lt, legH, lt]} pos={[lx, legH / 2, -lz]} color={legC} opacity={op} />
      <Box args={[lt, legH, lt]} pos={[-lx, legH / 2, -lz]} color={legC} opacity={op} />
      <Box args={[w, topThick, d]} pos={[0, topH - topThick / 2, 0]} color={color} opacity={op} />
    </group>
  );
}

// 座面＋背もたれ＋4本脚の椅子。-z側を背面とする。
function ChairModel({ w, d, color, op }: ModelProps) {
  const legC = shade(color, 0.6);
  const seatTop = 0.42;
  const seatThick = 0.05;
  const backTop = 0.85;
  const lt = 0.04;
  const legH = seatTop - seatThick;
  const lx = w / 2 - lt / 2 - 0.02;
  const lz = d / 2 - lt / 2 - 0.02;
  return (
    <group>
      <Box args={[lt, legH, lt]} pos={[lx, legH / 2, lz]} color={legC} opacity={op} />
      <Box args={[lt, legH, lt]} pos={[-lx, legH / 2, lz]} color={legC} opacity={op} />
      <Box args={[lt, legH, lt]} pos={[lx, legH / 2, -lz]} color={legC} opacity={op} />
      <Box args={[lt, legH, lt]} pos={[-lx, legH / 2, -lz]} color={legC} opacity={op} />
      <Box args={[w, seatThick, d]} pos={[0, seatTop - seatThick / 2, 0]} color={color} opacity={op} />
      <Box
        args={[w, backTop - seatTop, lt]}
        pos={[0, (seatTop + backTop) / 2, -d / 2 + lt / 2]}
        color={color}
        opacity={op}
      />
    </group>
  );
}

// 座面クッション＋背もたれ＋肘掛けのソファ。-z側を背面とする。
function SofaModel({ w, d, color, op }: ModelProps) {
  const arm = Math.min(0.15, w * 0.15);
  const backT = Math.min(0.15, d * 0.22);
  const baseH = 0.12;
  const seatH = 0.35;
  const backTop = 0.7;
  const armTop = 0.55;
  const cushC = shade(color, 1.08);
  return (
    <group>
      <Box args={[w, baseH, d]} pos={[0, baseH / 2, 0]} color={shade(color, 0.85)} opacity={op} />
      <Box
        args={[w, backTop - baseH, backT]}
        pos={[0, (baseH + backTop) / 2, -d / 2 + backT / 2]}
        color={color}
        opacity={op}
      />
      <Box
        args={[arm, armTop - baseH, d]}
        pos={[w / 2 - arm / 2, (baseH + armTop) / 2, 0]}
        color={color}
        opacity={op}
      />
      <Box
        args={[arm, armTop - baseH, d]}
        pos={[-w / 2 + arm / 2, (baseH + armTop) / 2, 0]}
        color={color}
        opacity={op}
      />
      <Box
        args={[w - 2 * arm, seatH - baseH, d - backT]}
        pos={[0, (baseH + seatH) / 2, backT / 2]}
        color={cushC}
        opacity={op}
      />
    </group>
  );
}

// フレーム＋マットレス＋ヘッドボード＋枕のベッド。-z側（短辺）を頭側とする。
function BedModel({ w, d, color, op }: ModelProps) {
  const headT = Math.min(0.1, d * 0.06);
  const baseH = 0.25;
  const mattH = 0.18;
  const headTop = 0.75;
  const pillowD = Math.min(0.35, d * 0.18);
  return (
    <group>
      <Box args={[w, baseH, d]} pos={[0, baseH / 2, 0]} color={shade(color, 0.7)} opacity={op} />
      <Box
        args={[w - 0.06, mattH, d - headT]}
        pos={[0, baseH + mattH / 2, headT / 2]}
        color={shade(color, 1.12)}
        opacity={op}
      />
      <Box
        args={[w, headTop, headT]}
        pos={[0, headTop / 2, -d / 2 + headT / 2]}
        color={color}
        opacity={op}
      />
      <Box
        args={[w - 0.2, 0.08, pillowD]}
        pos={[0, baseH + mattH + 0.04, -d / 2 + headT + pillowD / 2 + 0.05]}
        color={shade(color, 1.2)}
        opacity={op}
      />
    </group>
  );
}

// 天板＋脚＋背面幕板のデスク。-z側を背面とする。
function DeskModel({ w, d, color, op, topH }: ModelProps & { topH: number }) {
  const legC = shade(color, 0.7);
  const topThick = 0.04;
  const lt = 0.05;
  const legH = topH - topThick;
  const lx = w / 2 - lt / 2 - 0.02;
  const lz = d / 2 - lt / 2 - 0.02;
  return (
    <group>
      <Box args={[lt, legH, lt]} pos={[lx, legH / 2, lz]} color={legC} opacity={op} />
      <Box args={[lt, legH, lt]} pos={[-lx, legH / 2, lz]} color={legC} opacity={op} />
      <Box args={[lt, legH, lt]} pos={[lx, legH / 2, -lz]} color={legC} opacity={op} />
      <Box args={[lt, legH, lt]} pos={[-lx, legH / 2, -lz]} color={legC} opacity={op} />
      <Box args={[w, topThick, d]} pos={[0, topH - topThick / 2, 0]} color={color} opacity={op} />
      <Box
        args={[w - 0.1, legH * 0.6, 0.02]}
        pos={[0, legH * 0.55, -d / 2 + 0.03]}
        color={shade(color, 0.9)}
        opacity={op}
      />
    </group>
  );
}

// 側板・天地・背板・棚板で組んだオープン本棚。
function ShelfModel({ w, d, color, op, height }: ModelProps & { height: number }) {
  const t = 0.03;
  const frame = shade(color, 0.92);
  const innerH = height - 2 * t;
  const shelfCount = Math.max(2, Math.round(height / 0.4));
  const shelves = [];
  for (let k = 1; k <= shelfCount; k++) {
    const y = t + (innerH * k) / (shelfCount + 1);
    shelves.push(
      <Box
        key={`sh-${k}`}
        args={[w - 2 * t, t, d - t]}
        pos={[0, y, t / 2]}
        color={frame}
        opacity={op}
      />
    );
  }
  return (
    <group>
      <Box args={[t, height, d]} pos={[w / 2 - t / 2, height / 2, 0]} color={frame} opacity={op} />
      <Box args={[t, height, d]} pos={[-w / 2 + t / 2, height / 2, 0]} color={frame} opacity={op} />
      <Box args={[w, t, d]} pos={[0, height - t / 2, 0]} color={frame} opacity={op} />
      <Box args={[w, t, d]} pos={[0, t / 2, 0]} color={frame} opacity={op} />
      <Box args={[w, height, t]} pos={[0, height / 2, -d / 2 + t / 2]} color={shade(color, 0.8)} opacity={op} />
      {shelves}
    </group>
  );
}

// 引き出し面と取手で表現したチェスト。+z側を前面とする。
function ChestModel({ w, d, color, op, height }: ModelProps & { height: number }) {
  const drawers = Math.max(2, Math.round(height / 0.25));
  const gap = 0.01;
  const dh = (height - gap * (drawers + 1)) / drawers;
  const handleC = shade(color, 0.55);
  const frontC = shade(color, 1.06);
  const fronts = [];
  for (let k = 0; k < drawers; k++) {
    const y = gap + dh / 2 + k * (dh + gap);
    fronts.push(
      <group key={`dr-${k}`}>
        <Box args={[w - 0.04, dh, 0.02]} pos={[0, y, d / 2]} color={frontC} opacity={op} />
        <Box args={[w * 0.2, 0.02, 0.03]} pos={[0, y, d / 2 + 0.02]} color={handleC} opacity={op} />
      </group>
    );
  }
  return (
    <group>
      <Box args={[w, height, d]} pos={[0, height / 2, 0]} color={color} opacity={op} />
      {fronts}
    </group>
  );
}

// 本体＋扉の合わせ目＋取手のワードローブ。+z側を前面とする。
function WardrobeModel({ w, d, color, op, height }: ModelProps & { height: number }) {
  const handleC = shade(color, 0.55);
  return (
    <group>
      <Box args={[w, height, d]} pos={[0, height / 2, 0]} color={color} opacity={op} />
      <Box args={[0.02, height - 0.04, 0.02]} pos={[0, height / 2, d / 2]} color={shade(color, 0.8)} opacity={op} />
      <Box args={[0.03, 0.18, 0.03]} pos={[-0.06, height / 2, d / 2 + 0.015]} color={handleC} opacity={op} />
      <Box args={[0.03, 0.18, 0.03]} pos={[0.06, height / 2, d / 2 + 0.015]} color={handleC} opacity={op} />
    </group>
  );
}

// 脚付きの低いキャビネットとして描くテレビ台。+z側を前面とする。
function TvStandModel({ w, d, color, op }: ModelProps) {
  const bodyBot = 0.06;
  const bodyTop = 0.42;
  const legC = shade(color, 0.6);
  const lt = 0.04;
  const lx = w / 2 - lt / 2 - 0.02;
  const lz = d / 2 - lt / 2 - 0.02;
  return (
    <group>
      <Box args={[lt, bodyBot, lt]} pos={[lx, bodyBot / 2, lz]} color={legC} opacity={op} />
      <Box args={[lt, bodyBot, lt]} pos={[-lx, bodyBot / 2, lz]} color={legC} opacity={op} />
      <Box args={[lt, bodyBot, lt]} pos={[lx, bodyBot / 2, -lz]} color={legC} opacity={op} />
      <Box args={[lt, bodyBot, lt]} pos={[-lx, bodyBot / 2, -lz]} color={legC} opacity={op} />
      <Box args={[w, bodyTop - bodyBot, d]} pos={[0, (bodyBot + bodyTop) / 2, 0]} color={color} opacity={op} />
      <Box
        args={[0.02, bodyTop - bodyBot - 0.04, 0.02]}
        pos={[0, (bodyBot + bodyTop) / 2, d / 2]}
        color={shade(color, 0.8)}
        opacity={op}
      />
    </group>
  );
}

// 棚口・扉・引き出しなど「前面」を持つ収納家具。前面が壁を向かないよう、
// 接している壁を位置から判定し、前面が必ず部屋の内側を向くように据える。
const FRONT_BEARING = new Set(["本棚", "テレビ台", "チェスト", "ワードローブ"]);

// 家具が最も近い（接している）壁を四隅の余白から判定する。
function backingWall(
  it: PlacedItem,
  roomWcm: number,
  roomDcm: number
): "top" | "bottom" | "left" | "right" {
  const gaps = {
    top: it.yCm,
    bottom: roomDcm - (it.yCm + it.depthCm),
    left: it.xCm,
    right: roomWcm - (it.xCm + it.widthCm),
  };
  let wall: "top" | "bottom" | "left" | "right" = "top";
  for (const w of ["bottom", "left", "right"] as const) {
    if (gaps[w] < gaps[wall]) wall = w;
  }
  return wall;
}

// 種類ごとに適切な立体モデルを選ぶ。未登録は従来どおり直方体で描く。
function FurnitureModel({
  it,
  color,
  op,
  roomWcm,
  roomDcm,
}: {
  it: PlacedItem;
  color: string;
  op: number;
  roomWcm: number;
  roomDcm: number;
}) {
  const w = it.widthCm * M;
  const d = it.depthCm * M;

  // 収納家具は前面(+z)を接壁の反対（部屋の内側）へ向ける。
  // モデルは前面幅=壁と平行な辺、奥行=壁へ突き出す辺として組み、壁ごとに回転させる。
  if (FRONT_BEARING.has(it.type)) {
    const wall = backingWall(it, roomWcm, roomDcm);
    const horizontal = wall === "top" || wall === "bottom";
    const p = { w: horizontal ? w : d, d: horizontal ? d : w, color, op };
    let inner: ReactNode;
    switch (it.type) {
      case "テレビ台":
        inner = <TvStandModel {...p} />;
        break;
      case "チェスト":
        inner = <ChestModel {...p} height={0.8} />;
        break;
      case "ワードローブ":
        inner = <WardrobeModel {...p} height={1.9} />;
        break;
      default:
        inner = <ShelfModel {...p} height={1.6} />;
        break;
    }
    const rotY = { top: 0, bottom: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 }[wall];
    return <group rotation={[0, rotY, 0]}>{inner}</group>;
  }

  const p = { w, d, color, op };
  switch (it.type) {
    case "チェア":
      return <ChairModel {...p} />;
    case "ソファ":
      return <SofaModel {...p} />;
    case "ダイニングテーブル":
      return <TableModel {...p} topH={0.72} />;
    case "ローテーブル":
      return <TableModel {...p} topH={0.38} />;
    case "デスク":
      return <DeskModel {...p} topH={0.72} />;
    case "ベッド":
      return <BedModel {...p} />;
    default: {
      const h = heightForType(it.type);
      return <Box args={[w, h, d]} pos={[0, h / 2, 0]} color={color} opacity={op} />;
    }
  }
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
        const color = it.owned
          ? "#9ca3af"
          : FURNITURE_PALETTE[i % FURNITURE_PALETTE.length].fill;
        const op = it.owned ? 0.6 : 1;
        const px = (it.xCm + it.widthCm / 2 - roomWcm / 2) * M;
        const pz = (it.yCm + it.depthCm / 2 - roomDcm / 2) * M;
        return (
          <group key={it.uid} position={[px, 0, pz]}>
            <FurnitureModel it={it} color={color} op={op} roomWcm={roomWcm} roomDcm={roomDcm} />
          </group>
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

export default function Room3D({
  widthCm,
  depthCm,
  placedItems,
  openings,
  roomPolygon,
}: Room3DProps) {
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
          <RoomMesh polygon={roomPolygon} roomWcm={widthCm} roomDcm={depthCm} />
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
