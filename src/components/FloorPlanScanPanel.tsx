"use client";

import { useRef, useState } from "react";
import { extractRoomContour, contourToRoomPoints } from "./floorplanScan";
import type { RoomShape } from "./roomShape";

type FloorPlanScanPanelProps = {
  roomSize: { widthCm: number; depthCm: number };
  onDetect: (shape: RoomShape) => void;
};

// 処理を軽くするための最大解像度（長辺）
const MAX_DIM = 256;

// 間取り図画像をアップロードし、部屋の輪郭を自動抽出して形状に取り込む。
export default function FloorPlanScanPanel({ roomSize, onDetect }: FloorPlanScanPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setStatus("画像を読み込み中...");
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(4, Math.round(bitmap.width * scale));
      const h = Math.max(4, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setStatus("画像の処理に失敗しました。");
        return;
      }
      ctx.drawImage(bitmap, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      setStatus("輪郭を解析中...");
      const contour = extractRoomContour(img.data, w, h);
      if (!contour || contour.length < 3) {
        setStatus("部屋の輪郭を検出できませんでした。枠がはっきり写った画像でお試しください。");
        return;
      }
      const points = contourToRoomPoints(contour, roomSize.widthCm, roomSize.depthCm);
      onDetect({ kind: "poly", points });
      setStatus(`取り込み完了（頂点${points.length}個）。全体サイズは「部屋のサイズ」で調整できます。`);
    } catch {
      setStatus("画像の読み込みに失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex w-full max-w-md flex-col gap-3 lg:w-72">
      <h2 className="text-lg font-semibold text-stone-800">間取り図スキャン</h2>
      <p className="text-xs text-stone-500">
        間取り図の画像から部屋の輪郭を自動で読み取り、形状に取り込みます。白地に壁の線がはっきり描かれた画像が得意です。読み取り後は形が「取り込んだ間取り」になり、全体サイズは「部屋のサイズ」で調整します。
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "解析中..." : "画像を選んで読み取り"}
      </button>
      {status && <p className="text-xs text-stone-600">{status}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
    </section>
  );
}
