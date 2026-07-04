"use client";

import { FURNITURE_PRESETS, type FurniturePreset } from "./furnitureCatalog";

type FurniturePresetPanelProps = {
  onPlace: (preset: FurniturePreset) => void;
};

export default function FurniturePresetPanel({ onPlace }: FurniturePresetPanelProps) {
  return (
    <section className="flex w-full max-w-md flex-col gap-3 lg:w-72">
      <h2 className="text-lg font-semibold text-stone-800">家具を置く</h2>
      <p className="text-xs text-stone-500">
        まずは実物を選ばず、間取りに家具の枠を配置します。サイズは後から一覧で調整できます。
      </p>
      <div className="grid grid-cols-2 gap-2">
        {FURNITURE_PRESETS.map((preset) => (
          <button
            key={preset.type}
            type="button"
            onClick={() => onPlace(preset)}
            className="flex flex-col items-start rounded-md border border-stone-300 bg-white px-3 py-2 text-left hover:border-blue-500 hover:bg-blue-50"
          >
            <span className="text-sm font-medium text-stone-800">{preset.type}</span>
            <span className="text-xs text-stone-500">
              {preset.widthCm}×{preset.depthCm}cm
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
