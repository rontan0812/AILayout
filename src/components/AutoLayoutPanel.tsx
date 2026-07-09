"use client";

import { useState } from "react";
import { FURNITURE_PRESETS } from "./furnitureCatalog";
import type { LayoutRequest } from "./autoLayout";

type AutoLayoutPanelProps = {
  onRun: (requests: LayoutRequest[]) => void;
};

// 置きたい家具の種類と数を選び、自動でレイアウトを生成する。
export default function AutoLayoutPanel({ onRun }: AutoLayoutPanelProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const setCount = (type: string, n: number) =>
    setCounts((prev) => ({ ...prev, [type]: Math.max(0, Math.min(20, n)) }));

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const run = () => {
    const requests: LayoutRequest[] = FURNITURE_PRESETS.filter(
      (p) => (counts[p.type] ?? 0) > 0
    ).map((p) => ({
      type: p.type,
      widthCm: p.widthCm,
      depthCm: p.depthCm,
      count: counts[p.type],
    }));
    if (requests.length > 0) onRun(requests);
  };

  return (
    <section className="flex w-full max-w-md flex-col gap-3 lg:w-72">
      <h2 className="text-lg font-semibold text-stone-800">自動レイアウト（家具を選ぶ）</h2>
      <p className="text-xs text-stone-500">
        置きたい家具と数を選ぶと、部屋の形・入口・窓を考慮して自動で配置します。手持ち家具は残し、それ以外の枠を置き換えます。
      </p>

      <ul className="flex flex-col gap-1.5">
        {FURNITURE_PRESETS.map((p) => {
          const n = counts[p.type] ?? 0;
          return (
            <li
              key={p.type}
              className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-stone-800">
                {p.type}
                <span className="ml-1 text-xs text-stone-400">
                  {p.widthCm}×{p.depthCm}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setCount(p.type, n - 1)}
                aria-label={`${p.type}を減らす`}
                className="h-6 w-6 shrink-0 rounded border border-stone-300 text-stone-600 hover:bg-stone-100"
              >
                −
              </button>
              <span className="w-5 shrink-0 text-center tabular-nums">{n}</span>
              <button
                type="button"
                onClick={() => setCount(p.type, n + 1)}
                aria-label={`${p.type}を増やす`}
                className="h-6 w-6 shrink-0 rounded border border-stone-300 text-stone-600 hover:bg-stone-100"
              >
                ＋
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={run}
        disabled={total === 0}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        自動で配置する{total > 0 ? `（${total}点）` : ""}
      </button>
    </section>
  );
}
