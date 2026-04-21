import { NextResponse } from "next/server";

const PYTH_URL = "https://pyth-lazer.dourolabs.app/v1/latest_price";

export async function GET() {
  const accessToken = process.env.PYTH_LAZER_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing PYTH_LAZER_ACCESS_TOKEN environment variable." },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(PYTH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: "real_time",
        formats: ["evm"],
        properties: ["price"],
        symbols: ["Crypto.SOL/USD"],
        parsed: true,
        jsonBinaryEncoding: "hex",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Pyth request failed with ${response.status}` },
        { status: response.status },
      );
    }

    const payload = (await response.json()) as {
      parsed?: {
        timestampUs?: string;
        priceFeeds?: Array<{ price?: string }>;
      };
    };

    const rawPrice = payload.parsed?.priceFeeds?.[0]?.price;
    if (!rawPrice) {
      return NextResponse.json({ error: "Pyth response missing price." }, { status: 502 });
    }

    // Pyth evm parsed price is integer with 1e8 precision.
    const normalizedPrice = Number(rawPrice) / 100_000_000;
    return NextResponse.json({
      price: normalizedPrice,
      timestampUs: payload.parsed?.timestampUs ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown Pyth error." },
      { status: 500 },
    );
  }
}
