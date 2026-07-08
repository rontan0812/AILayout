// 部屋の形。矩形（rect）に加え、四隅のいずれかを欠いたL字（L）に対応する。
// roomSize(widthCm/depthCm)を外接矩形（バウンディングボックス）として扱い、
// その内側にポリゴン頂点を生成する。

export type RoomCorner = "tl" | "tr" | "bl" | "br";

export type RoomShape =
  | { kind: "rect" }
  | { kind: "L"; corner: RoomCorner; cutWidthCm: number; cutDepthCm: number };

export type PolyPoint = { xCm: number; yCm: number };

export const DEFAULT_ROOM_SHAPE: RoomShape = { kind: "rect" };

export const CORNER_LABELS: Record<RoomCorner, string> = {
  tl: "左上",
  tr: "右上",
  bl: "左下",
  br: "右下",
};

// 外接矩形(0,0)-(w,d)の内側に、形状に応じたポリゴン頂点（時計回り）を返す。
export function roomPolygon(shape: RoomShape, w: number, d: number): PolyPoint[] {
  const rect: PolyPoint[] = [
    { xCm: 0, yCm: 0 },
    { xCm: w, yCm: 0 },
    { xCm: w, yCm: d },
    { xCm: 0, yCm: d },
  ];
  if (shape.kind !== "L") return rect;

  // 欠けの大きさを部屋内に収める（両辺とも最低10cmは残す）
  const cw = Math.min(Math.max(shape.cutWidthCm, 0), Math.max(0, w - 10));
  const cd = Math.min(Math.max(shape.cutDepthCm, 0), Math.max(0, d - 10));
  if (cw <= 0 || cd <= 0) return rect;

  switch (shape.corner) {
    case "tr":
      return [
        { xCm: 0, yCm: 0 },
        { xCm: w - cw, yCm: 0 },
        { xCm: w - cw, yCm: cd },
        { xCm: w, yCm: cd },
        { xCm: w, yCm: d },
        { xCm: 0, yCm: d },
      ];
    case "tl":
      return [
        { xCm: cw, yCm: 0 },
        { xCm: w, yCm: 0 },
        { xCm: w, yCm: d },
        { xCm: 0, yCm: d },
        { xCm: 0, yCm: cd },
        { xCm: cw, yCm: cd },
      ];
    case "br":
      return [
        { xCm: 0, yCm: 0 },
        { xCm: w, yCm: 0 },
        { xCm: w, yCm: d - cd },
        { xCm: w - cw, yCm: d - cd },
        { xCm: w - cw, yCm: d },
        { xCm: 0, yCm: d },
      ];
    case "bl":
      return [
        { xCm: 0, yCm: 0 },
        { xCm: w, yCm: 0 },
        { xCm: w, yCm: d },
        { xCm: cw, yCm: d },
        { xCm: cw, yCm: d - cd },
        { xCm: 0, yCm: d - cd },
      ];
  }
}

// L字の欠け（家具を置けない矩形領域）。rectのときはnull。
export function roomCutRect(
  shape: RoomShape,
  w: number,
  d: number
): { xCm: number; yCm: number; widthCm: number; depthCm: number } | null {
  if (shape.kind !== "L") return null;
  const cw = Math.min(Math.max(shape.cutWidthCm, 0), Math.max(0, w - 10));
  const cd = Math.min(Math.max(shape.cutDepthCm, 0), Math.max(0, d - 10));
  if (cw <= 0 || cd <= 0) return null;
  switch (shape.corner) {
    case "tr":
      return { xCm: w - cw, yCm: 0, widthCm: cw, depthCm: cd };
    case "tl":
      return { xCm: 0, yCm: 0, widthCm: cw, depthCm: cd };
    case "br":
      return { xCm: w - cw, yCm: d - cd, widthCm: cw, depthCm: cd };
    case "bl":
      return { xCm: 0, yCm: d - cd, widthCm: cw, depthCm: cd };
  }
}
