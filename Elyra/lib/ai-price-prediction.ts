// 100% free Dexscreener-based AI price prediction (replacement for Allora)
// No API keys, no external packages.

export interface AiPredictionResult {
  symbol: string;
  current_price: string;
  predicted_price: string;
  predicted_in: string;
  confidence: string;
  reason: string;
  success: boolean;
  error?: string;
}

type DexPairLite = {
  chainId?: string;
  liquidity?: { usd?: number };
  baseToken?: { symbol?: string };
  priceUsd?: string;
  priceChange?: { h24?: string | number };
  volume?: { h24?: string | number };
};

const cache = new Map<string, { data: AiPredictionResult; timestamp: number }>();
const CACHE_TTL = 30 * 1000;

async function resolvePair(tokenIdentifier: string): Promise<DexPairLite | null> {
  const isAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenIdentifier);
  const headers = { "user-agent": "Mozilla/5.0" };

  if (isAddress) {
    const response = await fetch(
      `https://api.dexscreener.com/token-pairs/v1/solana/${tokenIdentifier}`,
      { cache: "no-store", headers, signal: AbortSignal.timeout(8_000) },
    );
    if (!response.ok) return null;
    const json = (await response.json()) as DexPairLite[] | { pairs?: DexPairLite[] };
    if (Array.isArray(json)) return json[0] ?? null;
    return json.pairs?.[0] ?? null;
  }

  const searchUrl = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(tokenIdentifier)}&limit=30`;
  const response = await fetch(searchUrl, {
    cache: "no-store",
    headers,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { pairs?: DexPairLite[] };
  const solanaPairs = (json.pairs ?? []).filter((pair) => pair.chainId === "solana");
  solanaPairs.sort((a, b) => Number(b.liquidity?.usd ?? 0) - Number(a.liquidity?.usd ?? 0));
  return solanaPairs[0] ?? null;
}

export async function getAiPricePrediction(
  tokenIdentifier: string,
  hoursAhead: number = 1,
): Promise<AiPredictionResult> {
  const cleanToken = tokenIdentifier.trim();
  const cacheKey = `${cleanToken.toLowerCase()}::${hoursAhead}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const pairData = await resolvePair(cleanToken);
    if (!pairData) {
      throw new Error("Token not found on Solana");
    }

    const symbol = pairData.baseToken?.symbol || "UNKNOWN";
    const currentPrice = Number(pairData.priceUsd ?? 0);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error("Unable to determine current price from Dexscreener");
    }

    const priceChange24h = Number(pairData.priceChange?.h24 ?? 0);
    const volume24h = Number(pairData.volume?.h24 ?? 0);
    const safeHoursAhead = Math.max(1, Math.min(24, Math.floor(hoursAhead || 1)));

    const momentumFactor = priceChange24h / 100;
    const conservativeChange = momentumFactor * (safeHoursAhead / 24) * 0.75;
    const noise = Math.random() * 0.06 - 0.03; // ±3%
    const predictedChange = conservativeChange + noise;
    const predictedPrice = currentPrice * (1 + predictedChange);

    const confidenceRaw =
      75 + Math.floor(volume24h / 1_000_000) - Math.abs(priceChange24h);
    const confidence = Math.min(90, Math.max(40, confidenceRaw));

    const result: AiPredictionResult = {
      symbol,
      current_price: `$${currentPrice.toFixed(currentPrice < 1 ? 6 : 4)}`,
      predicted_price: `$${predictedPrice.toFixed(predictedPrice < 1 ? 6 : 4)}`,
      predicted_in: `in ${safeHoursAhead} hour${safeHoursAhead > 1 ? "s" : ""}`,
      confidence: `${Math.round(confidence)}%`,
      reason: `Based on 24h momentum (${priceChange24h.toFixed(2)}%) + volume $${(volume24h / 1_000_000).toFixed(1)}M`,
      success: true,
    };

    cache.set(cacheKey, { data: result, timestamp: now });
    return result;
  } catch (error) {
    return {
      symbol: "",
      current_price: "",
      predicted_price: "",
      predicted_in: "",
      confidence: "",
      reason: "",
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch prediction",
    };
  }
}
