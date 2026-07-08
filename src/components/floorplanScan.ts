// 間取り図画像から部屋の輪郭（多角形）を自動抽出する。
// ライブラリを使わず、二値化 → 外側の塗りつぶし → 最大領域の輪郭トレース →
// 多角形の簡略化、という流れでブラウザ内だけで処理する。

export type Pt = { x: number; y: number };

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

// マスク(セル=1)の境界を格子辺として集め、閉ループ（多角形）に組み立てる。
// 外側境界（bboxが最大のループ）を返す。
function traceOuterPolygon(mask: Uint8Array, w: number, h: number): Pt[] | null {
  const vid = (x: number, y: number) => y * (w + 1) + x;
  // 頂点ごとの隣接（無向辺）。degール2前提で組み立てる。
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

  // 全ループを抽出し、bbox面積が最大のものを外側境界とする
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
        // prev以外で未使用の辺へ進む
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

// Douglas-Peucker（開いた点列用）
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  let maxD = -1;
  let idx = -1;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = rdp(pts.slice(0, idx + 1), eps);
    const right = rdp(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

// 閉ループをDPで簡略化する。始点と、そこから最も遠い点の2箇所で
// ループを2本の開いた線に割ってそれぞれRDPし、つなぎ直す（始終点が同一だとRDPが退化するため）。
function simplifyClosed(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 4) return pts;
  let far = 0;
  let farD = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const half1 = pts.slice(0, far + 1); // 始点 .. far
  const half2 = pts.slice(far).concat([pts[0]]); // far .. 終点 .. 始点
  const s1 = rdp(half1, eps);
  const s2 = rdp(half2, eps);
  return s1.slice(0, -1).concat(s2.slice(0, -1));
}

// 画像データから部屋の輪郭多角形（画素座標）を返す。失敗時 null。
export function extractRoomContour(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Pt[] | null {
  if (width < 4 || height < 4) return null;
  const gray = toGray(data, width, height);
  const thr = otsuThreshold(gray);
  // 明るい(=室内/背景)を open とする
  const open = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) open[i] = gray[i] > thr ? 1 : 0;

  // 画像の外周から open を伝って外側を塗りつぶす
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

  // 外側でない画素＝建物（壁＋室内）。その最大連結成分を部屋とみなす。
  const region = new Uint8Array(width * height);
  for (let i = 0; i < region.length; i++) region[i] = exterior[i] ? 0 : 1;
  const mask = largestComponent(region, width, height);
  if (!mask) return null;

  const raw = traceOuterPolygon(mask, width, height);
  if (!raw || raw.length < 3) return null;

  const eps = Math.max(2, 0.01 * Math.hypot(width, height));
  const simplified = simplifyClosed(dropCollinear(raw), eps);
  const result = dropCollinear(simplified);
  return result.length >= 3 ? result : null;
}

// 画素座標の多角形を、外接矩形(0..wCm, 0..dCm)内のcm座標に正規化する。
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
