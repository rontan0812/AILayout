// 間取り図画像から部屋の外形（多角形）と内部の壁・間仕切り（障害物）を抽出する。
// ライブラリを使わず、二値化 → 外側の塗りつぶし → 建物領域 → 粗い格子での占有判定、
// という流れでブラウザ内だけで処理する。細かいノイズ（文字・寸法線・家具記号）は
// 粗い格子に吸収させ、斜め線を作らない大まかな直交形状として読み取る。

import type { NormRect } from "./roomShape";

export type Pt = { x: number; y: number };

export type RoomPlan = {
  contour: Pt[]; // 外形（格子座標の直交多角形）
  walls: NormRect[]; // 内部の壁・間仕切り（外接矩形基準の 0..1 正規化矩形）
};

// RGBA配列をグレースケール(0-255)に変換
function toGray(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const gr = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    g[i] = (r * 299 + gr * 587 + b * 114) / 1000;
  }
  return g;
}

// 大津の二値化しきい値
function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

// 領域(1)の最大4連結成分だけを残したマスクを返す
function largestComponent(region: Uint8Array, w: number, h: number): Uint8Array | null {
  const label = new Int32Array(w * h).fill(-1);
  let best: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!region[s] || label[s] >= 0) continue;
    const comp: number[] = [];
    stack.length = 0;
    stack.push(s);
    label[s] = s;
    while (stack.length) {
      const cur = stack.pop() as number;
      comp.push(cur);
      const x = cur % w;
      const y = (cur - x) / w;
      const nb = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (region[ni] && label[ni] < 0) {
          label[ni] = s;
          stack.push(ni);
        }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  if (best.length === 0) return null;
  const mask = new Uint8Array(w * h);
  for (const i of best) mask[i] = 1;
  return mask;
}

// 画像の外周から open(明るい=室外/室内空間) を伝って「外側(室外)」を塗りつぶす。
function floodExterior(open: Uint8Array, width: number, height: number): Uint8Array {
  const exterior = new Uint8Array(width * height);
  const stack: number[] = [];
  const pushIf = (x: number, y: number) => {
    const i = y * width + x;
    if (open[i] && !exterior[i]) {
      exterior[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    pushIf(x, 0);
    pushIf(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIf(0, y);
    pushIf(width - 1, y);
  }
  while (stack.length) {
    const cur = stack.pop() as number;
    const x = cur % width;
    const y = (cur - x) / width;
    if (x + 1 < width) pushIf(x + 1, y);
    if (x - 1 >= 0) pushIf(x - 1, y);
    if (y + 1 < height) pushIf(x, y + 1);
    if (y - 1 >= 0) pushIf(x, y - 1);
  }
  return exterior;
}

// マスク(セル=1)の境界を格子辺として集め、閉ループ（多角形）に組み立てる。
// bboxが最大のループ（外側境界）を返す。
function traceOuterPolygon(mask: Uint8Array, w: number, h: number): Pt[] | null {
  const vid = (x: number, y: number) => y * (w + 1) + x;
  const adj = new Map<number, number[]>();
  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const a = vid(ax, ay);
    const b = vid(bx, by);
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  const isReg = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue;
      if (!isReg(x, y - 1)) addEdge(x, y, x + 1, y); // 上辺
      if (!isReg(x, y + 1)) addEdge(x, y + 1, x + 1, y + 1); // 下辺
      if (!isReg(x - 1, y)) addEdge(x, y, x, y + 1); // 左辺
      if (!isReg(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1); // 右辺
    }
  }
  if (adj.size === 0) return null;

  const toPt = (id: number): Pt => ({ x: id % (w + 1), y: Math.floor(id / (w + 1)) });

  const usedEdge = new Set<string>();
  const ekey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  let bestLoop: Pt[] | null = null;
  let bestArea = -1;

  for (const startId of adj.keys()) {
    const startNbrs = adj.get(startId)!;
    for (const firstNext of startNbrs) {
      if (usedEdge.has(ekey(startId, firstNext))) continue;
      const loop: number[] = [startId];
      let prev = startId;
      let cur = firstNext;
      usedEdge.add(ekey(startId, firstNext));
      let ok = true;
      while (cur !== startId) {
        loop.push(cur);
        const nbrs = adj.get(cur);
        if (!nbrs) {
          ok = false;
          break;
        }
        let nextId = -1;
        for (const n of nbrs) {
          if (n === prev) continue;
          if (usedEdge.has(ekey(cur, n))) continue;
          nextId = n;
          break;
        }
        if (nextId < 0) {
          ok = false;
          break;
        }
        usedEdge.add(ekey(cur, nextId));
        prev = cur;
        cur = nextId;
        if (loop.length > (w + 1) * (h + 1)) {
          ok = false;
          break;
        }
      }
      if (!ok || loop.length < 4) continue;
      const pts = loop.map(toPt);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const area = (maxX - minX) * (maxY - minY);
      if (area > bestArea) {
        bestArea = area;
        bestLoop = pts;
      }
    }
  }
  return bestLoop;
}

// 連続する同一直線上の点を除去
function dropCollinear(pts: Pt[]): Pt[] {
  const n = pts.length;
  if (n < 3) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > 1e-6) out.push(b);
  }
  return out.length >= 3 ? out : pts;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// 短辺あたりの目標セル数（大きいほど細かい）。ノイズを吸収しつつ形は保つ粗さ。
const SHORT_CELLS = 30;
// セル内の暗い画素の割合がこれを超えたら壁（間仕切り）とみなす。
const WALL_FRAC = 0.16;

// 画像データから部屋の外形と内部の壁を抽出する。失敗時 null。
export function extractRoomPlan(
  data: Uint8ClampedArray,
  width: number,
  height: number
): RoomPlan | null {
  if (width < 8 || height < 8) return null;
  const gray = toGray(data, width, height);
  const thr = otsuThreshold(gray);
  // 明るい(=室内空間/背景)を open、暗い(=壁・線)を wall とする
  const open = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) open[i] = gray[i] > thr ? 1 : 0;

  const exterior = floodExterior(open, width, height);

  // 外側でない画素＝建物（壁＋室内空間）。その最大連結成分を部屋（フットプリント）とみなす。
  const region = new Uint8Array(width * height);
  for (let i = 0; i < region.length; i++) region[i] = exterior[i] ? 0 : 1;
  const mask = largestComponent(region, width, height);
  if (!mask) return null;

  // フットプリントの外接矩形
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let any = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      any = true;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!any) return null;
  const fw = maxX - minX + 1;
  const fh = maxY - minY + 1;
  if (fw < 8 || fh < 8) return null;

  // 粗い格子（列N×行M）を張り、各セルの「内側率」「暗さ率」を集計する。
  const cell = Math.max(4, Math.floor(Math.min(fw, fh) / SHORT_CELLS));
  const N = Math.max(2, Math.round(fw / cell));
  const Mrows = Math.max(2, Math.round(fh / cell));
  const inside = new Int32Array(N * Mrows);
  const dark = new Int32Array(N * Mrows);
  const total = new Int32Array(N * Mrows);
  for (let y = minY; y <= maxY; y++) {
    const gr = Math.min(Mrows - 1, Math.floor(((y - minY) / fh) * Mrows));
    for (let x = minX; x <= maxX; x++) {
      const gc = Math.min(N - 1, Math.floor(((x - minX) / fw) * N));
      const ci = gr * N + gc;
      const idx = y * width + x;
      total[ci]++;
      if (mask[idx]) inside[ci]++;
      if (!open[idx]) dark[ci]++;
    }
  }

  // 内側率0.5以上のセルを占有（部屋）とする → 大まかな直交フットプリント。
  const occ = new Uint8Array(N * Mrows);
  for (let i = 0; i < occ.length; i++) {
    occ[i] = total[i] > 0 && inside[i] / total[i] >= 0.5 ? 1 : 0;
  }
  const occMask = largestComponent(occ, N, Mrows);
  if (!occMask) return null;

  const rawContour = traceOuterPolygon(occMask, N, Mrows);
  if (!rawContour || rawContour.length < 4) return null;
  const contour = dropCollinear(rawContour);

  // 外形の外接矩形（格子座標）。壁矩形の正規化に使う。
  let cminX = Infinity;
  let cminY = Infinity;
  let cmaxX = -Infinity;
  let cmaxY = -Infinity;
  for (const p of contour) {
    if (p.x < cminX) cminX = p.x;
    if (p.y < cminY) cminY = p.y;
    if (p.x > cmaxX) cmaxX = p.x;
    if (p.y > cmaxY) cmaxY = p.y;
  }
  const bw = cmaxX - cminX || 1;
  const bh = cmaxY - cminY || 1;

  // 占有セルのうち暗さ率が高いものを壁（間仕切り）とし、行ごとに水平連結して矩形化。
  const walls: NormRect[] = [];
  for (let r = 0; r < Mrows; r++) {
    let runStart = -1;
    for (let c = 0; c <= N; c++) {
      const ci = r * N + c;
      const isWall =
        c < N && occMask[ci] === 1 && total[ci] > 0 && dark[ci] / total[ci] >= WALL_FRAC;
      if (isWall && runStart < 0) {
        runStart = c;
      } else if (!isWall && runStart >= 0) {
        const x0 = clamp01((runStart - cminX) / bw);
        const y0 = clamp01((r - cminY) / bh);
        const x1 = clamp01((c - cminX) / bw);
        const y1 = clamp01((r + 1 - cminY) / bh);
        if (x1 > x0 && y1 > y0) walls.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        runStart = -1;
      }
    }
  }

  return { contour, walls };
}

// 画素/格子座標の多角形を、外接矩形(0..wCm, 0..dCm)内のcm座標に正規化する。
export function contourToRoomPoints(
  contour: Pt[],
  widthCm: number,
  depthCm: number
): { xCm: number; yCm: number }[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of contour) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  return contour.map((p) => ({
    xCm: ((p.x - minX) / bw) * widthCm,
    yCm: ((p.y - minY) / bh) * depthCm,
  }));
}
