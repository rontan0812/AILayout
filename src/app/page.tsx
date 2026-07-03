"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import RoomSizeForm, { type RoomSize } from "@/components/RoomSizeForm";

// Konva はブラウザの canvas API に依存するため SSR を無効化する
const RoomCanvas = dynamic(() => import("@/components/RoomCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] w-[700px] items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-400">
      キャンバスを読み込み中...
    </div>
  ),
});

export default function Home() {
  const [roomSize, setRoomSize] = useState<RoomSize>({ widthCm: 360, depthCm: 270 });

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-stone-100 p-8">
      <h1 className="text-2xl font-bold text-stone-800">家具配置シミュレーター</h1>
      <RoomSizeForm value={roomSize} onChange={setRoomSize} />
      <RoomCanvas widthCm={roomSize.widthCm} depthCm={roomSize.depthCm} />
    </main>
  );
}
