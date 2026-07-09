// 方角・採光・照明の共有モデルと補助関数。
// 真上視点2Dの簡易ライティング。角度はコンパス方位（0=北, 90=東, 180=南, 270=西）で扱う。

import type { PlacedItem, Opening } from "./RoomCanvas";
import { pointInPolygon, type PolyPoint, type BlockRect } from "./roomShape";

export type Direction = { label: string; deg: number };

// 「上の壁が向いている方角」の選択肢（8方位）
export const DIRECTIONS: Direction[] = [
  { label: "北", deg: 0 },
  { label: "北東", deg: 45 },
  { label: "東", deg: 90 },
  { label: "南東", deg: 135 },
  { label: "南", deg: 180 },
  { label: "南西", deg: 225 },
  { label: "西", deg: 270 },
  { label: "北西", deg: 315 },
];

// 部屋に設置する照明
export type Light = {
  id: string;
  kind: "ceiling" | "floor"; // 天井灯 / フロアランプ
  xCm: number;
  yCm: number;
};

export const DEFAULT_NORTH_DEG = 0; // 既定: 上の壁が北向き
export const DEFAULT_TIME = 0.5; // 既定: 正午

// 壁（上下左右）が外向きに向いている方角。northDeg=上の壁の方角。
export function wallFacingDeg(
  wall: "top" | "bottom" | "left" | "right",
  northDeg: number
): number {
  const offset =
    wall === "top" ? 0 : wall === "right" ? 90 : wall === "bottom" ? 180 : 270;
  return (((northDeg + offset) % 360) + 360) % 360;
}

// 時間帯 t(0=朝, 0.5=昼, 1=夕) の表示ラベル
export function timeLabel(t: number): string {
  if (t < 0.2) return "早朝";
  if (t < 0.4) return "午前";
  if (t < 0.6) return "正午";
  if (t < 0.8) return "午後";
  return "夕方";
}

// 太陽のコンパス方位（朝=東90°, 昼=南180°, 夕=西270°）
export function sunAzimuthDeg(t: number): number {
  return 90 + Math.min(Math.max(t, 0), 1) * 180;
}

// 時間帯による全体の明るさ係数（昼が最大、朝夕は低め）
export function timeBrightness(t: number): number {
  return 0.35 + 0.65 * Math.sin(Math.PI * Math.min(Math.max(t, 0), 1));
}

const rad = (deg: number) => (deg * Math.PI) / 180;

// 窓の向きによる基礎明るさ（南=明るい, 北=暗い, 東西=中間）
function facingWeight(deg: number): number {
  return 0.35 + 0.65 * (0.5 * (1 + Math.cos(rad(deg - 180))));
}

// 窓の向きと太陽方位の一致度（正対で最大、背面でも空の拡散光で下限あり）
function sunAlignment(facingDeg: number, sunDeg: number): number {
  let diff = Math.abs(((facingDeg - sunDeg) % 360) + 360) % 360;
  if (diff > 180) diff = 360 - diff;
  return 0.3 + 0.7 * Math.max(0, Math.cos(rad(diff)));
}

// 採光マップ（グリッド）。valuesは各セルの明るさ。-1は部屋の外。
export type LightGrid = {
  cols: number;
  rows: number;
  cell: number;
  values: Float32Array; // 部屋内: 0〜約1.3 / 部屋外: -1
};

type Rect = { xCm: number; yCm: number; widthCm: number; depthCm: number };
const inRect = (r: Rect, x: number, y: number) =>
  x >= r.xCm && x <= r.xCm + r.widthCm && y >= r.yCm && y <= r.yCm + r.depthCm;

// 窓・方角・時間帯・家具の影から、部屋の採光マップを計算する。
export function computeLightGrid(params: {
  roomW: number;
  roomD: number;
  polygon: PolyPoint[];
  blockedRects: BlockRect[];
  openings: Opening[];
  items: PlacedItem[];
  northDeg: number;
  timeOfDay: number;
  lights?: Light[];
}): LightGrid {
  const { roomW: W, roomD: D, polygon, blockedRects, openings, items } = params;
  const t = params.timeOfDay;
  const lights = params.lights ?? [];
  const cell = Math.max(8, Math.round(Math.min(W, D) / 40));
  const cols = Math.max(1, Math.ceil(W / cell));
  const rows = Math.max(1, Math.ceil(D / cell));
  const values = new Float32Array(cols * rows);

  if (!(W > 0) || !(D > 0)) {
    values.fill(-1);
    return { cols, rows, cell, values };
  }

  const tb = timeBrightness(t);
  const sunDeg = sunAzimuthDeg(t);
  const ambient = 0.08 * tb;
  const att = 0.6 * Math.max(W, D);

  const windows = openings
    .filter((o) => o.kind === "window")
    .map((o) => {
      const horizontal = o.wall === "top" || o.wall === "bottom";
      const wallLen = horizontal ? W : D;
      const half = o.widthCm / 2;
      const center = Math.min(Math.max(o.offsetCm, half), wallLen - half);
      const brightness =
        facingWeight(wallFacingDeg(o.wall, params.northDeg)) *
        tb *
        sunAlignment(wallFacingDeg(o.wall, params.northDeg), sunDeg);
      return { op: o, horizontal, start: center - half, end: center + half, brightness };
    });

  // 線分(ax,ay)-(bx,by)が家具に遮られるか（端点付近は除外）
  const blockedByFurniture = (ax: number, ay: number, bx: number, by: number) => {
    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(2, Math.ceil(dist / (cell / 2)));
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      const px = ax + (bx - ax) * f;
      const py = ay + (by - ay) * f;
      for (const it of items) {
        if (inRect(it, px, py)) return true;
      }
    }
    return false;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cell;
      const y = (r + 0.5) * cell;
      if (!pointInPolygon(polygon, x, y) || blockedRects.some((b) => inRect(b, x, y))) {
        values[r * cols + c] = -1;
        continue;
      }
      const underFurniture = items.some((it) => inRect(it, x, y));

      let light = ambient;

      // 自然光（窓ごと）
      for (const win of windows) {
        let alongDist: number;
        let lateralPos: number;
        let wpx: number;
        let wpy: number;
        const clampLat = Math.min(Math.max(win.horizontal ? x : y, win.start), win.end);
        if (win.op.wall === "top") {
          alongDist = y;
          lateralPos = x;
          wpx = clampLat;
          wpy = 0;
        } else if (win.op.wall === "bottom") {
          alongDist = D - y;
          lateralPos = x;
          wpx = clampLat;
          wpy = D;
        } else if (win.op.wall === "left") {
          alongDist = x;
          lateralPos = y;
          wpx = 0;
          wpy = clampLat;
        } else {
          alongDist = W - x;
          lateralPos = y;
          wpx = W;
          wpy = clampLat;
        }
        if (alongDist < 0) continue;
        const lateralOver = Math.abs(lateralPos - clampLat);
        const lateralFall = Math.max(0, 1 - lateralOver / (alongDist + cell));
        if (lateralFall <= 0) continue;
        const distFromWin = Math.hypot(alongDist, lateralOver);
        const distAtten = 1 / (1 + distFromWin / att);
        const shadow =
          underFurniture || blockedByFurniture(wpx, wpy, x, y) ? 0.3 : 1;
        light += win.brightness * distAtten * lateralFall * shadow;
      }

      // 人工照明（天井灯=遮蔽なし / フロアランプ=家具で遮蔽）
      for (const lm of lights) {
        const d = Math.hypot(x - lm.xCm, y - lm.yCm);
        if (lm.kind === "ceiling") {
          light += 0.85 / (1 + (d / 200) ** 2);
        } else {
          const shadow = blockedByFurniture(lm.xCm, lm.yCm, x, y) ? 0.35 : 1;
          light += (0.6 / (1 + (d / 120) ** 2)) * shadow;
        }
      }

      values[r * cols + c] = Math.min(1.3, light);
    }
  }

  return { cols, rows, cell, values };
}

// 明るさ(0〜約1.3)をヒートマップ色に変換する（暗い=紺, 明るい=淡い黄）
export function lightColor(v: number): string {
  const n = Math.min(1, Math.max(0, v / 1.1));
  // 3色補間: 紺(#334155) → 橙(#f59e0b) → 淡黄(#fef3c7)
  const stops: [number, [number, number, number]][] = [
    [0, [51, 65, 85]],
    [0.5, [245, 158, 11]],
    [1, [254, 243, 199]],
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (n >= stops[i][0] && n <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const f = (n - lo[0]) / span;
  const ch = (a: number, b: number) => Math.round(a + (b - a) * f);
  return `rgb(${ch(lo[1][0], hi[1][0])},${ch(lo[1][1], hi[1][1])},${ch(lo[1][2], hi[1][2])})`;
}

// 採光マップ上の座標(cm)の明るさを取得（部屋外は-1）
export function sampleLight(grid: LightGrid, xCm: number, yCm: number): number {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor(xCm / grid.cell)));
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor(yCm / grid.cell)));
  return grid.values[r * grid.cols + c];
}
