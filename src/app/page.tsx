"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import RoomSizeForm, { type RoomSize } from "@/components/RoomSizeForm";
import FurniturePresetPanel from "@/components/FurniturePresetPanel";
import OpeningPanel from "@/components/OpeningPanel";
import ProposalPanel from "@/components/ProposalPanel";
import DataPanel from "@/components/DataPanel";
import { STORAGE_KEY } from "@/components/storageKeys";
import { computeFlowPaths, FLOW_MIN_WIDTH_CM } from "@/components/flowline";
import type { FurniturePreset } from "@/components/furnitureCatalog";
import type { PlacedItem, Opening } from "@/components/RoomCanvas";
import { FURNITURE_PALETTE } from "@/components/furniturePalette";
import {
  doorClearanceRects,
  openingFrontRect,
  WINDOW_FRONT_CM,
  type ClearRect,
} from "@/components/clearance";

// 既存の家具と重ならない配置位置（cm）を探す。空きが無ければ左上へ。
function findFreePosition(
  items: PlacedItem[],
  roomW: number,
  roomD: number,
  itemW: number,
  itemD: number,
  avoid: ClearRect[]
): { x: number; y: number } {
  const overlaps = (
    x: number,
    y: number,
    rx: number,
    ry: number,
    rw: number,
    rd: number
  ) => !(x + itemW <= rx || x >= rx + rw || y + itemD <= ry || y >= ry + rd);

  const cols = Math.max(1, Math.floor(roomW / itemW));
  const rows = Math.max(1, Math.floor(roomD / itemD));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * itemW;
      const y = r * itemD;
      if (x + itemW > roomW || y + itemD > roomD) continue;
      const hit =
        items.some((i) => overlaps(x, y, i.xCm, i.yCm, i.widthCm, i.depthCm)) ||
        avoid.some((a) => overlaps(x, y, a.xCm, a.yCm, a.widthCm, a.depthCm));
      if (!hit) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

// Konva はブラウザの canvas API に依存するため SSR を無効化する
const RoomCanvas = dynamic(() => import("@/components/RoomCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-[7/5] w-full max-w-[700px] items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-400">
      キャンバスを読み込み中...
    </div>
  ),
});

// Three.js もブラウザ専用なので SSR を無効化する
const Room3D = dynamic(() => import("@/components/Room3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] w-full max-w-[700px] items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-400">
      3Dプレビューを読み込み中...
    </div>
  ),
});

export default function Home() {
  const [roomSize, setRoomSize] = useState<RoomSize>({ widthCm: 360, depthCm: 270 });
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [budget, setBudget] = useState<number>(0);
  const [showFlow, setShowFlow] = useState(true);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  // localStorage 読み込み完了フラグ（読み込み前の初期値で保存して上書きしないため）
  const [loaded, setLoaded] = useState(false);

  // 初回マウント時に保存済みデータを復元
  // （SSRとのハイドレーション不一致を避けるため、意図的にマウント後に反映する）
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.roomSize) setRoomSize(saved.roomSize);
        if (Array.isArray(saved.placedItems)) setPlacedItems(saved.placedItems);
        if (Array.isArray(saved.openings)) setOpenings(saved.openings);
        if (typeof saved.budget === "number") setBudget(saved.budget);
      }
    } catch {
      // 壊れたデータは無視して初期状態で始める
    }
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 変更のたびに保存（リロードしても残る）
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ roomSize, placedItems, openings, budget })
      );
    } catch {
      // 保存に失敗しても致命的ではないので無視
    }
  }, [roomSize, placedItems, openings, budget, loaded]);

  const handlePlacePreset = (preset: FurniturePreset, owned: boolean) => {
    setPlacedItems((prev) => {
      const { x, y } = findFreePosition(
        prev,
        roomSize.widthCm,
        roomSize.depthCm,
        preset.widthCm,
        preset.depthCm,
        doorClearanceRects(openings, roomSize.widthCm, roomSize.depthCm)
      );
      // 同じ種類の中での連番
      const num = prev.filter((i) => i.type === preset.type).length + 1;
      return [
        ...prev,
        {
          uid: crypto.randomUUID(),
          type: preset.type,
          num,
          widthCm: preset.widthCm,
          depthCm: preset.depthCm,
          xCm: x,
          yCm: y,
          owned,
        },
      ];
    });
  };

  const handleMove = (uid: string, xCm: number, yCm: number) => {
    setPlacedItems((prev) =>
      prev.map((i) => (i.uid === uid ? { ...i, xCm, yCm } : i))
    );
  };

  const handleRemove = (uid: string) => {
    setPlacedItems((prev) => prev.filter((i) => i.uid !== uid));
  };

  const handleResize = (
    uid: string,
    key: "widthCm" | "depthCm",
    value: number
  ) => {
    setPlacedItems((prev) =>
      prev.map((i) => {
        if (i.uid !== uid) return i;
        const v = Number.isFinite(value) ? Math.max(1, Math.round(value)) : i[key];
        const next = { ...i, [key]: v };
        // 部屋の外にはみ出さないよう位置を丸める
        next.xCm = Math.min(next.xCm, Math.max(0, roomSize.widthCm - next.widthCm));
        next.yCm = Math.min(next.yCm, Math.max(0, roomSize.depthCm - next.depthCm));
        return next;
      })
    );
  };

  const handleAddOpening = (opening: Omit<Opening, "id">) => {
    // 幅と中心位置を壁の長さに収める
    const wallLen =
      opening.wall === "top" || opening.wall === "bottom"
        ? roomSize.widthCm
        : roomSize.depthCm;
    const widthCm = Math.max(10, Math.min(Math.round(opening.widthCm), wallLen));
    const half = widthCm / 2;
    const offsetCm = Math.min(Math.max(Math.round(opening.offsetCm), half), wallLen - half);
    setOpenings((prev) => [
      ...prev,
      { id: crypto.randomUUID(), wall: opening.wall, kind: opening.kind, widthCm, offsetCm },
    ]);
  };

  const handleRemoveOpening = (id: string) => {
    setOpenings((prev) => prev.filter((o) => o.id !== id));
  };

  const handleRotate = (uid: string) => {
    // 90°回転＝横と奥行を入れ替える（四角い枠なのでこれで十分）
    setPlacedItems((prev) =>
      prev.map((i) => {
        if (i.uid !== uid) return i;
        const next = { ...i, widthCm: i.depthCm, depthCm: i.widthCm };
        next.xCm = Math.min(next.xCm, Math.max(0, roomSize.widthCm - next.widthCm));
        next.yCm = Math.min(next.yCm, Math.max(0, roomSize.depthCm - next.depthCm));
        return next;
      })
    );
  };

  // 窓の前に家具が重なっているか（塞ぎ警告用）
  const blockedWindowCount = openings
    .filter((op) => op.kind === "window")
    .filter((op) => {
      const r = openingFrontRect(op, roomSize.widthCm, roomSize.depthCm, WINDOW_FRONT_CM);
      return placedItems.some(
        (i) =>
          !(
            i.xCm + i.widthCm <= r.xCm ||
            i.xCm >= r.xCm + r.widthCm ||
            i.yCm + i.depthCm <= r.yCm ||
            i.yCm >= r.yCm + r.depthCm
          )
      );
    }).length;

  // 生活動線（入口どうしを家具を避けて結ぶ経路）
  const flowPaths = computeFlowPaths(
    roomSize.widthCm,
    roomSize.depthCm,
    placedItems,
    openings
  );

  const sizeInputClass =
    "w-14 rounded border border-stone-300 px-1 py-0.5 text-right text-xs text-stone-800 focus:border-blue-500 focus:outline-none";

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-stone-100 p-4 sm:p-8">
      <h1 className="text-xl font-bold text-stone-800 sm:text-2xl">家具配置シミュレーター</h1>
      <div className="flex w-full max-w-5xl flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-center">
        <div className="flex w-full max-w-[700px] flex-col items-center gap-6">
          <RoomSizeForm value={roomSize} onChange={setRoomSize} />
          <div className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
            <label htmlFor="budget" className="text-sm text-stone-600">
              全体予算
            </label>
            <div className="flex items-center gap-1">
              <span className="text-stone-500">¥</span>
              <input
                id="budget"
                type="number"
                min={0}
                step={1000}
                value={budget || ""}
                onChange={(e) =>
                  setBudget(
                    Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0
                  )
                }
                placeholder="例: 200000"
                className="w-36 rounded-md border border-stone-300 px-2 py-1 text-right text-stone-800 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex w-full items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-md border border-stone-300">
              <button
                type="button"
                onClick={() => setViewMode("2d")}
                className={`px-4 py-1.5 text-sm ${
                  viewMode === "2d"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-stone-600 hover:bg-stone-100"
                }`}
              >
                2D
              </button>
              <button
                type="button"
                onClick={() => setViewMode("3d")}
                className={`px-4 py-1.5 text-sm ${
                  viewMode === "3d"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-stone-600 hover:bg-stone-100"
                }`}
              >
                3D
              </button>
            </div>
            <span className="text-xs text-stone-500">
              {viewMode === "2d"
                ? "真上から編集"
                : "立体プレビュー（ドラッグで回転・ホイールでズーム）"}
            </span>
          </div>

          {viewMode === "2d" ? (
            <>
              <RoomCanvas
                widthCm={roomSize.widthCm}
                depthCm={roomSize.depthCm}
                placedItems={placedItems}
                openings={openings}
                flowPaths={showFlow ? flowPaths : []}
                onMove={handleMove}
                onRemove={handleRemove}
              />
              {showFlow && flowPaths.some((p) => p.narrow.some((n) => n)) && (
                <div className="w-full rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                  ⚠️ 動線が狭い箇所があります（幅 {FLOW_MIN_WIDTH_CM}cm 未満・赤い区間）。家具の配置を見直すと通りやすくなります。
                </div>
              )}
              {flowPaths.length > 0 && (
                <label className="flex w-full items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600">
                  <input
                    type="checkbox"
                    checked={showFlow}
                    onChange={(e) => setShowFlow(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span
                    className="inline-block h-1 w-6 shrink-0 rounded"
                    style={{ background: "#059669" }}
                  />
                  生活動線（入口間の通路）を表示
                </label>
              )}
            </>
          ) : (
            <Room3D
              widthCm={roomSize.widthCm}
              depthCm={roomSize.depthCm}
              placedItems={placedItems}
              openings={openings}
            />
          )}
          {blockedWindowCount > 0 && (
            <div className="w-full rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              ⚠️ 窓の前に家具があります（{blockedWindowCount}箇所）。窓を塞いでいないか確認してください。
            </div>
          )}
          {placedItems.length > 0 && (
            <div className="flex w-full flex-col gap-2">
              <ul className="flex flex-col gap-1.5">
                {placedItems.map((item, index) => {
                  const color = FURNITURE_PALETTE[index % FURNITURE_PALETTE.length];
                  return (
                    <li
                      key={item.uid}
                      className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2"
                    >
                      <span
                        className="h-4 w-4 shrink-0 rounded"
                        style={{
                          backgroundColor: color.fill,
                          border: `2px solid ${color.stroke}`,
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">
                        {item.type}
                        {item.num}
                        {item.owned && (
                          <span className="ml-1 rounded bg-stone-200 px-1 py-0.5 text-xs font-medium text-stone-600">
                            所有
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-stone-500">
                        <input
                          type="number"
                          min={1}
                          value={item.widthCm}
                          onChange={(e) =>
                            handleResize(item.uid, "widthCm", e.target.valueAsNumber)
                          }
                          className={sizeInputClass}
                          aria-label="横(cm)"
                        />
                        ×
                        <input
                          type="number"
                          min={1}
                          value={item.depthCm}
                          onChange={(e) =>
                            handleResize(item.uid, "depthCm", e.target.valueAsNumber)
                          }
                          className={sizeInputClass}
                          aria-label="奥行(cm)"
                        />
                        cm
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRotate(item.uid)}
                        aria-label="90度回転"
                        title="90°回転"
                        className="shrink-0 rounded px-1 text-base leading-none text-stone-400 hover:text-blue-600"
                      >
                        ⟳
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(item.uid)}
                        aria-label="削除"
                        className="shrink-0 rounded px-1 text-lg leading-none text-stone-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-stone-500">
                家具はドラッグで移動、ダブルタップまたは × で削除できます
              </p>
            </div>
          )}
        </div>
        <div className="flex w-full max-w-md flex-col gap-6 lg:w-72">
          <FurniturePresetPanel onPlace={handlePlacePreset} />
          <OpeningPanel
            openings={openings}
            onAdd={handleAddOpening}
            onRemove={handleRemoveOpening}
          />
          <DataPanel />
        </div>
      </div>
      <ProposalPanel placedItems={placedItems} budget={budget} />
    </main>
  );
}
