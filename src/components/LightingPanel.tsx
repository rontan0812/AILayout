"use client";

import { DIRECTIONS, timeLabel } from "./lighting";

type LightingPanelProps = {
  northDeg: number;
  timeOfDay: number;
  onChangeNorth: (deg: number) => void;
  onChangeTime: (t: number) => void;
};

// 部屋の方角（上の壁の向き）と時間帯を設定する。
export default function LightingPanel({
  northDeg,
  timeOfDay,
  onChangeNorth,
  onChangeTime,
}: LightingPanelProps) {
  const inputClass =
    "w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800 focus:border-blue-500 focus:outline-none";

  return (
    <section className="flex w-full max-w-md flex-col gap-3 lg:w-72">
      <h2 className="text-lg font-semibold text-stone-800">方角・時間帯</h2>
      <p className="text-xs text-stone-500">
        部屋の向きと時間帯を設定すると、窓からの採光や影を計算します（南向きの窓は明るいなど）。
      </p>

      <label className="flex flex-col gap-1 text-xs text-stone-600">
        上の壁が向いている方角
        <select
          value={northDeg}
          onChange={(e) => onChangeNorth(Number(e.target.value))}
          className={inputClass}
        >
          {DIRECTIONS.map((d) => (
            <option key={d.deg} value={d.deg}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-stone-600">
        <span className="flex justify-between">
          <span>時間帯</span>
          <span className="text-stone-400">{timeLabel(timeOfDay)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={timeOfDay}
          onChange={(e) => onChangeTime(e.target.valueAsNumber)}
          className="w-full accent-amber-500"
        />
        <span className="flex justify-between text-[10px] text-stone-400">
          <span>朝</span>
          <span>昼</span>
          <span>夕</span>
        </span>
      </label>
    </section>
  );
}
