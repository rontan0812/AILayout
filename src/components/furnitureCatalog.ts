// 実物を参照せずに置ける家具枠のプリセット（標準サイズ, cm）。
// widthCm=横, depthCm=奥行。サイズは配置後に一覧から編集できる。
export type FurniturePreset = {
  type: string;
  widthCm: number;
  depthCm: number;
};

export const FURNITURE_PRESETS: FurniturePreset[] = [
  { type: "ソファ", widthCm: 180, depthCm: 85 },
  { type: "ダイニングテーブル", widthCm: 120, depthCm: 75 },
  { type: "ローテーブル", widthCm: 100, depthCm: 50 },
  { type: "ベッド", widthCm: 100, depthCm: 200 },
  { type: "デスク", widthCm: 120, depthCm: 60 },
  { type: "チェア", widthCm: 50, depthCm: 50 },
  { type: "本棚", widthCm: 90, depthCm: 30 },
  { type: "テレビ台", widthCm: 150, depthCm: 40 },
  { type: "チェスト", widthCm: 80, depthCm: 45 },
  { type: "ワードローブ", widthCm: 90, depthCm: 60 },
];
