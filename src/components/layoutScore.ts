// 現在の家具配置を0〜100点で採点し、減点理由と該当家具を返す。
// 真上視点2Dの決定的な評価。判定は既存の計算（動線・クリアランス等）を活用する。

import type { PlacedItem, Opening } from "./RoomCanvas";
import type { FlowPath } from "./flowline";
import { pointInPolygon, type PolyPoint, type BlockRect } from "./roomShape";
import { doorClearanceRects, openingFrontRect, WINDOW_FRONT_CM } from "./clearance";
import { sampleLight, type LightGrid } from "./lighting";

// これ未満を「暗い」とみなす明るさ
const DARK_THRESHOLD = 0.35;

export type Deduction = {
  id: string;
  label: string; // 減点理由（表示用）
  points: number; // 減点（正の値）
  itemUids: string[]; // 該当家具（強調表示用）
};

export type LayoutScore = {
  score: number; // 0〜100
  deductions: Deduction[];
};

// 壁付けが望ましい大型家具
const WALL_AFFINITY = new Set([
  "ベッド",
  "ソファ",
  "ワードローブ",
  "本棚",
  "テレビ台",
  "チェスト",
  "デスク",
]);
const WALL_GAP_LIMIT = 40; // これ以上壁から離れると「浮いている」とみなす(cm)

type Rect = { xCm: number; yCm: number; widthCm: number; depthCm: number };

function overlap(a: Rect, b: Rect, gap = 0): boolean {
  return !(
    a.xCm + a.widthCm + gap <= b.xCm ||
    a.xCm >= b.xCm + b.widthCm + gap ||
    a.yCm + a.depthCm + gap <= b.yCm ||
    a.yCm >= b.yCm + b.depthCm + gap
  );
}

const label = (it: PlacedItem) => `${it.type}${it.num}`;

export function scoreLayout(params: {
  roomW: number;
  roomD: number;
  polygon: PolyPoint[];
  blockedRects: BlockRect[];
  openings: Opening[];
  items: PlacedItem[];
  flowPaths: FlowPath[];
  lightGrid?: LightGrid | null;
}): LayoutScore {
  const { roomW: W, roomD: D, polygon, blockedRects, openings, items, flowPaths, lightGrid } =
    params;
  const deductions: Deduction[] = [];

  if (!(W > 0) || !(D > 0) || items.length === 0) {
    return { score: items.length === 0 ? 100 : 0, deductions };
  }

  const add = (id: string, lbl: string, points: number, itemUids: string[]) => {
    if (points > 0) deductions.push({ id, label: lbl, points, itemUids });
  };

  // A. 家具の重なり（-8/組, 上限-30）
  {
    let pts = 0;
    const uids = new Set<string>();
    const pairs: string[] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (overlap(items[i], items[j])) {
          pts += 8;
          uids.add(items[i].uid);
          uids.add(items[j].uid);
          pairs.push(`${label(items[i])}と${label(items[j])}`);
        }
      }
    }
    if (pts > 0) {
      add(
        "overlap",
        `家具が重なっています（${pairs.slice(0, 3).join("、")}${pairs.length > 3 ? " ほか" : ""}）`,
        Math.min(pts, 30),
        [...uids]
      );
    }
  }

  // B. 入口クリアランスに家具（-8/件, 上限-24）
  {
    const clr = doorClearanceRects(openings, W, D);
    let pts = 0;
    const uids = new Set<string>();
    for (const it of items) {
      if (clr.some((c) => overlap(it, c))) {
        pts += 8;
        uids.add(it.uid);
      }
    }
    if (pts > 0)
      add("door", "入口の前（開閉・通行スペース）に家具があります", Math.min(pts, 24), [...uids]);
  }

  // C. 窓を塞いでいる（-6/件, 上限-18）
  {
    const fronts = openings
      .filter((o) => o.kind === "window")
      .map((o) => ({ op: o, rect: openingFrontRect(o, W, D, WINDOW_FRONT_CM) }));
    let pts = 0;
    const uids = new Set<string>();
    for (const { rect } of fronts) {
      const blockers = items.filter((it) => overlap(it, rect));
      if (blockers.length > 0) {
        pts += 6;
        blockers.forEach((b) => uids.add(b.uid));
      }
    }
    if (pts > 0) add("window", "窓の前に家具があり光や出入りを妨げます", Math.min(pts, 18), [...uids]);
  }

  // D. 生活動線が狭い（-6/本, 上限-18）
  {
    const narrowPaths = flowPaths.filter((p) => p.narrow.some((n) => n));
    if (narrowPaths.length > 0) {
      const minW = Math.round(Math.min(...narrowPaths.map((p) => p.minWidthCm)));
      add(
        "flow",
        `入口間の動線が狭い箇所があります（最小約${minW}cm・60cm未満）`,
        Math.min(narrowPaths.length * 6, 18),
        []
      );
    }
  }

  // E. 大型家具が壁から離れている（-5/件, 上限-20）
  {
    let pts = 0;
    const uids = new Set<string>();
    for (const it of items) {
      if (!WALL_AFFINITY.has(it.type)) continue;
      const wallDist = Math.min(
        it.xCm,
        it.yCm,
        W - (it.xCm + it.widthCm),
        D - (it.yCm + it.depthCm)
      );
      if (wallDist > WALL_GAP_LIMIT) {
        pts += 5;
        uids.add(it.uid);
      }
    }
    if (pts > 0)
      add("floating", "大型家具が壁から離れて浮いています（壁付けが安定）", Math.min(pts, 20), [
        ...uids,
      ]);
  }

  // F. 部屋外／欠け領域へのはみ出し（-8/件, 上限-24）
  {
    let pts = 0;
    const uids = new Set<string>();
    for (const it of items) {
      const outOfBounds =
        it.xCm < -1 ||
        it.yCm < -1 ||
        it.xCm + it.widthCm > W + 1 ||
        it.yCm + it.depthCm > D + 1;
      const e = Math.min(2, it.widthCm / 2, it.depthCm / 2);
      const cornersInside = [
        [it.xCm + e, it.yCm + e],
        [it.xCm + it.widthCm - e, it.yCm + e],
        [it.xCm + it.widthCm - e, it.yCm + it.depthCm - e],
        [it.xCm + e, it.yCm + it.depthCm - e],
      ].every(([cx, cy]) => pointInPolygon(polygon, cx, cy));
      const inCut = blockedRects.some((b) => overlap(it, b));
      if (outOfBounds || !cornersInside || inCut) {
        pts += 8;
        uids.add(it.uid);
      }
    }
    if (pts > 0)
      add("outside", "家具が部屋の外や使えない領域にはみ出しています", Math.min(pts, 24), [
        ...uids,
      ]);
  }

  // G. 家具の占有率が高すぎる（手狭）
  {
    const roomArea = W * D;
    const furnitureArea = items.reduce((s, it) => s + it.widthCm * it.depthCm, 0);
    const ratio = furnitureArea / roomArea;
    if (ratio > 0.75) add("crowded", "家具が多く、部屋がかなり手狭です", 15, []);
    else if (ratio > 0.6) add("crowded", "家具がやや多く、通路が窮屈です", 8, []);
  }

  // H. 採光・暗がり（採光マップがあるとき）
  if (lightGrid) {
    // 部屋全体の暗い割合
    let inRoom = 0;
    let dark = 0;
    for (let i = 0; i < lightGrid.values.length; i++) {
      const v = lightGrid.values[i];
      if (v < 0) continue;
      inRoom++;
      if (v < DARK_THRESHOLD) dark++;
    }
    if (inRoom > 0) {
      const ratio = dark / inRoom;
      if (ratio > 0.5) add("dark-room", "部屋に暗い場所が多いです（窓や照明を見直しましょう）", 12, []);
      else if (ratio > 0.3) add("dark-room", "やや暗い場所があります", 6, []);
    }

    // デスクの採光（暗い机は作業に不向き）
    let pts = 0;
    const uids = new Set<string>();
    for (const it of items) {
      if (it.type !== "デスク") continue;
      const v = sampleLight(lightGrid, it.xCm + it.widthCm / 2, it.yCm + it.depthCm / 2);
      if (v >= 0 && v < DARK_THRESHOLD) {
        pts += 5;
        uids.add(it.uid);
      }
    }
    if (pts > 0)
      add("dark-desk", "デスクが暗い位置にあります（窓際や照明の近くが快適）", Math.min(pts, 10), [
        ...uids,
      ]);
  }

  const total = deductions.reduce((s, d) => s + d.points, 0);
  return { score: Math.max(0, 100 - total), deductions };
}
