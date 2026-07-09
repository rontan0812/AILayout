// 共有ルームの状態を保持する簡易API（インメモリ）。
// GET: 現在の状態・バージョン・参加人数を返す。
// PUT: 状態を更新し、バージョンを進める（Last-Write-Wins）。
// ※サーバーのメモリに保持するため、サーバーレス環境では単一インスタンス前提の制約がある。

type Room = {
  version: number;
  state: unknown | null;
  presence: Map<string, number>; // clientId -> 最終アクセス時刻(ms)
};

// モジュールスコープに保持（同一インスタンス内で共有）
const rooms = new Map<string, Room>();

// これより古いプレゼンスは離脱とみなす(ms)
const PRESENCE_TTL = 15000;
// ルーム数の上限（暴走防止）
const MAX_ROOMS = 500;

function getRoom(id: string): Room {
  let room = rooms.get(id);
  if (!room) {
    // 上限を超えたら最も古いルームを1つ捨てる
    if (rooms.size >= MAX_ROOMS) {
      const oldest = rooms.keys().next().value;
      if (oldest) rooms.delete(oldest);
    }
    room = { version: 0, state: null, presence: new Map() };
    rooms.set(id, room);
  }
  return room;
}

function activePeers(room: Room, now: number): number {
  let count = 0;
  for (const [cid, ts] of room.presence) {
    if (now - ts > PRESENCE_TTL) room.presence.delete(cid);
    else count++;
  }
  return count;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client");
  const now = Date.now();
  const room = getRoom(id);
  if (clientId) room.presence.set(clientId, now);
  return Response.json({
    version: room.version,
    state: room.state,
    peers: activePeers(room, now),
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const now = Date.now();
  let body: { clientId?: string; state?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const room = getRoom(id);
  if (body.clientId) room.presence.set(body.clientId, now);
  if (body.state !== undefined) {
    room.state = body.state;
    room.version += 1;
  }
  return Response.json({ version: room.version, peers: activePeers(room, now) });
}
