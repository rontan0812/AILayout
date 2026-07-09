"use client";

// 共有の開始・停止と共有URLの表示（T-共有-2）。
// 参加人数の表示やURLコピー・退出の作り込みは T-共有-3 で拡張する。

import type { SharedRoom } from "@/components/useSharedRoom";

export default function SharePanel({ share }: { share: SharedRoom }) {
  const { roomId, peers, startShare } = share;

  if (roomId) {
    // 共有中の操作（人数・コピー・退出）は上部の共有バナーに集約している
    return (
      <div className="flex flex-col gap-1 text-sm text-stone-600">
        <span className="flex items-center gap-2 text-emerald-700">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          共有中（{Math.max(peers, 1)}人）
        </span>
        <p className="text-xs text-stone-500">
          上部のバナーからURLのコピー・退出ができます。
        </p>
      </div>
    );
  }

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
