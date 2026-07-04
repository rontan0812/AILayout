"use client";

import { useState } from "react";
import type { FurnitureItem } from "./FurnitureSearchPanel";
import type { PlacedItem } from "./RoomCanvas";
import { FURNITURE_PALETTE } from "./furniturePalette";

type ProposalPanelProps = {
  placedItems: PlacedItem[];
  budget: number;
};

type Assignment = {
  block: PlacedItem;
  index: number; // placedItems内の並び順（色をキャンバスと合わせるため）
  product: FurnitureItem | null;
};

export default function ProposalPanel({ placedItems, budget }: ProposalPanelProps) {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (placedItems.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      // 種類ごとに1回だけ楽天検索（枠の最大サイズで絞る）
      const types = [...new Set(placedItems.map((b) => b.type))];
      const byType: Record<string, FurnitureItem[]> = {};
      await Promise.all(
        types.map(async (type) => {
          const blocks = placedItems.filter((b) => b.type === type);
          const maxW = Math.max(...blocks.map((b) => b.widthCm));
          const maxD = Math.max(...blocks.map((b) => b.depthCm));
          const params = new URLSearchParams({
            keyword: type,
            maxWidth: String(maxW),
            maxDepth: String(maxD),
          });
          const res = await fetch(`/api/furniture/search?${params.toString()}`);
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error ?? `検索に失敗しました (${res.status})`);
          }
          byType[type] = (data.items ?? []) as FurnitureItem[];
        })
      );

      // 各枠に「枠サイズに収まる最安の候補」を割り当て
      const result: Assignment[] = placedItems.map((block, index) => {
        const candidates = (byType[block.type] ?? [])
          .filter(
            (p) =>
              p.widthCm !== null &&
              p.depthCm !== null &&
              p.widthCm <= block.widthCm &&
              p.depthCm <= block.depthCm
          )
          .sort((a, b) => a.price - b.price);
        return { block, index, product: candidates[0] ?? null };
      });
      setAssignments(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提案の作成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const total =
    assignments?.reduce((sum, a) => sum + (a.product?.price ?? 0), 0) ?? 0;
  const overBudget = budget > 0 && total > budget;

  return (
    <section className="flex w-full max-w-5xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-stone-800">予算内の家具を提案</h2>
        <button
          type="button"
          onClick={generate}
          disabled={loading || placedItems.length === 0}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {loading ? "提案を作成中..." : "予算内で提案する"}
        </button>
      </div>

      {placedItems.length === 0 && (
        <p className="text-sm text-stone-500">
          先に家具の枠を配置してください。
        </p>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {assignments && !loading && !error && (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {assignments.map((a) => {
              const color = FURNITURE_PALETTE[a.index % FURNITURE_PALETTE.length];
              return (
                <li
                  key={a.block.uid}
                  className="flex gap-3 rounded-lg border border-stone-200 bg-white p-3 shadow-sm"
                >
                  <span
                    className="mt-0.5 h-4 w-4 shrink-0 rounded"
                    style={{ backgroundColor: color.fill, border: `2px solid ${color.stroke}` }}
                  />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs font-medium text-stone-500">
                      {a.block.type}
                      {a.block.num}（枠 {a.block.widthCm}×{a.block.depthCm}cm）
                    </span>
                    {a.product ? (
                      <>
                        <a
                          href={a.product.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-2 text-sm text-stone-800 hover:text-blue-600 hover:underline"
                        >
                          {a.product.name}
                        </a>
                        <span className="text-sm">
                          <span className="font-semibold text-stone-900">
                            ¥{a.product.price.toLocaleString()}
                          </span>
                          <span className="ml-2 text-xs text-stone-500">
                            幅{a.product.widthCm}×奥行{a.product.depthCm}cm
                          </span>
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-stone-400">
                        枠に収まる候補が見つかりませんでした
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <div
            className={`flex items-baseline justify-between rounded-lg border px-4 py-3 ${
              overBudget
                ? "border-red-300 bg-red-50"
                : "border-emerald-300 bg-emerald-50"
            }`}
          >
            <div className="flex flex-col">
              <span className="text-sm text-stone-600">提案の合計金額</span>
              {budget > 0 && (
                <span className="text-xs text-stone-500">
                  予算 ¥{budget.toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex flex-col items-end">
              <span className="text-lg font-bold text-stone-900">
                ¥{total.toLocaleString()}
              </span>
              {budget > 0 && (
                <span
                  className={`text-xs font-semibold ${
                    overBudget ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {overBudget
                    ? `予算オーバー ¥${(total - budget).toLocaleString()}`
                    : `予算内（残り ¥${(budget - total).toLocaleString()}）`}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
