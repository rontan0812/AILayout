"use client";

import { useState } from "react";
import type { Opening } from "./RoomCanvas";

type OpeningPanelProps = {
  openings: Opening[];
  onAdd: (opening: Omit<Opening, "id">) => void;
  onRemove: (id: string) => void;
};

const WALL_LABELS: Record<Opening["wall"], string> = {
  top: "上",
  bottom: "下",
  left: "左",
  right: "右",
};

export default function OpeningPanel({ openings, onAdd, onRemove }: OpeningPanelProps) {
  const [wall, setWall] = useState<Opening["wall"]>("top");
  const [kind, setKind] = useState<Opening["kind"]>("door");
  const [offsetCm, setOffsetCm] = useState(100);
  const [widthCm, setWidthCm] = useState(80);

  const inputClass =
    "w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800 focus:border-blue-500 focus:outline-none";

  return (
    <section className="flex w-full max-w-md flex-col gap-3 lg:w-72">
      <h2 className="text-lg font-semibold text-stone-800">入口・窓</h2>
      <p className="text-xs text-stone-500">
        壁の辺に入口（ドア）や窓を置きます。位置は辺の始点からの中心位置(cm)です。
      </p>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-stone-600">
          種別
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Opening["kind"])}
            className={inputClass}
          >
            <option value="door">入口（ドア）</option>
            <option value="window">窓</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-600">
          壁
          <select
            value={wall}
            onChange={(e) => setWall(e.target.value as Opening["wall"])}
            className={inputClass}
          >
            <option value="top">上</option>
            <option value="bottom">下</option>
            <option value="left">左</option>
            <option value="right">右</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-600">
          位置(cm)
          <input
            type="number"
            min={0}
            value={offsetCm}
            onChange={(e) =>
              setOffsetCm(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0)
            }
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-600">
          幅(cm)
          <input
            type="number"
            min={10}
            value={widthCm}
            onChange={(e) =>
              setWidthCm(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 10)
            }
            className={inputClass}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => onAdd({ wall, kind, offsetCm, widthCm })}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        追加
      </button>

      {openings.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {openings.map((op) => (
            <li
              key={op.id}
              className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: op.kind === "door" ? "#c2410c" : "#0369a1" }}
              />
              <span className="min-w-0 flex-1 truncate text-stone-800">
                {op.kind === "door" ? "入口" : "窓"}・{WALL_LABELS[op.wall]}壁
              </span>
              <span className="shrink-0 text-xs text-stone-500">
                {op.offsetCm}/{op.widthCm}cm
              </span>
              <button
                type="button"
                onClick={() => onRemove(op.id)}
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
