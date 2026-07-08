"use client";

import { CORNER_LABELS, type RoomCorner, type RoomShape } from "./roomShape";

type RoomShapePanelProps = {
  shape: RoomShape;
  roomSize: { widthCm: number; depthCm: number };
  onChange: (shape: RoomShape) => void;
};

const CORNERS: RoomCorner[] = ["tl", "tr", "bl", "br"];

// 部屋の形（長方形 / L字）を選び、L字の欠けの位置と大きさを編集する。
export default function RoomShapePanel({ shape, roomSize, onChange }: RoomShapePanelProps) {
  const isL = shape.kind === "L";
  const corner = isL ? shape.corner : "tr";
  const cutWidthCm = isL ? shape.cutWidthCm : Math.round(roomSize.widthCm / 3);
  const cutDepthCm = isL ? shape.cutDepthCm : Math.round(roomSize.depthCm / 3);

  const inputClass =
    "w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800 focus:border-blue-500 focus:outline-none";

  const setL = (patch: Partial<{ corner: RoomCorner; cutWidthCm: number; cutDepthCm: number }>) =>
    onChange({
      kind: "L",
      corner: patch.corner ?? corner,
      cutWidthCm: patch.cutWidthCm ?? cutWidthCm,
      cutDepthCm: patch.cutDepthCm ?? cutDepthCm,
    });

  return (
    <section className="flex w-full max-w-md flex-col gap-3 lg:w-72">
      <h2 className="text-lg font-semibold text-stone-800">部屋の形</h2>
      <p className="text-xs text-stone-500">
        長方形のほか、四隅のいずれかを欠いたL字型を作れます。全体サイズ（縦横）は「部屋のサイズ」で調整します。
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange({ kind: "rect" })}
          className={`flex-1 rounded-md border px-3 py-2 text-sm ${
            shape.kind === "rect"
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
          }`}
        >
          長方形
        </button>
        <button
          type="button"
          onClick={() => setL({})}
          className={`flex-1 rounded-md border px-3 py-2 text-sm ${
            isL
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
          }`}
        >
          L字
        </button>
      </div>

      {isL && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-stone-600">
            欠けの位置
            <select
              value={corner}
              onChange={(e) => setL({ corner: e.target.value as RoomCorner })}
              className={inputClass}
            >
              {CORNERS.map((c) => (
                <option key={c} value={c}>
                  {CORNER_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-stone-600">
            <span className="flex justify-between">
              <span>欠けの幅（横）</span>
              <span className="text-stone-400">
                {Math.round(cutWidthCm)} / {Math.round(roomSize.widthCm)} cm
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0, Math.round(roomSize.widthCm - 10))}
              value={Math.round(cutWidthCm)}
              onChange={(e) => setL({ cutWidthCm: e.target.valueAsNumber })}
              className="w-full accent-blue-600"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-stone-600">
            <span className="flex justify-between">
              <span>欠けの奥行（縦）</span>
              <span className="text-stone-400">
                {Math.round(cutDepthCm)} / {Math.round(roomSize.depthCm)} cm
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0, Math.round(roomSize.depthCm - 10))}
              value={Math.round(cutDepthCm)}
              onChange={(e) => setL({ cutDepthCm: e.target.valueAsNumber })}
              className="w-full accent-blue-600"
            />
          </label>
        </div>
      )}
    </section>
  );
}
