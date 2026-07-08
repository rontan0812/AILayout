"use client";

import { useEffect, useState } from "react";
import type { FurnitureItem } from "./FurnitureSearchPanel";
import type { PlacedItem } from "./RoomCanvas";
import { FURNITURE_PALETTE } from "./furniturePalette";
import { searchKeywordsFor } from "./furnitureCatalog";

const PROPOSAL_KEY = "ailayout-proposal";

type ProposalPanelProps = {
  placedItems: PlacedItem[];
  budget: number;
};

type Assignment = {
  block: PlacedItem;
  index: number; // placedItems内の並び順（色をキャンバスと合わせるため）
  product: FurnitureItem | null;
  oversize: boolean; // 枠に収まらないが最も近いサイズを採用した場合 true
};

export default function ProposalPanel({ placedItems, budget }: ProposalPanelProps) {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 要望
  const [cheaperFirst, setCheaperFirst] = useState(false);
  const [requestText, setRequestText] = useState("");
  // localStorage 読み込み完了フラグ
  const [loaded, setLoaded] = useState(false);

  // 保存済みの提案・要望を復元（作成途中の内容もそのまま残す）
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROPOSAL_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.assignments)) setAssignments(saved.assignments);
        if (typeof saved.cheaperFirst === "boolean") setCheaperFirst(saved.cheaperFirst);
        if (typeof saved.requestText === "string") setRequestText(saved.requestText);
      }
    } catch {
      // 壊れたデータは無視
    }
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 変更のたびに自動保存（リロードで復元できる）
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        PROPOSAL_KEY,
        JSON.stringify({ assignments, cheaperFirst, requestText })
      );
    } catch {
      // 保存失敗は無視
    }
  }, [assignments, cheaperFirst, requestText, loaded]);

  const generate = async () => {
    if (placedItems.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      // 楽天の新APIは約1リクエスト/秒の制限があるため、1件ずつ間隔を空けて叩く。
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let requestCount = 0;
      const fetchItems = async (
        keyword: string,
        maxW: number,
        maxD: number
      ): Promise<FurnitureItem[]> => {
        if (requestCount > 0) await sleep(2100);
        requestCount++;
        const params = new URLSearchParams({
          keyword,
          maxWidth: String(maxW),
          maxDepth: String(maxD),
        });
        for (let attempt = 0; attempt < 4; attempt++) {
          const res = await fetch(`/api/furniture/search?${params.toString()}`);
          const data = (await res.json()) as { items?: FurnitureItem[]; error?: string };
          if (res.status === 429) {
            await sleep(2000 * (attempt + 1)); // レート制限。待って再試行
            continue;
          }
          if (!res.ok) {
            throw new Error(data.error ?? `検索に失敗しました (${res.status})`);
          }
          return data.items ?? [];
        }
        throw new Error("楽天APIのレート制限が続いています。少し待ってからお試しください。");
      };

      // 種類ごとに、類義語も含めて検索し候補をまとめる（重複はidで除外）
      const types = [...new Set(placedItems.map((b) => b.type))];
      const byType: Record<string, FurnitureItem[]> = {};
      for (const type of types) {
        const blocks = placedItems.filter((b) => b.type === type);
        const maxW = Math.max(...blocks.map((b) => b.widthCm));
        const maxD = Math.max(...blocks.map((b) => b.depthCm));
        const merged = new Map<string, FurnitureItem>();
        const style = requestText.trim();
        for (const kw of searchKeywordsFor(type)) {
          // 要望（スタイル・色・ブランド等）があれば検索語に足して絞り込む
          const query = style ? `${kw} ${style}` : kw;
          const items = await fetchItems(query, maxW, maxD);
          for (const it of items) {
            if (!merged.has(it.id)) merged.set(it.id, it);
          }
        }
        byType[type] = [...merged.values()];
      }

      // 各枠が置ける候補（枠サイズに収まる）を安い順に用意。
      // 収まる候補が無い枠には、最もサイズが近い候補をフォールバックとして用意する。
      const blockCands: FurnitureItem[][] = [];
      const fallbackProducts: (FurnitureItem | null)[] = [];
      for (const block of placedItems) {
        const cands = byType[block.type] ?? [];
        const fitting = cands
          .filter(
            (p) =>
              p.widthCm !== null &&
              p.depthCm !== null &&
              p.widthCm <= block.widthCm &&
              p.depthCm <= block.depthCm
          )
          .sort((a, b) => a.price - b.price);
        blockCands.push(fitting);
        if (fitting.length === 0) {
          // サイズが分かる候補の中から、枠との差が最小のものを選ぶ
          const sized = cands.filter((p) => p.widthCm !== null && p.depthCm !== null);
          sized.sort((a, b) => {
            const da =
              Math.abs((a.widthCm as number) - block.widthCm) +
              Math.abs((a.depthCm as number) - block.depthCm);
            const db =
              Math.abs((b.widthCm as number) - block.widthCm) +
              Math.abs((b.depthCm as number) - block.depthCm);
            return da - db;
          });
          fallbackProducts.push(sized[0] ?? null);
        } else {
          fallbackProducts.push(null);
        }
      }

      // まず各枠に最安を割り当て（収まる候補が無ければフォールバックを使う）
      const chosen: number[] = placedItems.map((_, idx) =>
        blockCands[idx].length ? 0 : -1
      );
      const priceOf = (idx: number) =>
        chosen[idx] >= 0
          ? blockCands[idx][chosen[idx]].price
          : fallbackProducts[idx]?.price ?? 0;
      let total = placedItems.reduce((s, _, idx) => s + priceOf(idx), 0);

      // 「安め優先」でなく、予算があり収まっているなら、予算を使い切る方向にアップグレード
      if (!cheaperFirst && budget > 0 && total <= budget) {
        let improved = true;
        while (improved) {
          improved = false;
          let best: { idx: number; newIdx: number; delta: number } | null = null;
          for (let idx = 0; idx < placedItems.length; idx++) {
            if (chosen[idx] < 0) continue;
            const cur = priceOf(idx);
            const cands = blockCands[idx];
            // より高い候補のうち、予算内に収まる最も高いものを探す
            for (let j = cands.length - 1; j > chosen[idx]; j--) {
              const p = cands[j].price;
              if (p <= cur) continue;
              if (total - cur + p <= budget) {
                const delta = p - cur;
                if (!best || delta > best.delta) best = { idx, newIdx: j, delta };
                break;
              }
            }
          }
          if (best) {
            total += best.delta;
            chosen[best.idx] = best.newIdx;
            improved = true;
          }
        }
      }

      const result: Assignment[] = placedItems.map((block, index) => ({
        block,
        index,
        product:
          chosen[index] >= 0
            ? blockCands[index][chosen[index]]
            : fallbackProducts[index],
        oversize: chosen[index] < 0 && fallbackProducts[index] !== null,
      }));
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
        <div className="flex items-center gap-2">
          {assignments && !loading && (
            <button
              type="button"
              onClick={() => setAssignments(null)}
              className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              クリア
            </button>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={loading || placedItems.length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {loading ? "提案を作成中..." : "予算内で提案する"}
          </button>
        </div>
      </div>
      <p className="text-xs text-stone-400">
        提案と要望は自動保存され、リロードしても復元されます。
      </p>

      <div className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-3">
        <span className="text-sm font-medium text-stone-700">要望（任意）</span>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={cheaperFirst}
            onChange={(e) => setCheaperFirst(e.target.checked)}
            className="h-4 w-4"
          />
          安め優先（予算を使い切らず、なるべく安く抑える）
        </label>
        <label className="flex flex-col gap-1 text-sm text-stone-600">
          スタイル・色・ブランドなどの希望
          <input
            type="text"
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            placeholder="例: 北欧 / 白 / 木製"
            className="rounded-md border border-stone-300 px-3 py-2 text-stone-800 focus:border-blue-500 focus:outline-none"
          />
        </label>
        <p className="text-xs text-stone-400">
          ※要望を変えたら「予算内で提案する」を押すと反映されます。
        </p>
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
                        {a.oversize && (
                          <span className="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                            枠に収まる商品がないため、最も近いサイズ
                          </span>
                        )}
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
