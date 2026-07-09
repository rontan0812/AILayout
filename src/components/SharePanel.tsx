"use client";

// 共有の開始・停止と共有URLの表示（T-共有-2）。
// 参加人数の表示やURLコピー・退出の作り込みは T-共有-3 で拡張する。

import type { SharedRoom } from "@/components/useSharedRoom";

// 現在のURLに ?room=ID を付けた共有URLを組み立てる（クライアント側のみ）
function buildShareUrl(roomId: string): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  return url.toString();
}

export default function SharePanel({ share }: { share: SharedRoom }) {
  const { roomId, startShare, stopShare } = share;

  if (!roomId) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={startShare}
          className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100"
        >
          🔗 共有を開始
        </button>
        <p className="text-xs text-stone-500">
          共有URLを発行し、同じ部屋を離れた相手とほぼリアルタイムに一緒に編集できます（アカウント不要）。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        共有中
      </div>
      <input
        type="text"
        readOnly
        value={buildShareUrl(roomId)}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded border border-stone-300 bg-stone-50 px-2 py-1 text-xs text-stone-700 focus:border-blue-500 focus:outline-none"
        aria-label="共有URL"
      />
      <p className="text-xs text-stone-500">
        このURLを共有すると、開いた相手も同じ部屋を編集できます。
      </p>
      <button
        type="button"
        onClick={stopShare}
        className="self-start rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
      >
        共有を停止
      </button>
    </div>
  );
}
