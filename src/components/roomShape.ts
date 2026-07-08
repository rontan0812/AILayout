// 部屋の形。矩形（rect）に加え、四隅のいずれかを欠いたL字（L）に対応する。
// roomSize(widthCm/depthCm)を外接矩形（バウンディングボックス）として扱い、
// その内側にポリゴン頂点を生成する。

export type RoomCorner = "tl" | "tr" | "bl" | "br";

export type RoomShape =
  | { kind: "rect" }
  | { kind: "L"; corner: RoomCorner; cutWidthCm: number; cutDepthCm: number }
  // 間取り図スキャン等で取り込んだ任意の多角形。points は外接矩形(0..w, 0..d)内のcm座標。
  | { kind: "poly"; points: PolyPoint[] };

export type PolyPoint = { xCm: number; yCm: number };

export type BlockRect = { xCm: number; yCm: number; widthCm: number; depthCm: number };

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
  // 取り込んだ多角形は頂点を部屋内にクランプして返す
  if (shape.kind === "poly") {
    if (shape.points.length < 3) return rect;
    return shape.points.map((p) => ({
      xCm: Math.min(Math.max(p.xCm, 0), w),
      yCm: Math.min(Math.max(p.yCm, 0), d),
    }));
  }
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
): BlockRect | null {
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

// 点(x,y)が多角形の内側かどうか（レイキャスト法）。
export function pointInPolygon(pts: PolyPoint[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].xCm;
    const yi = pts[i].yCm;
    const xj = pts[j].xCm;
    const yj = pts[j].yCm;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// 部屋の外（家具を置けない領域）を矩形の集合で返す。
// rect: なし / L字: 欠けの矩形1つ / poly: 多角形の外側をグリッドで矩形化。
export function roomBlockedRects(shape: RoomShape, w: number, d: number): BlockRect[] {
  if (shape.kind === "L") {
    const cut = roomCutRect(shape, w, d);
    return cut ? [cut] : [];
  }
  if (shape.kind !== "poly" || shape.points.length < 3 || w <= 0 || d <= 0) return [];

  const pts = shape.points;
  // グリッドで外側セルを見つけ、同じ行で連続するものを1つの矩形にまとめる
  const N = 40; // 1辺あたりのセル数（当たり判定の粗さ）
  const cw = w / N;
  const ch = d / N;
  const rects: BlockRect[] = [];
  for (let r = 0; r < N; r++) {
    const cy = (r + 0.5) * ch;
    let runStart = -1;
    for (let c = 0; c <= N; c++) {
      const outside = c < N && !pointInPolygon(pts, (c + 0.5) * cw, cy);
      if (outside && runStart < 0) {
        runStart = c;
      } else if (!outside && runStart >= 0) {
        rects.push({
          xCm: runStart * cw,
          yCm: r * ch,
          widthCm: (c - runStart) * cw,
          depthCm: ch,
        });
        runStart = -1;
      }
    }
  }
  return rects;
}
