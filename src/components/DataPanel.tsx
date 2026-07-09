"use client";

import { useRef } from "react";
import { STORAGE_KEY, PROPOSAL_KEY } from "./storageKeys";

// 間取り・配置・開口部・予算・提案を JSON で入出力する。
export default function DataPanel() {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    let main: Record<string, unknown> = {};
    try {
      main = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    } catch {
      // 壊れていれば空で出力
    }
    let proposal: unknown = null;
    try {
      proposal = JSON.parse(localStorage.getItem(PROPOSAL_KEY) ?? "null");
    } catch {
      // 無視
    }
    const data = { version: 1, ...main, proposal };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ailayout.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを再選択できるように
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        // localStorage を直接書き換えてからリロードし、全体を復元する
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            roomSize: data.roomSize,
            roomShape: data.roomShape,
            placedItems: Array.isArray(data.placedItems) ? data.placedItems : [],
            openings: Array.isArray(data.openings) ? data.openings : [],
            budget: typeof data.budget === "number" ? data.budget : 0,
            northDeg: typeof data.northDeg === "number" ? data.northDeg : 0,
            timeOfDay: typeof data.timeOfDay === "number" ? data.timeOfDay : 0.5,
            lights: Array.isArray(data.lights) ? data.lights : [],
          })
        );
        if (data.proposal) {
          localStorage.setItem(PROPOSAL_KEY, JSON.stringify(data.proposal));
        } else {
          localStorage.removeItem(PROPOSAL_KEY);
        }
        location.reload();
      } catch {
        alert("読み込みに失敗しました。JSONファイルを確認してください。");
      }
    };
    reader.readAsText(file);
  };

  return (
    <section className="flex w-full max-w-md flex-col gap-3 lg:w-72">
      <h2 className="text-lg font-semibold text-stone-800">データ</h2>
      <p className="text-xs text-stone-500">
        間取り・配置・開口部・予算・提案を JSON で保存/読み込みできます。
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleExport}
          className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
        >
          エクスポート
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
        >
          インポート
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImport}
        className="hidden"
      />
    </section>
  );
}
