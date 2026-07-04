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
  // ドラッグ中の家具の「前フレーム位置」（cm）。貫通防止の基準に使う。
  const dragRef = useRef<{ x: number; y: number } | null>(null);

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
                      onDragStart={() => {
                        dragRef.current = { x: clampedXCm, y: clampedYCm };
                      }}
                      dragBoundFunc={(pos) => {
                        const others = placedItems.filter((o) => o.uid !== item.uid);
                        const iw = item.widthCm;
                        const id = item.depthCm;
                        const prev = dragRef.current ?? { x: clampedXCm, y: clampedYCm };
                        // 提案位置（部屋内にクランプ）
                        const targetX = Math.min(
                          Math.max((pos.x - roomX) / scale, 0),
                          widthCm - iw
                        );
                        const targetY = Math.min(
                          Math.max((pos.y - roomY) / scale, 0),
                          depthCm - id
                        );

                        // X軸: 進行方向にある家具の手前で止める（前フレーム位置基準なので貫通しない）
                        let nx = targetX;
                        for (const o of others) {
                          // 前フレームのY帯で重なっていなければ、その家具はこの行に無い
                          if (prev.y + id <= o.yCm || prev.y >= o.yCm + o.depthCm) continue;
                          if (targetX > prev.x && prev.x + iw <= o.xCm) {
                            nx = Math.min(nx, o.xCm - iw); // 右へ移動中: 左面で止める
                          } else if (targetX < prev.x && prev.x >= o.xCm + o.widthCm) {
                            nx = Math.max(nx, o.xCm + o.widthCm); // 左へ移動中: 右面で止める
                          }
                        }
                        nx = Math.min(Math.max(nx, 0), widthCm - iw);

                        // Y軸: 確定したX列で進行方向にある家具の手前で止める
                        let ny = targetY;
                        for (const o of others) {
                          if (nx + iw <= o.xCm || nx >= o.xCm + o.widthCm) continue;
                          if (targetY > prev.y && prev.y + id <= o.yCm) {
                            ny = Math.min(ny, o.yCm - id); // 下へ移動中: 上面で止める
                          } else if (targetY < prev.y && prev.y >= o.yCm + o.depthCm) {
                            ny = Math.max(ny, o.yCm + o.depthCm); // 上へ移動中: 下面で止める
                          }
                        }
                        ny = Math.min(Math.max(ny, 0), depthCm - id);

                        dragRef.current = { x: nx, y: ny };
                        return { x: roomX + nx * scale, y: roomY + ny * scale };
                      }}
                      onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                        const node = e.target;
                        dragRef.current = null;
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
