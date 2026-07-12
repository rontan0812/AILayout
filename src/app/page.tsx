"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import RoomSizeForm, { type RoomSize } from "@/components/RoomSizeForm";
import FurniturePresetPanel from "@/components/FurniturePresetPanel";
import OpeningPanel from "@/components/OpeningPanel";
import ProposalPanel from "@/components/ProposalPanel";
import DataPanel from "@/components/DataPanel";
import RoomShapePanel from "@/components/RoomShapePanel";
import FloorPlanScanPanel from "@/components/FloorPlanScanPanel";
import AutoLayoutPanel from "@/components/AutoLayoutPanel";
import BudgetLayoutPanel from "@/components/BudgetLayoutPanel";
import ScorePanel from "@/components/ScorePanel";
import CollapsibleSection from "@/components/CollapsibleSection";
import LightingPanel from "@/components/LightingPanel";
import LightFixturePanel from "@/components/LightFixturePanel";
import SharePanel from "@/components/SharePanel";
import ShareBanner from "@/components/ShareBanner";
import { useSharedRoom, type RoomDoc } from "@/components/useSharedRoom";
import {
  DEFAULT_NORTH_DEG,
  DEFAULT_TIME,
  computeLightGrid,
  type Light,
} from "@/components/lighting";
import { autoLayout, type LayoutRequest } from "@/components/autoLayout";
import { scoreLayout } from "@/components/layoutScore";
import {
  DEFAULT_ROOM_SHAPE,
  roomPolygon as computeRoomPolygon,
  roomBlockedRects,
  type RoomShape,
} from "@/components/roomShape";
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

// Undo/Redo で扱う配置系のスナップショット
type HistSnapshot = { placedItems: PlacedItem[]; openings: Opening[]; lights: Light[] };
const snapEqual = (a: HistSnapshot, b: HistSnapshot) =>
  JSON.stringify(a) === JSON.stringify(b);

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
  const [roomShape, setRoomShape] = useState<RoomShape>(DEFAULT_ROOM_SHAPE);
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [budget, setBudget] = useState<number>(0);
  const [showFlow, setShowFlow] = useState(true);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  // 設定ドロワー（サイドバー）の開閉。既定は閉じてコンパクトに。
  const [menuOpen, setMenuOpen] = useState(false);
  // 方角（上の壁が向く方位）と時間帯
  const [northDeg, setNorthDeg] = useState(DEFAULT_NORTH_DEG);
  const [timeOfDay, setTimeOfDay] = useState(DEFAULT_TIME);
  const [showLight, setShowLight] = useState(false);
  const [lights, setLights] = useState<Light[]>([]);
  // 自動レイアウトの結果メッセージ（置ききれなかった等）
  const [layoutNote, setLayoutNote] = useState("");
  // 直近の自動レイアウト要求（別案生成に使う）と別案シード
  const [lastRequests, setLastRequests] = useState<LayoutRequest[] | null>(null);
  const [rerollSeed, setRerollSeed] = useState(0);
  // 採点の減点理由にホバー中、キャンバスで強調する家具と該当減点ID
  const [highlightUids, setHighlightUids] = useState<string[]>([]);
  const [activeDeduction, setActiveDeduction] = useState<string | null>(null);
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
        if (saved.roomShape) setRoomShape(saved.roomShape);
        if (Array.isArray(saved.placedItems)) setPlacedItems(saved.placedItems);
        if (Array.isArray(saved.openings)) setOpenings(saved.openings);
        if (typeof saved.budget === "number") setBudget(saved.budget);
        if (typeof saved.northDeg === "number") setNorthDeg(saved.northDeg);
        if (typeof saved.timeOfDay === "number") setTimeOfDay(saved.timeOfDay);
        if (Array.isArray(saved.lights)) setLights(saved.lights);
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
        JSON.stringify({
          roomSize,
          roomShape,
          placedItems,
          openings,
          budget,
          northDeg,
          timeOfDay,
          lights,
        })
      );
    } catch {
      // 保存に失敗しても致命的ではないので無視
    }
  }, [roomSize, roomShape, placedItems, openings, budget, northDeg, timeOfDay, lights, loaded]);

  // --- 共有ルーム同期（T-共有-2）---
  // 共有対象のドキュメント（localStorage と同じ内容）をJSON化。
  // 文字列は内容が変わらない限り値が同じなので、送信effectの無駄な再実行を防げる。
  const shareDocJson = loaded
    ? JSON.stringify({
        roomSize,
        roomShape,
        placedItems,
        openings,
        budget,
        northDeg,
        timeOfDay,
        lights,
      })
    : "";
  // リモートから受け取った状態をローカルへ反映する
  const applyRemoteDoc = useCallback((d: RoomDoc) => {
    const r = d as Record<string, unknown>;
    if (r.roomSize) setRoomSize(r.roomSize as RoomSize);
    if (r.roomShape) setRoomShape(r.roomShape as RoomShape);
    if (Array.isArray(r.placedItems)) setPlacedItems(r.placedItems as PlacedItem[]);
    if (Array.isArray(r.openings)) setOpenings(r.openings as Opening[]);
    if (typeof r.budget === "number") setBudget(r.budget);
    if (typeof r.northDeg === "number") setNorthDeg(r.northDeg);
    if (typeof r.timeOfDay === "number") setTimeOfDay(r.timeOfDay);
    if (Array.isArray(r.lights)) setLights(r.lights as Light[]);
  }, []);
  const share = useSharedRoom({
    docJson: shareDocJson,
    applyRemote: applyRemoteDoc,
    ready: loaded,
  });

  // --- Undo/Redo（配置系: 家具・開口部・照明の履歴） ---
  const historyRef = useRef<{ past: HistSnapshot[]; present: HistSnapshot | null; future: HistSnapshot[] }>({
    past: [],
    present: null,
    future: [],
  });
  const isRestoringRef = useRef(false);
  const [{ canUndo, canRedo }, setHistState] = useState({ canUndo: false, canRedo: false });
  const syncHist = () => {
    const h = historyRef.current;
    setHistState({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
  };

  useEffect(() => {
    if (!loaded) return;
    const snap: HistSnapshot = { placedItems, openings, lights };
    const h = historyRef.current;
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      h.present = snap;
      return;
    }
    if (h.present === null) {
      h.present = snap;
      return;
    }
    if (snapEqual(h.present, snap)) return;
    h.past.push(h.present);
    if (h.past.length > 50) h.past.shift();
    h.present = snap;
    h.future = [];
    syncHist();
  }, [placedItems, openings, lights, loaded]);

  const applySnapshot = (s: HistSnapshot) => {
    isRestoringRef.current = true;
    setPlacedItems(s.placedItems);
    setOpenings(s.openings);
    setLights(s.lights);
  };
  const undo = () => {
    const h = historyRef.current;
    if (h.past.length === 0 || h.present === null) return;
    h.future.unshift(h.present);
    const prev = h.past.pop() as HistSnapshot;
    h.present = prev;
    applySnapshot(prev);
    syncHist();
  };
  const redo = () => {
    const h = historyRef.current;
    if (h.future.length === 0 || h.present === null) return;
    h.past.push(h.present);
    const next = h.future.shift() as HistSnapshot;
    h.present = next;
    applySnapshot(next);
    syncHist();
  };

  // キーボードショートカット（Ctrl/Cmd+Z で取消、Shift付き or Ctrl+Y でやり直し）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 部屋外の欠け領域（家具を置けない矩形。L字の凹みや取り込んだ多角形の外側）
  const blockedRects = roomBlockedRects(roomShape, roomSize.widthCm, roomSize.depthCm);

  // 家具リストから自動レイアウトを生成し、非所有の家具枠を置き換える。
  const applyAutoLayout = (requests: LayoutRequest[], seed: number) => {
    const owned = placedItems.filter((i) => i.owned);
    const polygon = computeRoomPolygon(roomShape, roomSize.widthCm, roomSize.depthCm);
    const res = autoLayout({
      roomW: roomSize.widthCm,
      roomD: roomSize.depthCm,
      polygon,
      blockedRects,
      openings,
      ownedItems: owned,
      requests,
      seed,
    });
    setPlacedItems([...owned, ...res.items]);
    if (res.unplaced.length > 0) {
      const summary = res.unplaced.map((u) => `${u.type}×${u.count}`).join("、");
      setLayoutNote(`置ききれなかった家具があります: ${summary}。部屋を広げるか数を減らしてください。`);
    } else {
      setLayoutNote("");
    }
  };

  const runAutoLayout = (requests: LayoutRequest[]) => {
    setLastRequests(requests);
    setRerollSeed(0);
    applyAutoLayout(requests, 0);
  };

  // 同じ家具リストで別の配置案を生成する
  const handleReroll = () => {
    if (!lastRequests) return;
    const seed = rerollSeed + 1;
    setRerollSeed(seed);
    applyAutoLayout(lastRequests, seed);
  };

  // 自動配置した家具枠（非所有）を消す
  const handleClearLayout = () => {
    setPlacedItems((prev) => prev.filter((i) => i.owned));
    setLayoutNote("");
  };

  const handlePlacePreset = (preset: FurniturePreset, owned: boolean) => {
    setPlacedItems((prev) => {
      const { x, y } = findFreePosition(
        prev,
        roomSize.widthCm,
        roomSize.depthCm,
        preset.widthCm,
        preset.depthCm,
        [...doorClearanceRects(openings, roomSize.widthCm, roomSize.depthCm), ...blockedRects]
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

  // 家具を複製して少しずらして置く
  const handleDuplicate = (uid: string) => {
    setPlacedItems((prev) => {
      const src = prev.find((i) => i.uid === uid);
      if (!src) return prev;
      const num = prev.filter((i) => i.type === src.type).length + 1;
      const offset = 20;
      const x = Math.min(src.xCm + offset, Math.max(0, roomSize.widthCm - src.widthCm));
      const y = Math.min(src.yCm + offset, Math.max(0, roomSize.depthCm - src.depthCm));
      return [...prev, { ...src, uid: crypto.randomUUID(), num, xCm: x, yCm: y }];
    });
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

  const handleAddLight = (kind: Light["kind"]) => {
    // 中央付近に少しずらして追加（重ならないように）
    const n = lights.length;
    const x = Math.min(roomSize.widthCm - 10, roomSize.widthCm / 2 + (n % 3) * 30);
    const y = Math.min(roomSize.depthCm - 10, roomSize.depthCm / 2 + (n % 2) * 30);
    setLights((prev) => [...prev, { id: crypto.randomUUID(), kind, xCm: x, yCm: y }]);
  };

  const handleMoveLight = (id: string, xCm: number, yCm: number) => {
    setLights((prev) => prev.map((l) => (l.id === id ? { ...l, xCm, yCm } : l)));
  };

  const handleRemoveLight = (id: string) => {
    setLights((prev) => prev.filter((l) => l.id !== id));
  };

  const handleMoveOpening = (id: string, offsetCm: number) => {
    setOpenings((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const wallLen =
          o.wall === "top" || o.wall === "bottom" ? roomSize.widthCm : roomSize.depthCm;
        const half = o.widthCm / 2;
        const clamped = Math.min(Math.max(Math.round(offsetCm), half), wallLen - half);
        return { ...o, offsetCm: clamped };
      })
    );
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
    openings,
    blockedRects
  );

  // 部屋の形（矩形/L字）のポリゴン頂点
  const roomPolygon = computeRoomPolygon(roomShape, roomSize.widthCm, roomSize.depthCm);

  // 採光マップ（可視化・採点に使用）
  const lightGrid = computeLightGrid({
    roomW: roomSize.widthCm,
    roomD: roomSize.depthCm,
    polygon: roomPolygon,
    blockedRects,
    openings,
    items: placedItems,
    northDeg,
    timeOfDay,
    lights,
  });

  // 現在の配置の採点（重なり・動線・窓塞ぎ等の減点）
  const layoutScoreResult = scoreLayout({
    roomW: roomSize.widthCm,
    roomD: roomSize.depthCm,
    polygon: roomPolygon,
    blockedRects,
    openings,
    items: placedItems,
    flowPaths,
    lightGrid,
  });

  const sizeInputClass =
    "w-14 rounded border border-stone-300 px-1 py-0.5 text-right text-xs text-stone-800 focus:border-blue-500 focus:outline-none";

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-stone-100 p-4 sm:p-8">
      <h1 className="text-xl font-bold text-stone-800 sm:text-2xl">家具配置シミュレーター</h1>
      <ShareBanner share={share} />
      {/* レイアウト（キャンバス）は画面上部に固定し、下の操作中も常に見えるようにする */}
      <div className="sticky top-0 z-20 flex w-full max-w-[700px] flex-col items-center gap-2 border-b border-stone-200 bg-stone-100 pb-2 pt-1">
        <div className="flex w-full items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="設定を開く"
            title="部屋・家具・共有などの設定"
            className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
          >
            ☰ 設定
          </button>
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
          <span className="hidden text-xs text-stone-500 sm:inline">
            {viewMode === "2d"
              ? "真上から編集"
              : "立体プレビュー（ドラッグで回転・ホイールでズーム）"}
          </span>
          <div className="ml-auto inline-flex overflow-hidden rounded-md border border-stone-300">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              aria-label="取り消し"
              title="取り消し（Ctrl+Z）"
              className="px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
            >
              ↩︎
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              aria-label="やり直し"
              title="やり直し（Ctrl+Shift+Z）"
              className="border-l border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
            >
              ↪︎
            </button>
          </div>
        </div>
        {viewMode === "2d" ? (
          <RoomCanvas
            widthCm={roomSize.widthCm}
            depthCm={roomSize.depthCm}
            placedItems={placedItems}
            openings={openings}
            flowPaths={showFlow ? flowPaths : []}
            roomPolygon={roomPolygon}
            blockedRects={blockedRects}
            highlightUids={highlightUids}
            northDeg={northDeg}
            lightGrid={lightGrid}
            showLight={showLight}
            lights={lights}
            onMove={handleMove}
            onRemove={handleRemove}
            onRotate={handleRotate}
            onDuplicate={handleDuplicate}
            onMoveOpening={handleMoveOpening}
            onMoveLight={handleMoveLight}
            onRemoveLight={handleRemoveLight}
          />
        ) : (
          <Room3D
            widthCm={roomSize.widthCm}
            depthCm={roomSize.depthCm}
            placedItems={placedItems}
            openings={openings}
            roomPolygon={roomPolygon}
          />
        )}
      </div>
      <div className="flex w-full max-w-[700px] flex-col items-center gap-4">
          {viewMode === "2d" && (
            <>
              {placedItems.length === 0 ? (
                <div className="w-full rounded-lg border border-dashed border-blue-300 bg-blue-50/60 px-4 py-4 text-sm text-stone-700">
                  <p className="mb-1 font-semibold text-blue-800">🛋 まずは家具を置いてみましょう</p>
                  <ul className="ml-1 flex flex-col gap-0.5 text-stone-600">
                    <li>・上の「☰ 設定」→「家具を置く」で、選んだ家具や予算から自動配置できます</li>
                    <li>・パレットから1つずつ置くこともできます</li>
                    <li>・置いた家具はタップで選択→回転・複製・削除、ドラッグで移動</li>
                  </ul>
                </div>
              ) : (
                <p className="w-full text-xs text-stone-500">
                  💡 家具はタップで選択（🔄回転・⧉複製・🗑削除）、ドラッグで移動（グリッド/隣接に吸着）。Ctrl+Z で取り消し。
                </p>
              )}
              {(lastRequests || placedItems.some((i) => !i.owned)) && (
                <div className="flex w-full flex-wrap items-center gap-2">
                  {lastRequests && (
                    <button
                      type="button"
                      onClick={handleReroll}
                      className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-100"
                    >
                      🔀 別の配置案
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClearLayout}
                    className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                  >
                    配置をクリア
                  </button>
                </div>
              )}
              {layoutNote && (
                <div className="w-full rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {layoutNote}
                </div>
              )}
              {showFlow && flowPaths.some((p) => p.narrow.some((n) => n)) && (
                <div className="w-full rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                  ⚠️ 動線が狭い箇所があります（幅 {FLOW_MIN_WIDTH_CM}cm 未満・赤い区間）。家具の配置を見直すと通りやすくなります。
                </div>
              )}
            </>
          )}
          {blockedWindowCount > 0 && (
            <div className="w-full rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              ⚠️ 窓の前に家具があります（{blockedWindowCount}箇所）。窓を塞いでいないか確認してください。
            </div>
          )}
          {placedItems.length > 0 && (
            <ScorePanel
              result={layoutScoreResult}
              activeId={activeDeduction}
              onHover={(uids, id) => {
                setHighlightUids(uids);
                setActiveDeduction(id);
              }}
            />
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
                キャンバス上の家具をタップすると回転・複製・削除ができます（一覧の ⟳ / × でも操作可）
              </p>
            </div>
          )}
      </div>
      <ProposalPanel placedItems={placedItems} budget={budget} />

      {/* 設定ドロワー（右からのスライドサイドバー）。設定系はここに集約してコンパクトに */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30"
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-[340px] max-w-[88vw] flex-col gap-3 overflow-y-auto bg-stone-100 p-4 shadow-xl transition-transform ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-stone-800">設定</h2>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="閉じる"
            className="rounded px-2 py-1 text-lg leading-none text-stone-500 hover:bg-stone-200"
          >
            ×
          </button>
        </div>

        <CollapsibleSection title="部屋・予算" icon="📐" defaultOpen>
          <RoomSizeForm value={roomSize} onChange={setRoomSize} />
          <div className="flex w-full items-center justify-between">
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
                className="w-32 rounded-md border border-stone-300 px-2 py-1 text-right text-stone-800 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="家具を置く" icon="🛋" defaultOpen>
          <AutoLayoutPanel onRun={runAutoLayout} />
          <BudgetLayoutPanel budget={budget} roomSize={roomSize} onRun={runAutoLayout} />
          <FurniturePresetPanel onPlace={handlePlacePreset} />
        </CollapsibleSection>

        <CollapsibleSection title="部屋の形・入口" icon="🏠">
          <RoomShapePanel shape={roomShape} roomSize={roomSize} onChange={setRoomShape} />
          <OpeningPanel
            openings={openings}
            roomSize={roomSize}
            onAdd={handleAddOpening}
            onRemove={handleRemoveOpening}
          />
          <FloorPlanScanPanel roomSize={roomSize} onDetect={setRoomShape} />
        </CollapsibleSection>

        <CollapsibleSection title="方角・採光・照明" icon="💡">
          <LightingPanel
            northDeg={northDeg}
            timeOfDay={timeOfDay}
            onChangeNorth={setNorthDeg}
            onChangeTime={setTimeOfDay}
          />
          <LightFixturePanel
            lights={lights}
            onAdd={handleAddLight}
            onRemove={handleRemoveLight}
          />
        </CollapsibleSection>

        <CollapsibleSection title="表示" icon="👁">
          {flowPaths.length > 0 && (
            <label className="flex w-full items-center gap-2 text-sm text-stone-600">
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
              生活動線を表示
            </label>
          )}
          <label className="flex w-full items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={showLight}
              onChange={(e) => setShowLight(e.target.checked)}
              className="h-4 w-4"
            />
            <span
              className="inline-block h-3 w-6 shrink-0 rounded"
              style={{ background: "linear-gradient(90deg, #334155, #f59e0b, #fef3c7)" }}
            />
            採光マップを表示
          </label>
        </CollapsibleSection>

        <CollapsibleSection title="共有" icon="🔗">
          <SharePanel share={share} />
        </CollapsibleSection>

        <CollapsibleSection title="データの保存・読み込み" icon="💾">
          <DataPanel />
        </CollapsibleSection>
      </aside>
    </main>
  );
}
