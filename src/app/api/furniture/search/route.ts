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
  reviewCount: number;
  reviewAverage: number;
};

export type FurnitureItem = {
  id: string;
  name: string;
  price: number;
  url: string;
  imageUrl: string | null;
  widthCm: number | null;
  depthCm: number | null;
  reviewCount: number; // レビュー件数
  reviewAverage: number; // 評価平均（0〜5）
};

// 単位付きの数値を cm に換算する（mm 表記のみ 1/10）。現実的な家具サイズの範囲外は無視。
function toCm(value: string, unit: string | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const cm = /mm|ミリ/i.test(unit ?? "") ? n / 10 : n;
  return cm >= 1 && cm <= 1000 ? Math.round(cm) : null;
}

// 商品名・説明文から幅（横）と奥行を抽出する。LLMを使わず正規表現で拾う。
function parseSizes(text: string): { widthCm: number | null; depthCm: number | null } {
  const t = text.replace(/\s+/g, " ");
  const unit = "(mm|cm|センチ|㎝|ミリ)?";
  const num = "(\\d+(?:\\.\\d+)?)";

  const widthMatch = t.match(new RegExp(`(?:幅|横|ワイド|W)\\s*[:：]?\\s*約?\\s*${num}\\s*${unit}`, "i"));
  const depthMatch = t.match(new RegExp(`(?:奥行き?|奥ゆき|デプス|D)\\s*[:：]?\\s*約?\\s*${num}\\s*${unit}`, "i"));

  let widthCm = widthMatch ? toCm(widthMatch[1], widthMatch[2]) : null;
  let depthCm = depthMatch ? toCm(depthMatch[1], depthMatch[2]) : null;

  // ラベルが無い「120×60」「120×60×70cm」形式は 1つ目=幅, 2つ目=奥行 とみなす
  if (widthCm === null || depthCm === null) {
    const dim = t.match(new RegExp(`${num}\\s*(?:cm|センチ|㎝)?\\s*[×xX✕*]\\s*${num}\\s*${unit}`, ""));
    if (dim) {
      if (widthCm === null) widthCm = toCm(dim[1], undefined);
      if (depthCm === null) depthCm = toCm(dim[2], dim[3]);
    }
  }

  return { widthCm, depthCm };
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

  try {
    const rakutenRes = await fetch(`${RAKUTEN_API_URL}?${params.toString()}`, {
      headers: {
        accessKey,
        Origin: origin,
        Referer: `${origin}/`,
      },
    });
    if (!rakutenRes.ok) {
      const body = await rakutenRes.text();
      // レート制限(429)はそのままのステータスで返し、呼び出し側がリトライできるようにする
      const status = rakutenRes.status === 429 ? 429 : 502;
      return Response.json(
        { error: `楽天APIエラー (${rakutenRes.status}): ${body.slice(0, 200)}` },
        { status }
      );
    }

    const data = (await rakutenRes.json()) as { Items?: RakutenItem[] };
    const rakutenItems = data.Items ?? [];

    let items: FurnitureItem[] = rakutenItems.map((item) => {
      const { widthCm, depthCm } = parseSizes(`${item.itemName} ${item.itemCaption}`);
      return {
        id: item.itemCode,
        name: item.itemName,
        price: item.itemPrice,
        url: item.itemUrl,
        imageUrl: item.mediumImageUrls?.[0] ?? null,
        widthCm,
        depthCm,
        reviewCount: typeof item.reviewCount === "number" ? item.reviewCount : 0,
        reviewAverage: typeof item.reviewAverage === "number" ? item.reviewAverage : 0,
      };
    });

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
  } catch (err) {
    // 想定外の例外でも必ずJSONを返す（フロントの res.json() が壊れないように）
    console.error("家具検索に失敗しました:", err);
    const message = err instanceof Error ? err.message : "不明なエラー";
    return Response.json(
      { error: `検索処理でエラーが発生しました: ${message}` },
      { status: 500 }
    );
  }
}
