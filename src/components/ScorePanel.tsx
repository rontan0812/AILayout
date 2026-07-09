"use client";

import type { LayoutScore } from "./layoutScore";

type ScorePanelProps = {
  result: LayoutScore;
  activeId?: string | null;
  onHover?: (uids: string[], id: string | null) => void;
};

function tier(score: number) {
  if (score >= 90) return { text: "とても良い", color: "#059669", bg: "#ecfdf5", ring: "#a7f3d0" };
  if (score >= 70) return { text: "良い", color: "#65a30d", bg: "#f7fee7", ring: "#d9f99d" };
  if (score >= 50) return { text: "改善の余地あり", color: "#d97706", bg: "#fffbeb", ring: "#fde68a" };
  return { text: "見直しを推奨", color: "#dc2626", bg: "#fef2f2", ring: "#fecaca" };
}

// 配置の採点結果と減点理由を表示する。
export default function ScorePanel({ result, activeId, onHover }: ScorePanelProps) {
  const t = tier(result.score);
  return (
    <section className="flex w-full flex-col gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div
          className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border-4"
          style={{ borderColor: t.ring, backgroundColor: t.bg }}
        >
          <span className="text-2xl font-bold tabular-nums" style={{ color: t.color }}>
            {result.score}
          </span>
          <span className="text-[10px] text-stone-400">/ 100</span>
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-stone-800">配置の採点</h2>
          <p className="text-sm font-medium" style={{ color: t.color }}>
            {t.text}
          </p>
          <p className="text-xs text-stone-500">
            {result.deductions.length === 0
              ? "指摘はありません。良い配置です。"
              : `${result.deductions.length}件の改善ポイント`}
          </p>
        </div>
      </div>

      {result.deductions.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {result.deductions.map((d) => (
            <li
              key={d.id}
              onMouseEnter={() => onHover?.(d.itemUids, d.id)}
              onMouseLeave={() => onHover?.([], null)}
              className={`flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
                activeId === d.id ? "border-red-300 bg-red-50" : "border-stone-200 bg-stone-50"
              } ${d.itemUids.length > 0 ? "cursor-default" : ""}`}
            >
              <span className="min-w-0 text-stone-700">{d.label}</span>
              <span className="shrink-0 font-medium tabular-nums text-red-600">−{d.points}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
