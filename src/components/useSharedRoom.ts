"use client";

// 共有ルームのポーリング同期フック（T-共有-2）。
// - ?room=ID があれば自動で参加、startShare() で新規ルームを作成して共有URLに切り替える。
// - 短間隔でGETし、サーバーの version が進んでいればリモート状態をローカルへ反映する。
// - ローカル変更は（ドラッグ連打をまとめるため）デバウンスしてPUTで送る。
// - リモート適用由来の変化は送り返さない（エコー防止）。競合は Last-Write-Wins。

import { useCallback, useEffect, useRef, useState } from "react";

export type RoomDoc = Record<string, unknown>;

const POLL_MS = 1500;
const PUSH_DEBOUNCE_MS = 500;
const CLIENT_KEY = "ailayout-client";

// 共有ルームID・クライアントIDに使う短いランダム文字列
function makeId(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < len; i++) s += chars[arr[i] % chars.length];
  return s;
}

// タブ単位で安定したクライアントID（プレゼンス集計用）
function loadClientId(): string {
  try {
    const saved = sessionStorage.getItem(CLIENT_KEY);
    if (saved) return saved;
    const id = makeId(12);
    sessionStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch {
    return makeId(12);
  }
}

type Params = {
  // 共有対象の状態を直列化した文字列（内容が変わらない限り同じ値）
  docJson: string;
  // リモート状態をローカルへ反映するコールバック
  applyRemote: (doc: RoomDoc) => void;
  // localStorage 復元が済んでから同期を始めるためのフラグ
  ready: boolean;
};

export type SharedRoom = {
  roomId: string | null;
  peers: number;
  connected: boolean;
  startShare: () => void;
  stopShare: () => void;
};

export function useSharedRoom({ docJson, applyRemote, ready }: Params): SharedRoom {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [peers, setPeers] = useState(0);
  const [connected, setConnected] = useState(false);

  const clientIdRef = useRef<string>("");
  const versionRef = useRef(0);
  // 直近にサーバーと一致していると分かっている状態のJSON（重複送信・エコー判定用）
  const lastDocJsonRef = useRef<string | null>(null);
  // true の間の docJson 変化はリモート適用由来なので送り返さない
  const applyingRef = useRef(false);
  // 最初のGET完了までは初期状態でルームを上書きしない
  const pulledOnceRef = useRef(false);
  // 最新の applyRemote を参照（依存に入れず effect を再実行させない）
  const applyRemoteRef = useRef(applyRemote);
  useEffect(() => {
    applyRemoteRef.current = applyRemote;
  }, [applyRemote]);

  // 初回マウント: クライアントID確定とURLの ?room= 参加
  useEffect(() => {
    clientIdRef.current = loadClientId();
    const r = new URLSearchParams(window.location.search).get("room");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (r) setRoomId(r);
  }, []);

  // ポーリング（GETでリモート状態と参加人数を取得）
  useEffect(() => {
    if (!ready || !roomId) return;
    let cancelled = false;

    const pull = async () => {
      try {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(roomId)}?client=${clientIdRef.current}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setConnected(true);
        if (typeof data.peers === "number") setPeers(data.peers);
        if (typeof data.version === "number" && data.version > versionRef.current && data.state) {
          versionRef.current = data.version;
          applyingRef.current = true;
          lastDocJsonRef.current = JSON.stringify(data.state);
          applyRemoteRef.current(data.state as RoomDoc);
        }
        pulledOnceRef.current = true;
      } catch {
        // 一時的な通信エラーは無視して次のポーリングに任せる
      }
    };

    pull();
    const iv = setInterval(pull, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [ready, roomId]);

  // ローカル変更をデバウンスしてPUT（エコー防止つき）
  useEffect(() => {
    if (!ready || !roomId) return;

    // リモート適用による変化はサーバー由来なので送り返さない
    if (applyingRef.current) {
      applyingRef.current = false;
      lastDocJsonRef.current = docJson;
      return;
    }
    // 変化なし、または最初のGET前は送らない（初期状態でルームを潰さない）
    if (lastDocJsonRef.current === docJson || !pulledOnceRef.current) return;

    const timer = setTimeout(async () => {
      lastDocJsonRef.current = docJson;
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: clientIdRef.current, state: JSON.parse(docJson) }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.version === "number") versionRef.current = data.version;
        if (typeof data.peers === "number") setPeers(data.peers);
      } catch {
        // 送信失敗は次の変更／ポーリングで回復を図る
      }
    }, PUSH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [docJson, ready, roomId]);

  // 新規ルームを作成して共有URLに切り替える
  const startShare = useCallback(() => {
    const id = makeId(10);
    versionRef.current = 0;
    lastDocJsonRef.current = null;
    applyingRef.current = false;
    pulledOnceRef.current = false;
    const url = new URL(window.location.href);
    url.searchParams.set("room", id);
    window.history.replaceState(null, "", url.toString());
    setRoomId(id);
  }, []);

  // 共有をやめる（URLから room を外してローカル編集に戻る）
  const stopShare = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState(null, "", url.toString());
    setRoomId(null);
    setPeers(0);
    setConnected(false);
  }, []);

  return { roomId, peers, connected, startShare, stopShare };
}
