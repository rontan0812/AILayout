"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text } from "react-konva";

const MAX_WIDTH = 700;
const ASPECT = 500 / 700; // 高さ / 幅
const PADDING_RATIO = 50 / 700;

type RoomCanvasProps = {
  widthCm: number;
  depthCm: number;
};

export default function RoomCanvas({ widthCm, depthCm }: RoomCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(MAX_WIDTH);

  // 親要素の幅に追従させる（携帯では画面幅、PCでは最大700px）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setStageWidth(Math.min(MAX_WIDTH, el.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stageHeight = stageWidth * ASPECT;
  const padding = stageWidth * PADDING_RATIO;

  const isValid =
    Number.isFinite(widthCm) && Number.isFinite(depthCm) && widthCm > 0 && depthCm > 0;

  return (
    <div ref={containerRef} className="w-full max-w-[700px]">
      {isValid ? (
        (() => {
          // 部屋の縦横比を保ったままステージ内に収めるスケール
          const scale = Math.min(
            (stageWidth - padding * 2) / widthCm,
            (stageHeight - padding * 2) / depthCm
          );
          const roomWidth = widthCm * scale;
          const roomDepth = depthCm * scale;
          const roomX = (stageWidth - roomWidth) / 2;
          const roomY = (stageHeight - roomDepth) / 2;

          return (
            <Stage
              width={stageWidth}
              height={stageHeight}
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
        })()
      ) : (
        <div
          className="flex items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-400"
          style={{ height: stageHeight }}
        >
          部屋のサイズを入力してください
        </div>
      )}
    </div>
  );
}
