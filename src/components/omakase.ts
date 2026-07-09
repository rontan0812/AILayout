// 予算と部屋サイズから、定番構成の家具（品目・数量）を自動選定する。
// 実際の価格は楽天提案で確定するため、ここでは選定用の目安価格を使う。

import { FURNITURE_PRESETS } from "./furnitureCatalog";
import type { LayoutRequest } from "./autoLayout";

// 選定用の目安価格（円）。実売ではなく品目選定のための概算。
export const TYPICAL_PRICE: Record<string, number> = {
  ベッド: 45000,
  ソファ: 40000,
  ダイニングテーブル: 30000,
  ワードローブ: 30000,
  チェスト: 20000,
  デスク: 20000,
  テレビ台: 18000,
  本棚: 15000,
  ローテーブル: 12000,
  チェア: 8000,
};
const priceOf = (type: string) => TYPICAL_PRICE[type] ?? 15000;

// 定番として順に検討する並び（優先度の高い生活必需品から）。
const SEQUENCE: string[] = [
  "ベッド",
  "ソファ",
  "テレビ台",
  "ダイニングテーブル",
  "チェア",
  "チェア",
  "デスク",
  "本棚",
  "チェスト",
  "ローテーブル",
  "ワードローブ",
];

export type OmakaseResult = {
  requests: LayoutRequest[];
  chosen: { type: string; count: number; price: number }[]; // priceは単価目安
  totalPrice: number;
};

// 予算内に収まり、部屋の広さにも無理のない範囲で定番構成を組む。
export function buildOmakaseRequests(
  budget: number,
  roomW: number,
  roomD: number
): OmakaseResult {
  const presetMap = new Map(FURNITURE_PRESETS.map((p) => [p.type, p]));
  const roomArea = Math.max(1, roomW * roomD);
  const areaBudget = roomArea * 0.55; // 家具で埋めすぎない上限

  let cost = 0;
  let area = 0;
  const counts = new Map<string, number>();

  for (const type of SEQUENCE) {
    const preset = presetMap.get(type);
    if (!preset) continue;
    const price = priceOf(type);
    const a = preset.widthCm * preset.depthCm;
    if (cost + price > budget) continue; // 予算超過はスキップし、より安い後続を検討
    if (area + a > areaBudget) continue; // 広さの上限を超えるならスキップ
    cost += price;
    area += a;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const requests: LayoutRequest[] = [];
  const chosen: { type: string; count: number; price: number }[] = [];
  for (const [type, count] of counts) {
    const preset = presetMap.get(type)!;
    requests.push({ type, widthCm: preset.widthCm, depthCm: preset.depthCm, count });
    chosen.push({ type, count, price: priceOf(type) });
  }

  return { requests, chosen, totalPrice: cost };
}
