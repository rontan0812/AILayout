// 家具リスト・部屋形状・開口部から、重なり無し・クリアランス回避の
// 家具枠レイアウトを自動生成する（真上視点2D、壁付け優先のヒューリスティック）。

import type { PlacedItem, Opening } from "./RoomCanvas";
import { pointInPolygon, type PolyPoint, type BlockRect } from "./roomShape";
import { doorClearanceRects, openingFrontRect, WINDOW_FRONT_CM } from "./clearance";

export type LayoutRequest = {
  type: string;
  widthCm: number;
  depthCm: number;
  count: number;
};

type Rect = { xCm: number; yCm: number; widthCm: number; depthCm: number };

export type AutoLayoutResult = {
  items: PlacedItem[]; // 生成した家具（所有家具は含めない）
  unplaced: { type: string; count: number }[]; // 置けなかった数
};

// 種類ごとの壁付け優先度（大きい＝先に壁沿いへ配置）。未知は既定値。
const PLACE_PRIORITY: Record<string, number> = {
  ベッド: 100,
  ソファ: 90,
  ワードローブ: 88,
  本棚: 80,
  デスク: 70,
  テレビ台: 65,
  チェスト: 60,
  ダイニングテーブル: 50,
  ローテーブル: 20,
  チェア: 15,
};
const priorityOf = (t: string) => PLACE_PRIORITY[t] ?? 40;

function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return !(
    a.xCm + a.widthCm + gap <= b.xCm ||
    a.xCm >= b.xCm + b.widthCm + gap ||
    a.yCm + a.depthCm + gap <= b.yCm ||
    a.yCm >= b.yCm + b.depthCm + gap
  );
}

function genId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fallthrough
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function autoLayout(params: {
  roomW: number;
  roomD: number;
  polygon: PolyPoint[];
  blockedRects: BlockRect[];
  openings: Opening[];
  ownedItems: PlacedItem[];
  requests: LayoutRequest[];
  gapCm?: number;
}): AutoLayoutResult {
  const { roomW: W, roomD: D, polygon, blockedRects, openings, ownedItems } = params;
  const gap = params.gapCm ?? 6;

  if (!(W > 0) || !(D > 0)) {
    return { items: [], unplaced: params.requests.map((r) => ({ type: r.type, count: r.count })) };
  }

  // 置けない/避けたい領域
  const hardRects: Rect[] = [
    ...doorClearanceRects(openings, W, D),
    ...blockedRects,
  ];
  const windowFronts: Rect[] = openings
    .filter((o) => o.kind === "window")
    .map((o) => openingFrontRect(o, W, D, WINDOW_FRONT_CM));

  // 既に置かれている家具（所有品）は避ける。生成物もここに足していく。
  const occupied: Rect[] = ownedItems.map((o) => ({
    xCm: o.xCm,
    yCm: o.yCm,
    widthCm: o.widthCm,
    depthCm: o.depthCm,
  }));

  // 個々のインスタンスへ展開し、優先度→大きい順に並べる
  const instances: { type: string; w: number; d: number }[] = [];
  for (const r of params.requests) {
    for (let i = 0; i < r.count; i++) {
      instances.push({ type: r.type, w: r.widthCm, d: r.depthCm });
    }
  }
  instances.sort((a, b) => {
    const p = priorityOf(b.type) - priorityOf(a.type);
    if (p !== 0) return p;
    return b.w * b.d - a.w * a.d;
  });

  // 種類ごとの連番（所有品の同種数から続ける）
  const typeCount = new Map<string, number>();
  for (const o of ownedItems) typeCount.set(o.type, (typeCount.get(o.type) ?? 0) + 1);

  const step = Math.max(5, Math.round(Math.min(W, D) / 40));

  // 家具枠が部屋内（ポリゴン内・欠け領域外）に収まっているか
  const insideRoom = (x: number, y: number, iw: number, id: number): boolean => {
    if (x < 0 || y < 0 || x + iw > W + 1e-6 || y + id > D + 1e-6) return false;
    const e = Math.min(2, iw / 2, id / 2);
    const corners = [
      [x + e, y + e],
      [x + iw - e, y + e],
      [x + iw - e, y + id - e],
      [x + e, y + id - e],
      [x + iw / 2, y + id / 2],
    ];
    for (const [cx, cy] of corners) {
      if (!pointInPolygon(polygon, cx, cy)) return false;
    }
    return true;
  };

  const result: PlacedItem[] = [];
  const unplacedMap = new Map<string, number>();

  for (const inst of instances) {
    const orients =
      inst.w === inst.d
        ? [[inst.w, inst.d]]
        : [
            [inst.w, inst.d],
            [inst.d, inst.w],
          ];

    let best: { x: number; y: number; w: number; d: number; score: number } | null = null;

    for (const [iw, id] of orients) {
      if (iw > W || id > D) continue;
      // 壁にぴったり付けられるよう端の候補も含める
      const xs = new Set<number>([0, Math.max(0, W - iw)]);
      for (let x = 0; x <= W - iw + 1e-6; x += step) xs.add(Math.min(x, W - iw));
      const ys = new Set<number>([0, Math.max(0, D - id)]);
      for (let y = 0; y <= D - id + 1e-6; y += step) ys.add(Math.min(y, D - id));

      for (const y of ys) {
        for (const x of xs) {
          if (!insideRoom(x, y, iw, id)) continue;
          const rect: Rect = { xCm: x, yCm: y, widthCm: iw, depthCm: id };
          // 硬い障害物（クリアランス/欠け）とは接触不可
          let blocked = false;
          for (const h of hardRects) {
            if (rectsOverlap(rect, h)) {
              blocked = true;
              break;
            }
          }
          if (blocked) continue;
          // 既存家具とは gap を空ける
          for (const o of occupied) {
            if (rectsOverlap(rect, o, gap)) {
              blocked = true;
              break;
            }
          }
          if (blocked) continue;

          // スコア: 壁に近いほど良い＋窓前は避ける
          const wallDist = Math.min(x, y, W - (x + iw), D - (y + id));
          let windowPen = 0;
          for (const wf of windowFronts) {
            if (rectsOverlap(rect, wf)) {
              windowPen += 1000;
            }
          }
          const score = wallDist + windowPen + y * 0.01 + x * 0.001; // 決定的なタイブレーク
          if (!best || score < best.score) {
            best = { x, y, w: iw, d: id, score };
          }
        }
      }
    }

    if (best) {
      const num = (typeCount.get(inst.type) ?? 0) + 1;
      typeCount.set(inst.type, num);
      const item: PlacedItem = {
        uid: genId(),
        type: inst.type,
        num,
        widthCm: best.w,
        depthCm: best.d,
        xCm: Math.round(best.x),
        yCm: Math.round(best.y),
        owned: false,
      };
      result.push(item);
      occupied.push({ xCm: item.xCm, yCm: item.yCm, widthCm: item.widthCm, depthCm: item.depthCm });
    } else {
      unplacedMap.set(inst.type, (unplacedMap.get(inst.type) ?? 0) + 1);
    }
  }

  return {
    items: result,
    unplaced: [...unplacedMap.entries()].map(([type, count]) => ({ type, count })),
  };
}
