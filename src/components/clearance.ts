import type { Opening } from "./RoomCanvas";

// 入口(ドア)の前に確保する通行/開閉スペース（cm）
export const DOOR_CLEARANCE_CM = 60;
// 窓の前で家具の重なりを警告する判定深さ（cm）
export const WINDOW_FRONT_CM = 60;

// 家具を置けない/塞ぎ判定に使う矩形領域（cm, 部屋の左上が原点）
export type ClearRect = {
  xCm: number;
  yCm: number;
  widthCm: number;
  depthCm: number;
};

// 開口部の前面（室内側）に指定の深さの矩形を作る。
export function openingFrontRect(
  op: Opening,
  roomW: number,
  roomD: number,
  depth: number
): ClearRect {
  const wallLen = op.wall === "top" || op.wall === "bottom" ? roomW : roomD;
  const half = op.widthCm / 2;
  const center = Math.min(Math.max(op.offsetCm, half), wallLen - half);
  const start = center - half;
  const w = op.widthCm;
  if (op.wall === "top") {
    return { xCm: start, yCm: 0, widthCm: w, depthCm: Math.min(depth, roomD) };
  }
  if (op.wall === "bottom") {
    return { xCm: start, yCm: Math.max(0, roomD - depth), widthCm: w, depthCm: Math.min(depth, roomD) };
  }
  if (op.wall === "left") {
    return { xCm: 0, yCm: start, widthCm: Math.min(depth, roomW), depthCm: w };
  }
  return { xCm: Math.max(0, roomW - depth), yCm: start, widthCm: Math.min(depth, roomW), depthCm: w };
}

// 入口の前に確保するクリアランス帯（家具を置けない領域。窓は対象外）。
export function doorClearanceRects(
  openings: Opening[],
  roomW: number,
  roomD: number
): ClearRect[] {
  return openings
    .filter((op) => op.kind === "door")
    .map((op) => openingFrontRect(op, roomW, roomD, DOOR_CLEARANCE_CM));
}
