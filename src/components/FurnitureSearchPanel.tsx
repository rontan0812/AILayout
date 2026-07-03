"use client";

import { useState } from "react";

export type FurnitureItem = {
  id: string;
  name: string;
  price: number;
  url: string;
  imageUrl: string | null;
  widthCm: number | null;
  depthCm: number | null;
};

function formatSize(item: FurnitureItem): string {
  if (item.widthCm === null && item.depthCm === null) {
    return "サイズ不明";
  }
  const w = item.widthCm !== null ? `幅${item.widthCm}` : "幅?";
  const d = item.depthCm !== null ? `奥行${item.depthCm}` : "奥行?";
  return `${w} × ${d} cm`;
}

export default function FurnitureSearchPanel() {
  const [keyword, setKeyword] = useState("ソファ");
  const [maxPrice, setMaxPrice] = useState("");
  const [maxWidth, setMaxWidth] = useState("");
  const [maxDepth, setMaxDepth] = useState("");
  const [items, setItems] = useState<FurnitureItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ keyword: keyword.trim() });
      if (maxPrice) params.set("maxPrice", maxPrice);
      if (maxWidth) params.set("maxWidth", maxWidth);
      if (maxDepth) params.set("maxDepth", maxDepth);

      const res = await fetch(`/api/furniture/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `検索に失敗しました (${res.status})`);
      }
      setItems(data.items);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "検索に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-blue-500 focus:outline-none";

  return (
    <section className="flex w-80 flex-col gap-4">
      <h2 className="text-lg font-semibold text-stone-800">家具を探す</h2>

      <form className="flex flex-col gap-3" onSubmit={handleSearch}>
        <label className="flex flex-col gap-1 text-sm text-stone-600">
          キーワード
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="例: ソファ 2人掛け"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-stone-600">
          予算上限（円）
          <input
            type="number"
            min={0}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="例: 50000"
            className={inputClass}
          />
        </label>
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm text-stone-600">
            幅の上限（cm）
            <input
              type="number"
              min={0}
              value={maxWidth}
              onChange={(e) => setMaxWidth(e.target.value)}
              placeholder="例: 180"
              className={inputClass}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm text-stone-600">
            奥行の上限（cm）
            <input
              type="number"
              min={0}
              value={maxDepth}
              onChange={(e) => setMaxDepth(e.target.value)}
              placeholder="例: 90"
              className={inputClass}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={loading || !keyword.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {loading ? "検索中...（サイズ解析に数十秒かかることがあります）" : "検索"}
        </button>
      </form>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {searched && !loading && !error && items.length === 0 && (
        <p className="text-sm text-stone-500">条件に合う商品が見つかりませんでした</p>
      )}

      <ul className="flex flex-col gap-3 overflow-y-auto">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex gap-3 rounded-lg border border-stone-200 bg-white p-3 shadow-sm"
          >
            {item.imageUrl ? (
              // 楽天CDNの画像はドメインが多岐にわたるため next/image は使わない
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded bg-stone-100" />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="line-clamp-2 text-sm text-stone-800 hover:text-blue-600 hover:underline"
              >
                {item.name}
              </a>
              <p className="text-sm font-semibold text-stone-900">
                ¥{item.price.toLocaleString()}
              </p>
              <p className="text-xs text-stone-500">{formatSize(item)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
