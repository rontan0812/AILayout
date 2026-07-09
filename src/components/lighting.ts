// 方角・採光・照明の共有モデルと補助関数。
// 真上視点2Dの簡易ライティング。角度はコンパス方位（0=北, 90=東, 180=南, 270=西）で扱う。

export type Direction = { label: string; deg: number };

// 「上の壁が向いている方角」の選択肢（8方位）
export const DIRECTIONS: Direction[] = [
  { label: "北", deg: 0 },
  { label: "北東", deg: 45 },
  { label: "東", deg: 90 },
  { label: "南東", deg: 135 },
  { label: "南", deg: 180 },
  { label: "南西", deg: 225 },
  { label: "西", deg: 270 },
  { label: "北西", deg: 315 },
];

// 部屋に設置する照明
export type Light = {
  id: string;
  kind: "ceiling" | "floor"; // 天井灯 / フロアランプ
  xCm: number;
  yCm: number;
};

export const DEFAULT_NORTH_DEG = 0; // 既定: 上の壁が北向き
export const DEFAULT_TIME = 0.5; // 既定: 正午

// 壁（上下左右）が外向きに向いている方角。northDeg=上の壁の方角。
export function wallFacingDeg(
  wall: "top" | "bottom" | "left" | "right",
  northDeg: number
): number {
  const offset =
    wall === "top" ? 0 : wall === "right" ? 90 : wall === "bottom" ? 180 : 270;
  return (((northDeg + offset) % 360) + 360) % 360;
}

// 時間帯 t(0=朝, 0.5=昼, 1=夕) の表示ラベル
export function timeLabel(t: number): string {
  if (t < 0.2) return "早朝";
  if (t < 0.4) return "午前";
  if (t < 0.6) return "正午";
  if (t < 0.8) return "午後";
  return "夕方";
}

// 太陽のコンパス方位（朝=東90°, 昼=南180°, 夕=西270°）
export function sunAzimuthDeg(t: number): number {
  return 90 + Math.min(Math.max(t, 0), 1) * 180;
}

// 時間帯による全体の明るさ係数（昼が最大、朝夕は低め）
export function timeBrightness(t: number): number {
  return 0.35 + 0.65 * Math.sin(Math.PI * Math.min(Math.max(t, 0), 1));
}
