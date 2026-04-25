import { NextRequest, NextResponse } from "next/server";
import { getAiPricePrediction } from "@/lib/ai-price-prediction";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") || "SOL";
  const hours = Number.parseInt(searchParams.get("hours") || "1", 10);

  const result = await getAiPricePrediction(token, Number.isFinite(hours) ? hours : 1);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
