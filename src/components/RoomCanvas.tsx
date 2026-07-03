"use client";

import { Stage, Layer, Rect, Text } from "react-konva";

const STAGE_WIDTH = 700;
const STAGE_HEIGHT = 500;
const PADDING = 50;

type RoomCanvasProps = {
  widthCm: number;
  depthCm: number;
};

export default function RoomCanvas({ widthCm, depthCm }: RoomCanvasProps) {
  const isValid =
    Number.isFinite(widthCm) && Number.isFinite(depthCm) && widthCm > 0 && depthCm > 0;

  if (!isValid) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-400"
        style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
      >
        部屋のサイズを入力してください
      </div>
    );
  }

  // 部屋の縦横比を保ったままステージ内に収めるスケール
  const scale = Math.min(
    (STAGE_WIDTH - PADDING * 2) / widthCm,
    (STAGE_HEIGHT - PADDING * 2) / depthCm
  );
  const roomWidth = widthCm * scale;
  const roomDepth = depthCm * scale;
  const roomX = (STAGE_WIDTH - roomWidth) / 2;
  const roomY = (STAGE_HEIGHT - roomDepth) / 2;

  return (
    <Stage
      width={STAGE_WIDTH}
      height={STAGE_HEIGHT}
      className="rounded-lg border border-stone-300 bg-white shadow-sm"
    >
      <Layer>
        <Rect
          x={roomX}
          y={roomY}
          width={roomWidth}
          height={roomDepth}
          fill="#fafaf9"
          stroke="#57534e"
          strokeWidth={3}
        />
        <Text
          text={`横 ${widthCm} cm`}
          x={roomX}
          y={roomY - 28}
          width={roomWidth}
          align="center"
          fontSize={14}
          fill="#57534e"
        />
        {/* 左辺に沿って下から上へ読む縦ラベル */}
        <Text
          text={`縦 ${depthCm} cm`}
          x={roomX - 28}
          y={roomY + roomDepth}
          width={roomDepth}
          align="center"
          fontSize={14}
          fill="#57534e"
          rotation={-90}
        />
      </Layer>
    </Stage>
  );
}
