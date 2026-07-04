"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import RoomSizeForm, { type RoomSize } from "@/components/RoomSizeForm";
import FurnitureSearchPanel, { type FurnitureItem } from "@/components/FurnitureSearchPanel";
import type { PlacedItem } from "@/components/RoomCanvas";

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
    setPlacedItems((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        name: item.name,
        widthCm: item.widthCm as number,
        depthCm: item.depthCm as number,
        xCm: 0,
        yCm: 0,
      },
    ]);
  };

  const handleMove = (uid: string, xCm: number, yCm: number) => {
    setPlacedItems((prev) =>
      prev.map((i) => (i.uid === uid ? { ...i, xCm, yCm } : i))
    );
  };

  const handleRemove = (uid: string) => {
    setPlacedItems((prev) => prev.filter((i) => i.uid !== uid));
  };

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
          {placedItems.length > 0 && (
            <p className="text-xs text-stone-500">
              家具はドラッグで移動、ダブルタップで削除できます
            </p>
          )}
        </div>
        <FurnitureSearchPanel onPlace={handlePlace} />
      </div>
    </main>
  );
}
