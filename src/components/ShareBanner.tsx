"use client";

// 共有中に画面上部へ出すバナー（T-共有-3）。
// 参加人数の表示、共有URLのコピー、共有からの退出を提供する。

import { useState } from "react";
import type { SharedRoom } from "@/components/useSharedRoom";

function buildShareUrl(roomId: string): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  return url.toString();
}

export default function ShareBanner({ share }: { share: SharedRoom }) {
  const { roomId, peers, connected, stopShare } = share;
  const [copied, setCopied] = useState(false);

  if (!roomId) return null;

  const handleCopy = async () => {
    const url = buildShareUrl(roomId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードが使えない環境では選択できるよう促す
      window.prompt("この共有URLをコピーしてください", url);
    }
  };

  // 自分を含む参加人数（プレゼンス取得前は最低1人として扱う）
  const count = Math.max(peers, 1);

  return (
    <div className="flex w-full max-w-5xl flex-wrap items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
      <span className="flex items-center gap-2 font-medium">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        共有中
      </span>
      <span className="text-emerald-700">
        {connected ? `${count}人が編集中` : "接続中…"}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-emerald-400 bg-white px-3 py-1 text-emerald-700 hover:bg-emerald-100"
        >
          {copied ? "✓ コピーしました" : "🔗 URLをコピー"}
        </button>
        <button
          type="button"
          onClick={stopShare}
          className="rounded-md border border-stone-300 bg-white px-3 py-1 text-stone-600 hover:bg-stone-100"
        >
          退出
        </button>
      </div>
    </div>
  );
}
