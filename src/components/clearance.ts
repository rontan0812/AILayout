import type { Opening } from "./RoomCanvas";

// 入口(ドア)の前に確保する通行/開閉スペース（cm）
export const DOOR_CLEARANCE_CM = 60;

// 家具を置けない矩形領域（cm, 部屋の左上が原点）
export type ClearRect = {
  xCm: number;
  yCm: number;
  widthCm: number;
  depthCm: number;
};

// 入口の前に確保するクリアランス帯を計算する（窓は対象外）。
export function doorClearanceRects(
  openings: Opening[],
  roomW: number,
  roomD: number
): ClearRect[] {
  const c = DOOR_CLEARANCE_CM;
  const rects: ClearRect[] = [];
  for (const op of openings) {
    if (op.kind !== "door") continue;
    const wallLen = op.wall === "top" || op.wall === "bottom" ? roomW : roomD;
    const half = op.widthCm / 2;
    const center = Math.min(Math.max(op.offsetCm, half), wallLen - half);
    const start = center - half;
    const w = op.widthCm;
    if (op.wall === "top") {
      rects.push({ xCm: start, yCm: 0, widthCm: w, depthCm: Math.min(c, roomD) });
    } else if (op.wall === "bottom") {
      rects.push({ xCm: start, yCm: Math.max(0, roomD - c), widthCm: w, depthCm: Math.min(c, roomD) });
    } else if (op.wall === "left") {
      rects.push({ xCm: 0, yCm: start, widthCm: Math.min(c, roomW), depthCm: w });
    } else {
      rects.push({ xCm: Math.max(0, roomW - c), yCm: start, widthCm: Math.min(c, roomW), depthCm: w });
    }
  }
  return rects;
}
