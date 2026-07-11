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
// アフィニティ/対面の相手（アンカー）は必ずサテライトより先に置かれるよう優先度を高くする。
// 例: デスク(70) は本棚(68) より先。ソファ(90) はテレビ台(65) より先。
const PLACE_PRIORITY: Record<string, number> = {
  ベッド: 100,
  ソファ: 90,
  ワードローブ: 88,
  デスク: 70,
  本棚: 68,
  テレビ台: 65,
  チェスト: 60,
  ダイニングテーブル: 50,
  ローテーブル: 20,
  チェア: 15,
};
const priorityOf = (t: string) => PLACE_PRIORITY[t] ?? 40;

// 強アフィニティ: 壁付けより「相手の隣」を優先する（相手中心への距離でスコア）。
const HARD_AFFINITY: Record<string, string[]> = {
  チェア: ["ダイニングテーブル", "デスク"],
  ローテーブル: ["ソファ"],
};
// 弱アフィニティ: 壁付けは保ちつつ、相手に近い壁位置を優先する。
const SOFT_AFFINITY: Record<string, string[]> = {
  本棚: ["デスク"],
  チェスト: ["ベッド"],
};
// 対面: 相手（ソファ）の反対側の壁に、相手の中心軸へ揃えて置く。
const FACING: Record<string, string> = {
  テレビ台: "ソファ",
};
// 弱アフィニティで相手へ寄せる強さ（壁付けを崩さない程度）
const SOFT_AFFINITY_WEIGHT = 0.4;
// 部屋全体を使うための分散の強さ（壁沿いの中で既存家具から離れた位置を優先）
const SPREAD_WEIGHT = 40;
// ドアから室内へ延びる通路帯の深さ（cm）。ハードなクリアランス(60cm)より奥まで、
// 家具が掛からないよう「導線」を確保する（掛かってもソフトに避けるだけで禁止しない）。
const DOOR_LANE_CM = 140;
// 導線帯に掛かるときのソフトペナルティ（窓塞ぎ1000より軽い）
const DOOR_LANE_PENALTY = 300;
// ドアから遠い壁へ寄せたい種類（就寝スペースは入口から離す）
const DOOR_AVERSE = new Set<string>(["ベッド"]);
// ドア回避の強さ（壁付けの中で入口から遠い位置を優先）
const DOOR_AVERSE_WEIGHT = 120;

function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return !(
    a.xCm + a.widthCm + gap <= b.xCm ||
    a.xCm >= b.xCm + b.widthCm + gap ||
    a.yCm + a.depthCm + gap <= b.yCm ||
    a.yCm >= b.yCm + b.depthCm + gap
  );
}

// 決定的な擬似乱数（別案生成のばらつき用）
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
  seed?: number; // >0で別案（配置のばらつき）を生成する
}): AutoLayoutResult {
  const { roomW: W, roomD: D, polygon, blockedRects, openings, ownedItems } = params;
  const gap = params.gapCm ?? 6;
  const seed = params.seed ?? 0;
  const vary = seed > 0;
  const rng = mulberry32(seed);
  // 別案ごとに家具を寄せる基準コーナーを変える
  const corners: [number, number][] = [
    [0, 0],
    [W, 0],
    [W, D],
    [0, D],
  ];
  const prefCorner = corners[seed % 4];

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

  // ドア前の導線帯（ソフト回避）と、ドア回避用のドア中心点
  const doors = openings.filter((o) => o.kind === "door");
  const doorLanes: Rect[] = doors.map((o) => openingFrontRect(o, W, D, DOOR_LANE_CM));
  const doorPoints: { x: number; y: number }[] = doors.map((o) => {
    const wallLen = o.wall === "top" || o.wall === "bottom" ? W : D;
    const c = Math.min(Math.max(o.offsetCm, o.widthCm / 2), wallLen - o.widthCm / 2);
    if (o.wall === "top") return { x: c, y: 0 };
    if (o.wall === "bottom") return { x: c, y: D };
    if (o.wall === "left") return { x: 0, y: c };
    return { x: W, y: c };
  });

  // 既に置かれている家具（所有品）は避ける。生成物もここに足していく。
  // アフィニティ判定に使うため種類も保持する。
  const occupied: (Rect & { type: string })[] = ownedItems.map((o) => ({
    xCm: o.xCm,
    yCm: o.yCm,
    widthCm: o.widthCm,
    depthCm: o.depthCm,
    type: o.type,
  }));

  // 個々のインスタンスへ展開し、優先度→大きい順に並べる。
  // affinity/facing は種類の既定から決めるが、個別に上書きできる（椅子のデスク割当など）。
  type Instance = {
    type: string;
    w: number;
    d: number;
    hardAff?: string[]; // 強アフィニティ（相手の隣）
    softAff?: string[]; // 弱アフィニティ（相手に近い壁）
    facing?: string; // 対面（相手の反対壁）
  };
  const instances: Instance[] = [];
  for (const r of params.requests) {
    for (let i = 0; i < r.count; i++) {
      instances.push({
        type: r.type,
        w: r.widthCm,
        d: r.depthCm,
        hardAff: HARD_AFFINITY[r.type],
        softAff: SOFT_AFFINITY[r.type],
        facing: FACING[r.type],
      });
    }
  }

  // チェア割当: デスクがある場合、椅子を1脚だけデスク用に確保する
  // （残りはダイニングテーブル優先）。
  const hasDesk =
    params.requests.some((r) => r.type === "デスク") ||
    ownedItems.some((o) => o.type === "デスク");
  const hasTable =
    params.requests.some((r) => r.type === "ダイニングテーブル") ||
    ownedItems.some((o) => o.type === "ダイニングテーブル");
  if (hasDesk) {
    const deskChair = instances.find((i) => i.type === "チェア");
    if (deskChair) deskChair.hardAff = ["デスク"];
    // ダイニングテーブルがあるなら、残りの椅子はテーブルのみを相手にする
    if (hasTable) {
      for (const i of instances) {
        if (i.type === "チェア" && i !== deskChair) i.hardAff = ["ダイニングテーブル"];
      }
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

    // 配置モードを決める（優先: 強アフィニティ > 対面 > 弱アフィニティ > 分散）。
    // 相手がまだ置かれていない場合は壁沿い＋分散にフォールバックする。
    const hardAnchors = inst.hardAff
      ? occupied.filter((o) => inst.hardAff!.includes(o.type))
      : [];
    const softAnchors = inst.softAff
      ? occupied.filter((o) => inst.softAff!.includes(o.type))
      : [];
    const facingAnchor = inst.facing
      ? occupied.find((o) => o.type === inst.facing) ?? null
      : null;

    const useHard = hardAnchors.length > 0;
    const useFacing = !useHard && facingAnchor !== null;
    const useSoft = !useHard && !useFacing && softAnchors.length > 0;

    // 対面の相手（ソファ等）が接している壁から、置くべき反対壁と揃える中心軸を求める
    let facingWall: "top" | "bottom" | "left" | "right" | null = null;
    let facingAlign = 0;
    if (useFacing && facingAnchor) {
      const s = facingAnchor;
      const scx = s.xCm + s.widthCm / 2;
      const scy = s.yCm + s.depthCm / 2;
      // ソファは長辺が沿う壁を背にする、と判定する（隅でも安定する）。
      // 長辺が水平→上下壁を背に、垂直→左右壁を背に。近い方の壁を背とし、TVは反対壁へ。
      if (s.widthCm >= s.depthCm) {
        const backTop = s.yCm <= D - (s.yCm + s.depthCm);
        facingWall = backTop ? "bottom" : "top";
        facingAlign = scx;
      } else {
        const backLeft = s.xCm <= W - (s.xCm + s.widthCm);
        facingWall = backLeft ? "right" : "left";
        facingAlign = scy;
      }
    }

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

          // 共通ペナルティ: 窓前を塞がない＋ドア前の導線を空ける
          let penalty = 0;
          for (const wf of windowFronts) {
            if (rectsOverlap(rect, wf)) penalty += 1000;
          }
          for (const lane of doorLanes) {
            if (rectsOverlap(rect, lane)) penalty += DOOR_LANE_PENALTY;
          }
          // スコア（小さいほど良い）。モード別:
          // - 強アフィニティ: 相手の中心に近いほど良い（壁は不問）
          // - 対面: 相手の反対壁に接し、相手の中心軸に揃うほど良い
          // - 弱アフィニティ: 壁沿い＋相手に近いほど良い
          // - 分散(プレーン): 壁沿い＋既存家具から遠いほど良い（部屋全体を使う）
          const cx = x + iw / 2;
          const cy = y + id / 2;
          const tieBreak = y * 0.01 + x * 0.001;
          let score: number;
          if (useHard) {
            let nearest = Infinity;
            for (const a of hardAnchors) {
              const ax = a.xCm + a.widthCm / 2;
              const ay = a.yCm + a.depthCm / 2;
              nearest = Math.min(nearest, Math.abs(cx - ax) + Math.abs(cy - ay));
            }
            score = nearest + penalty + tieBreak;
          } else if (useFacing) {
            let tx: number;
            let ty: number;
            if (facingWall === "bottom") {
              tx = facingAlign;
              ty = D - id / 2;
            } else if (facingWall === "top") {
              tx = facingAlign;
              ty = id / 2;
            } else if (facingWall === "right") {
              tx = W - iw / 2;
              ty = facingAlign;
            } else {
              tx = iw / 2;
              ty = facingAlign;
            }
            score = Math.abs(cx - tx) + Math.abs(cy - ty) + penalty + tieBreak;
          } else if (useSoft) {
            const wallDist = Math.min(x, y, W - (x + iw), D - (y + id));
            let nearest = Infinity;
            for (const a of softAnchors) {
              const ax = a.xCm + a.widthCm / 2;
              const ay = a.yCm + a.depthCm / 2;
              nearest = Math.min(nearest, Math.abs(cx - ax) + Math.abs(cy - ay));
            }
            score = wallDist + penalty + SOFT_AFFINITY_WEIGHT * nearest + tieBreak;
          } else {
            const wallDist = Math.min(x, y, W - (x + iw), D - (y + id));
            // 既存家具から遠いほど良い（分散して部屋全体を使う）
            let spread = 0;
            if (occupied.length > 0) {
              let nearest = Infinity;
              for (const o of occupied) {
                const ax = o.xCm + o.widthCm / 2;
                const ay = o.yCm + o.depthCm / 2;
                nearest = Math.min(nearest, Math.abs(cx - ax) + Math.abs(cy - ay));
              }
              const diag = W + D;
              spread = SPREAD_WEIGHT * (1 - Math.min(nearest, diag) / diag);
            }
            // ドア回避: ベッド等は入口から遠い壁ほど良い
            let doorAverse = 0;
            if (DOOR_AVERSE.has(inst.type) && doorPoints.length > 0) {
              let nearest = Infinity;
              for (const dp of doorPoints) {
                nearest = Math.min(nearest, Math.abs(cx - dp.x) + Math.abs(cy - dp.y));
              }
              const diag = W + D;
              doorAverse = DOOR_AVERSE_WEIGHT * (1 - Math.min(nearest, diag) / diag);
            }
            score = wallDist + penalty + spread + doorAverse + tieBreak;
          }
          if (vary) {
            // 基準コーナーへの寄せ＋微小なゆらぎで別案を作る（壁付けは維持）
            const cornerDist = Math.abs(cx - prefCorner[0]) + Math.abs(cy - prefCorner[1]);
            score += cornerDist * 0.05 + rng() * step;
          }
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
      occupied.push({
        xCm: item.xCm,
        yCm: item.yCm,
        widthCm: item.widthCm,
        depthCm: item.depthCm,
        type: item.type,
      });
    } else {
      unplacedMap.set(inst.type, (unplacedMap.get(inst.type) ?? 0) + 1);
    }
  }

  return {
    items: result,
    unplaced: [...unplacedMap.entries()].map(([type, count]) => ({ type, count })),
  };
}
