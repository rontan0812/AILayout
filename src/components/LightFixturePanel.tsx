"use client";

import type { Light } from "./lighting";

type LightFixturePanelProps = {
  lights: Light[];
  onAdd: (kind: Light["kind"]) => void;
  onRemove: (id: string) => void;
};

const KIND_LABEL: Record<Light["kind"], string> = {
  ceiling: "天井灯",
  floor: "フロアランプ",
};

// 部屋の照明（天井灯／フロアランプ）を追加・削除する。位置はキャンバス上でドラッグ。
export default function LightFixturePanel({ lights, onAdd, onRemove }: LightFixturePanelProps) {
  return (
    <section className="flex w-full max-w-md flex-col gap-3 lg:w-72">
      <h2 className="text-lg font-semibold text-stone-800">部屋の照明</h2>
      <p className="text-xs text-stone-500">
        照明を追加するとキャンバス中央に置かれます。ドラッグで移動、ダブルクリックで削除。採光マップに反映されます（天井灯は広く明るく、フロアランプは家具で影になります）。
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onAdd("ceiling")}
          className="flex-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100"
        >
          ☀ 天井灯を追加
        </button>
        <button
          type="button"
          onClick={() => onAdd("floor")}
          className="flex-1 rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-800 hover:bg-orange-100"
        >
          💡 フロアランプ
        </button>
      </div>

      {lights.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {lights.map((l, i) => (
            <li
              key={l.id}
              className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-stone-800">
                {KIND_LABEL[l.kind]}
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => onRemove(l.id)}
                aria-label="削除"
                className="shrink-0 rounded px-1 text-lg leading-none text-stone-400 hover:text-red-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
