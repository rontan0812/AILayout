import type { PlacedItem, Opening } from "./RoomCanvas";

export type FlowPoint = { xCm: number; yCm: number };

// 動線1本分。points=経路、narrow[i]=その点付近が基準幅未満か、minWidthCm=最小幅。
export type FlowPath = {
  points: FlowPoint[];
  narrow: boolean[];
  minWidthCm: number;
};

// 動線として確保したい最小幅（cm）
export const FLOW_MIN_WIDTH_CM = 60;

// 家具を障害物としたグリッド上で、入口どうしを最短経路で結ぶ生活動線を計算する。
// 入口が2つ以上あるときに、入口を順につなぐ経路を返す。
export function computeFlowPaths(
  roomW: number,
  roomD: number,
  items: PlacedItem[],
  openings: Opening[]
): FlowPath[] {
  const doors = openings.filter((o) => o.kind === "door");
  if (doors.length < 2 || roomW <= 0 || roomD <= 0) return [];

  // グリッド（1辺の最大セル数を抑えるためセルサイズを調整）
  const cell = Math.max(10, Math.ceil(Math.max(roomW, roomD) / 120));
  const cols = Math.max(1, Math.ceil(roomW / cell));
  const rows = Math.max(1, Math.ceil(roomD / cell));
  const idx = (c: number, r: number) => r * cols + c;

  // 家具の占有セルを通行不可にする
  const blocked = new Uint8Array(cols * rows);
  for (const it of items) {
    const c0 = Math.floor(it.xCm / cell);
    const c1 = Math.floor((it.xCm + it.widthCm - 0.001) / cell);
    const r0 = Math.floor(it.yCm / cell);
    const r1 = Math.floor((it.yCm + it.depthCm - 0.001) / cell);
    for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
        blocked[idx(c, r)] = 1;
      }
    }
  }

  // 入口の室内側セル（壁の辺の中心付近）
  const doorCell = (op: Opening) => {
    const wallLen = op.wall === "top" || op.wall === "bottom" ? roomW : roomD;
    const half = op.widthCm / 2;
    const center = Math.min(Math.max(op.offsetCm, half), wallLen - half);
    let cx: number;
    let cy: number;
    if (op.wall === "top") {
      cx = center;
      cy = cell / 2;
    } else if (op.wall === "bottom") {
      cx = center;
      cy = roomD - cell / 2;
    } else if (op.wall === "left") {
      cx = cell / 2;
      cy = center;
    } else {
      cx = roomW - cell / 2;
      cy = center;
    }
    return {
      c: Math.min(cols - 1, Math.max(0, Math.floor(cx / cell))),
      r: Math.min(rows - 1, Math.max(0, Math.floor(cy / cell))),
    };
  };

  // 幅優先探索で最短経路（4近傍）。家具は通れない（始点・終点は許可）。
  const bfs = (
    start: { c: number; r: number },
    goal: { c: number; r: number }
  ): FlowPoint[] | null => {
    const prev = new Int32Array(cols * rows).fill(-1);
    const seen = new Uint8Array(cols * rows);
    const sIdx = idx(start.c, start.r);
    const gIdx = idx(goal.c, goal.r);
    const q: number[] = [sIdx];
    seen[sIdx] = 1;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      if (cur === gIdx) break;
      const cc = cur % cols;
      const cr = (cur - cc) / cols;
      const nb = [
        [cc + 1, cr],
        [cc - 1, cr],
        [cc, cr + 1],
        [cc, cr - 1],
      ];
      for (const [nc, nr] of nb) {
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = idx(nc, nr);
        if (seen[ni]) continue;
        if (blocked[ni] && ni !== gIdx) continue;
        seen[ni] = 1;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    if (!seen[gIdx]) return null;
    const path: FlowPoint[] = [];
    let cur = gIdx;
    while (cur !== -1) {
      const cc = cur % cols;
      const cr = (cur - cc) / cols;
      path.push({ xCm: (cc + 0.5) * cell, yCm: (cr + 0.5) * cell });
      if (cur === sIdx) break;
      cur = prev[cur];
    }
    path.reverse();
    return path;
  };

  // その座標が室内の空き（家具でも壁外でもない）か
  const isFree = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= roomW || y >= roomD) return false; // 壁の外
    return !blocked[idx(Math.floor(x / cell), Math.floor(y / cell))];
  };
  const maxRay = Math.hypot(roomW, roomD);
  // (x,y)から(dx,dy)方向へ、家具か壁に当たるまでの空き距離(cm)
  const rayDist = (x: number, y: number, dx: number, dy: number) => {
    const step = 5;
    let d = 0;
    while (d < maxRay && isFree(x + dx * (d + step), y + dy * (d + step))) d += step;
    return d;
  };
  // 進行方向に直交する左右の空きスペースの合計 ≈ 動線幅
  const widthAt = (points: FlowPoint[], j: number) => {
    const a = points[Math.max(0, j - 1)];
    const b = points[Math.min(points.length - 1, j + 1)];
    let dx = b.xCm - a.xCm;
    let dy = b.yCm - a.yCm;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const px = -dy; // 直交方向
    const py = dx;
    const p = points[j];
    return rayDist(p.xCm, p.yCm, px, py) + rayDist(p.xCm, p.yCm, -px, -py);
  };

  const paths: FlowPath[] = [];
  for (let i = 0; i < doors.length - 1; i++) {
    const points = bfs(doorCell(doors[i]), doorCell(doors[i + 1]));
    if (points && points.length > 1) {
      const widths = points.map((_, j) => widthAt(points, j));
      const narrow = widths.map((w) => w < FLOW_MIN_WIDTH_CM);
      paths.push({ points, narrow, minWidthCm: Math.min(...widths) });
    }
  }
  return paths;
}
