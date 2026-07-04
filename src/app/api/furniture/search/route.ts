import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// 楽天は2026年にAPIを移行。ドメインが openapi.rakuten.co.jp になり、
// applicationId に加えて accessKey（ヘッダー）と Origin/Referer が必須になった。
const RAKUTEN_API_URL =
  "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401";

type RakutenItem = {
  itemCode: string;
  itemName: string;
  itemPrice: number;
  itemUrl: string;
  itemCaption: string;
  mediumImageUrls: string[];
};

export type FurnitureItem = {
  id: string;
  name: string;
  price: number;
  url: string;
  imageUrl: string | null;
  widthCm: number | null;
  depthCm: number | null;
};

const SizeExtraction = z.object({
  items: z.array(
    z.object({
      index: z.number(),
      widthCm: z.number().nullable(),
      depthCm: z.number().nullable(),
    })
  ),
});

async function extractSizes(
  items: RakutenItem[]
): Promise<Map<number, { widthCm: number | null; depthCm: number | null }>> {
  const sizes = new Map<number, { widthCm: number | null; depthCm: number | null }>();
  if (!process.env.ANTHROPIC_API_KEY || items.length === 0) {
    return sizes;
  }

  const client = new Anthropic();
  const input = items.map((item, index) => ({
    index,
    name: item.itemName,
    // 説明文は長いので抽出に十分な範囲に切り詰める
    caption: item.itemCaption.slice(0, 500),
  }));

  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system:
      "あなたは家具ECサイトの商品情報からサイズを抽出するアシスタントです。" +
      "各商品の名前と説明文から、設置時の床面占有サイズである「幅（横方向）」と「奥行」をセンチメートル単位で抽出してください。" +
      "mm表記はcmに換算してください。高さは不要です。" +
      "サイズが読み取れない場合は null にしてください。推測で値を作らないでください。",
    messages: [
      {
        role: "user",
        content: JSON.stringify(input),
      },
    ],
    output_config: {
      format: zodOutputFormat(SizeExtraction),
    },
  });

  for (const entry of response.parsed_output?.items ?? []) {
    sizes.set(entry.index, { widthCm: entry.widthCm, depthCm: entry.depthCm });
  }
  return sizes;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword");
  const maxPrice = searchParams.get("maxPrice");
  const maxWidth = searchParams.get("maxWidth");
  const maxDepth = searchParams.get("maxDepth");

  if (!keyword) {
    return Response.json({ error: "keyword は必須です" }, { status: 400 });
  }

  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) {
    return Response.json(
      { error: "RAKUTEN_APP_ID が設定されていません。楽天アプリのアプリケーションIDを設定してください。" },
      { status: 500 }
    );
  }

  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!accessKey) {
    return Response.json(
      { error: "RAKUTEN_ACCESS_KEY が設定されていません。楽天アプリのアクセスキーを設定してください。" },
      { status: 500 }
    );
  }

  const params = new URLSearchParams({
    applicationId: appId,
    keyword,
    hits: "10",
    formatVersion: "2",
    genreId: "100804", // 楽天市場の「インテリア・寝具・収納」ジャンル
  });
  if (maxPrice) {
    params.set("maxPrice", maxPrice);
  }

  // 新APIは Origin/Referer が登録アプリURLと一致することを要求する。
  // デプロイ先のオリジンを使う（環境変数で上書き可能）。
  const origin = process.env.RAKUTEN_APP_URL ?? new URL(request.url).origin;

  const rakutenRes = await fetch(`${RAKUTEN_API_URL}?${params.toString()}`, {
    headers: {
      accessKey,
      Origin: origin,
      Referer: `${origin}/`,
    },
  });
  if (!rakutenRes.ok) {
    const body = await rakutenRes.text();
    return Response.json(
      { error: `楽天APIエラー (${rakutenRes.status}): ${body.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const data = (await rakutenRes.json()) as { Items?: RakutenItem[] };
  const rakutenItems = data.Items ?? [];

  const sizes = await extractSizes(rakutenItems);

  let items: FurnitureItem[] = rakutenItems.map((item, index) => ({
    id: item.itemCode,
    name: item.itemName,
    price: item.itemPrice,
    url: item.itemUrl,
    imageUrl: item.mediumImageUrls?.[0] ?? null,
    widthCm: sizes.get(index)?.widthCm ?? null,
    depthCm: sizes.get(index)?.depthCm ?? null,
  }));

  // サイズ上限フィルタ: サイズ不明の商品は残す（UI側で「サイズ不明」と表示）
  const maxWidthNum = maxWidth ? Number(maxWidth) : null;
  const maxDepthNum = maxDepth ? Number(maxDepth) : null;
  if (maxWidthNum) {
    items = items.filter((i) => i.widthCm === null || i.widthCm <= maxWidthNum);
  }
  if (maxDepthNum) {
    items = items.filter((i) => i.depthCm === null || i.depthCm <= maxDepthNum);
  }

  return Response.json({ items });
}
