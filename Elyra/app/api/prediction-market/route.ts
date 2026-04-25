import { NextRequest, NextResponse } from "next/server";
import {
  getActivePredictionMarkets,
  getMarketByTicker,
} from "@/lib/dflow-prediction-markets";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const limit = Number.parseInt(searchParams.get("limit") || "8", 10);

  if (ticker) {
    const data = await getMarketByTicker(ticker);
    return NextResponse.json({ type: "single", data });
  }

  const data = await getActivePredictionMarkets(
    Number.isFinite(limit) ? limit : 8,
  );
  return NextResponse.json({ type: "list", data });
}
