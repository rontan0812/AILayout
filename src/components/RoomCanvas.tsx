"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Group, Line } from "react-konva";
import type Konva from "konva";
import { FURNITURE_PALETTE } from "./furniturePalette";
import { doorClearanceRects } from "./clearance";
import type { FlowPoint } from "./flowline";

const MAX_WIDTH = 700;
const ASPECT = 500 / 700; // 高さ / 幅
const PADDING_RATIO = 50 / 700;

// 部屋に配置した家具1つ分。位置は部屋の左上を原点とした cm 座標で保持する
// （キャンバスのリサイズでズレないように）。
export type PlacedItem = {
  uid: string;
  type: string; // 家具の種類（ソファ等）
  num: number; // 同じ種類内での連番
  widthCm: number;
  depthCm: number;
  xCm: number;
  yCm: number;
  owned?: boolean; // 手持ち（所有品）なら true。提案・予算の対象外にする
};

// 壁の辺に置く開口部（入口/窓）
export type Opening = {
  id: string;
  wall: "top" | "bottom" | "left" | "right";
  kind: "door" | "window";
  offsetCm: number; // 壁の始点からの中心位置
  widthCm: number;
};

type RoomCanvasProps = {
  widthCm: number;
  depthCm: number;
  placedItems: PlacedItem[];
  openings: Opening[];
  flowPaths: FlowPoint[][];
  onMove: (uid: string, xCm: number, yCm: number) => void;
  onRemove: (uid: string) => void;
};

export default function RoomCanvas({
  widthCm,
  depthCm,
  placedItems,
  openings,
  flowPaths,
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

          // 入口前のクリアランス帯（家具を置けない領域）
          const clearanceRects = doorClearanceRects(openings, widthCm, depthCm);

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

                {clearanceRects.map((r, i) => (
                  <Rect
                    key={`clr-${i}`}
                    x={roomX + r.xCm * scale}
                    y={roomY + r.yCm * scale}
                    width={r.widthCm * scale}
                    height={r.depthCm * scale}
                    fill="#f97316"
                    opacity={0.12}
                    listening={false}
                  />
                ))}

                {openings.map((op) => {
                  const wallLen =
                    op.wall === "top" || op.wall === "bottom" ? widthCm : depthCm;
                  const half = op.widthCm / 2;
                  const center = Math.min(Math.max(op.offsetCm, half), wallLen - half);
                  const start = center - half;
                  const end = center + half;
                  let points: number[];
                  if (op.wall === "top") {
                    points = [roomX + start * scale, roomY, roomX + end * scale, roomY];
                  } else if (op.wall === "bottom") {
                    const y = roomY + roomDepth;
                    points = [roomX + start * scale, y, roomX + end * scale, y];
                  } else if (op.wall === "left") {
                    points = [roomX, roomY + start * scale, roomX, roomY + end * scale];
                  } else {
                    const x = roomX + roomWidth;
                    points = [x, roomY + start * scale, x, roomY + end * scale];
                  }
                  return (
                    <Line
                      key={op.id}
                      points={points}
                      stroke={op.kind === "door" ? "#c2410c" : "#0369a1"}
                      strokeWidth={6}
                      lineCap="round"
                    />
                  );
                })}

                {placedItems.map((item, index) => {
                  const color = FURNITURE_PALETTE[index % FURNITURE_PALETTE.length];
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
                        // 他の家具＋入口前クリアランス帯を障害物として扱う
                        const others = [
                          ...placedItems
                            .filter((o) => o.uid !== item.uid)
                            .map((o) => ({
                              xCm: o.xCm,
                              yCm: o.yCm,
                              widthCm: o.widthCm,
                              depthCm: o.depthCm,
                            })),
                          ...clearanceRects,
                        ];
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
                        fill={item.owned ? "#e5e7eb" : color.fill}
                        opacity={0.9}
                        stroke={item.owned ? "#6b7280" : color.stroke}
                        strokeWidth={2}
                        dash={item.owned ? [6, 4] : undefined}
                        cornerRadius={2}
                      />
                      <Text
                        text={item.owned ? `${item.type}${item.num}（所有）` : `${item.type}${item.num}`}
                        width={w}
                        height={h}
                        padding={2}
                        align="center"
                        verticalAlign="middle"
                        fontSize={10}
                        fontStyle="bold"
                        fill={item.owned ? "#374151" : color.text}
                        ellipsis
                        wrap="none"
                        listening={false}
                      />
                    </Group>
                  );
                })}

                {flowPaths.map((path, i) => (
                  <Line
                    key={`flow-${i}`}
                    points={path.flatMap((p) => [
                      roomX + p.xCm * scale,
                      roomY + p.yCm * scale,
                    ])}
                    stroke="#059669"
                    strokeWidth={3}
                    opacity={0.8}
                    lineCap="round"
                    lineJoin="round"
                    dash={[8, 6]}
                    listening={false}
                  />
                ))}
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
