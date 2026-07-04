"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Group } from "react-konva";
import type Konva from "konva";

const MAX_WIDTH = 700;
const ASPECT = 500 / 700; // 高さ / 幅
const PADDING_RATIO = 50 / 700;

// 部屋に配置した家具1つ分。位置は部屋の左上を原点とした cm 座標で保持する
// （キャンバスのリサイズでズレないように）。
export type PlacedItem = {
  uid: string;
  name: string;
  price: number;
  widthCm: number;
  depthCm: number;
  xCm: number;
  yCm: number;
};

type RoomCanvasProps = {
  widthCm: number;
  depthCm: number;
  placedItems: PlacedItem[];
  onMove: (uid: string, xCm: number, yCm: number) => void;
  onRemove: (uid: string) => void;
};

export default function RoomCanvas({
  widthCm,
  depthCm,
  placedItems,
  onMove,
  onRemove,
}: RoomCanvasProps) {
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

                {placedItems.map((item) => {
                  const w = item.widthCm * scale;
                  const h = item.depthCm * scale;
                  // 部屋からはみ出さない範囲に位置を丸める
                  const maxXCm = Math.max(0, widthCm - item.widthCm);
                  const maxYCm = Math.max(0, depthCm - item.depthCm);
                  const clampedXCm = Math.min(Math.max(0, item.xCm), maxXCm);
                  const clampedYCm = Math.min(Math.max(0, item.yCm), maxYCm);

                  return (
                    <Group
                      key={item.uid}
                      x={roomX + clampedXCm * scale}
                      y={roomY + clampedYCm * scale}
                      draggable
                      dragBoundFunc={function (
                        this: Konva.Node,
                        pos: { x: number; y: number }
                      ) {
                        const others = placedItems.filter((o) => o.uid !== item.uid);
                        const prevX = this.x();
                        const prevY = this.y();

                        // まず部屋の中に収める
                        let px = Math.min(Math.max(pos.x, roomX), roomX + roomWidth - w);
                        let py = Math.min(Math.max(pos.y, roomY), roomY + roomDepth - h);

                        // X軸: 移動前のY帯で重なる家具の手前で止める（壁のように）
                        const prevYCm = (prevY - roomY) / scale;
                        let xCm = (px - roomX) / scale;
                        for (const o of others) {
                          const yBandOverlap = !(
                            prevYCm + item.depthCm <= o.yCm || prevYCm >= o.yCm + o.depthCm
                          );
                          if (!yBandOverlap) continue;
                          if (px > prevX) xCm = Math.min(xCm, o.xCm - item.widthCm);
                          else if (px < prevX) xCm = Math.max(xCm, o.xCm + o.widthCm);
                        }
                        xCm = Math.min(Math.max(xCm, 0), widthCm - item.widthCm);
                        px = roomX + xCm * scale;

                        // Y軸: 確定したX列で重なる家具の手前で止める
                        let yCm = (py - roomY) / scale;
                        for (const o of others) {
                          const xBandOverlap = !(
                            xCm + item.widthCm <= o.xCm || xCm >= o.xCm + o.widthCm
                          );
                          if (!xBandOverlap) continue;
                          if (py > prevY) yCm = Math.min(yCm, o.yCm - item.depthCm);
                          else if (py < prevY) yCm = Math.max(yCm, o.yCm + o.depthCm);
                        }
                        yCm = Math.min(Math.max(yCm, 0), depthCm - item.depthCm);
                        py = roomY + yCm * scale;

                        return { x: px, y: py };
                      }}
                      onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                        const node = e.target;
                        onMove(
                          item.uid,
                          (node.x() - roomX) / scale,
                          (node.y() - roomY) / scale
                        );
                      }}
                      onDblClick={() => onRemove(item.uid)}
                      onDblTap={() => onRemove(item.uid)}
                    >
                      <Rect
                        width={w}
                        height={h}
                        fill="#93c5fd"
                        opacity={0.85}
                        stroke="#2563eb"
                        strokeWidth={2}
                        cornerRadius={2}
                      />
                      <Text
                        text={item.name}
                        width={w}
                        height={h}
                        padding={2}
                        align="center"
                        verticalAlign="middle"
                        fontSize={10}
                        fill="#1e3a8a"
                        ellipsis
                        wrap="none"
                        listening={false}
                      />
                    </Group>
                  );
                })}
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
