"use client";

import { useState } from "react";
import { buildOmakaseRequests, type OmakaseResult } from "./omakase";
import type { LayoutRequest } from "./autoLayout";

type BudgetLayoutPanelProps = {
  budget: number;
  roomSize: { widthCm: number; depthCm: number };
  onRun: (requests: LayoutRequest[]) => void;
};

// 予算と部屋サイズだけから定番構成を自動選定し、配置する。
export default function BudgetLayoutPanel({ budget, roomSize, onRun }: BudgetLayoutPanelProps) {
  const [preview, setPreview] = useState<OmakaseResult | null>(null);
  const [note, setNote] = useState("");

  const run = () => {
    if (budget <= 0) {
      setPreview(null);
      setNote("先に「全体予算」を設定してください。");
      return;
    }
    const res = buildOmakaseRequests(budget, roomSize.widthCm, roomSize.depthCm);
    if (res.requests.length === 0) {
      setPreview(null);
      setNote("この予算で置ける定番家具が見つかりませんでした。予算を上げてお試しください。");
      return;
    }
    setPreview(res);
    setNote("");
    onRun(res.requests);
  };

  return (
    <section className="flex w-full max-w-md flex-col gap-3 lg:w-72">
      <h2 className="text-lg font-semibold text-stone-800">おまかせ配置（予算から）</h2>
      <p className="text-xs text-stone-500">
        全体予算と部屋の広さから、定番の家具構成を自動で選んで配置します。品目は目安価格で選定し、実際の商品と価格は下の「予算内の提案」で確定します。
      </p>

      <button
        type="button"
        onClick={run}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        予算内でおまかせ配置
      </button>

      {note && <p className="text-xs text-amber-700">{note}</p>}

      {preview && (
        <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm">
          <p className="mb-1 text-xs text-stone-500">
            選定した構成（目安 合計 ¥{preview.totalPrice.toLocaleString()}）
          </p>
          <ul className="flex flex-col gap-0.5">
            {preview.chosen.map((c) => (
              <li key={c.type} className="flex justify-between text-stone-700">
                <span>
                  {c.type}
                  {c.count > 1 ? ` ×${c.count}` : ""}
                </span>
                <span className="text-stone-400">
                  目安 ¥{(c.price * c.count).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
