"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import RoomSizeForm, { type RoomSize } from "@/components/RoomSizeForm";
import FurnitureSearchPanel, { type FurnitureItem } from "@/components/FurnitureSearchPanel";
import type { PlacedItem } from "@/components/RoomCanvas";
import { FURNITURE_PALETTE } from "@/components/furniturePalette";

// 既存の家具と重ならない配置位置（cm）を探す。空きが無ければ左上へ。
function findFreePosition(
  items: PlacedItem[],
  roomW: number,
  roomD: number,
  itemW: number,
  itemD: number
): { x: number; y: number } {
  const cols = Math.max(1, Math.floor(roomW / itemW));
  const rows = Math.max(1, Math.floor(roomD / itemD));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * itemW;
      const y = r * itemD;
      if (x + itemW > roomW || y + itemD > roomD) continue;
      const hit = items.some(
        (i) =>
          !(
            x + itemW <= i.xCm ||
            x >= i.xCm + i.widthCm ||
            y + itemD <= i.yCm ||
            y >= i.yCm + i.depthCm
          )
      );
      if (!hit) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

// Konva はブラウザの canvas API に依存するため SSR を無効化する
const RoomCanvas = dynamic(() => import("@/components/RoomCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-[7/5] w-full max-w-[700px] items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-400">
      キャンバスを読み込み中...
    </div>
  ),
});

export default function Home() {
  const [roomSize, setRoomSize] = useState<RoomSize>({ widthCm: 360, depthCm: 270 });
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);

  const handlePlace = (item: FurnitureItem) => {
    // サイズが分かる家具だけ配置できる（実寸で描くため）
    if (item.widthCm === null || item.depthCm === null) return;
    const widthCm = item.widthCm;
    const depthCm = item.depthCm;
    setPlacedItems((prev) => {
      const { x, y } = findFreePosition(
        prev,
        roomSize.widthCm,
        roomSize.depthCm,
        widthCm,
        depthCm
      );
      return [
        ...prev,
        {
          uid: crypto.randomUUID(),
          name: item.name,
          price: item.price,
          widthCm,
          depthCm,
          xCm: x,
          yCm: y,
        },
      ];
    });
  };

  const handleMove = (uid: string, xCm: number, yCm: number) => {
    setPlacedItems((prev) =>
      prev.map((i) => (i.uid === uid ? { ...i, xCm, yCm } : i))
    );
  };

  const handleRemove = (uid: string) => {
    setPlacedItems((prev) => prev.filter((i) => i.uid !== uid));
  };

  const totalPrice = placedItems.reduce((sum, i) => sum + i.price, 0);

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-stone-100 p-4 sm:p-8">
      <h1 className="text-xl font-bold text-stone-800 sm:text-2xl">家具配置シミュレーター</h1>
      <div className="flex w-full max-w-5xl flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-center">
        <div className="flex w-full max-w-[700px] flex-col items-center gap-6">
          <RoomSizeForm value={roomSize} onChange={setRoomSize} />
          <RoomCanvas
            widthCm={roomSize.widthCm}
            depthCm={roomSize.depthCm}
            placedItems={placedItems}
            onMove={handleMove}
            onRemove={handleRemove}
          />
          <div className="flex w-full items-baseline justify-between rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
            <span className="text-sm text-stone-600">
              配置した家具 {placedItems.length} 点の合計
            </span>
            <span className="text-lg font-bold text-stone-900">
              ¥{totalPrice.toLocaleString()}
            </span>
          </div>
          {placedItems.length > 0 && (
            <div className="flex w-full flex-col gap-2">
              <ul className="flex flex-col gap-1.5">
                {placedItems.map((item, index) => {
                  const color = FURNITURE_PALETTE[index % FURNITURE_PALETTE.length];
                  return (
                    <li
                      key={item.uid}
                      className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2"
                    >
                      <span
                        className="h-4 w-4 shrink-0 rounded"
                        style={{ backgroundColor: color.fill, border: `2px solid ${color.stroke}` }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-stone-800">
                        {item.name}
                      </span>
                      <span className="shrink-0 text-xs text-stone-500">
                        {item.widthCm}×{item.depthCm}cm
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-stone-700">
                        ¥{item.price.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemove(item.uid)}
                        aria-label="削除"
                        className="shrink-0 rounded px-1 text-lg leading-none text-stone-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-stone-500">
                家具はドラッグで移動、ダブルタップまたは × で削除できます
              </p>
            </div>
          )}
        </div>
        <FurnitureSearchPanel onPlace={handlePlace} />
      </div>
    </main>
  );
}
