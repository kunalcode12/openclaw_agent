// 100% free DFlow Prediction Markets API (Kalshi tokenized on Solana)
// No API key required.

export interface DFlowMarket {
  id: string;
  ticker: string;
  title: string;
  description?: string;
  yes_price: string;
  no_price: string;
  yes_probability: string;
  volume: string;
  category?: string;
  end_date?: string;
  success: boolean;
  error?: string;
}

const CACHE_TTL = 60 * 1000;
const cache = new Map<string, { data: unknown; timestamp: number }>();
const METADATA_BASE = "https://dev-prediction-markets-api.dflow.net";

async function fetchWithCache(url: string, cacheKey: string) {
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) {
    throw new Error(`DFlow API error: ${response.status}`);
  }
  const data = (await response.json()) as unknown;
  cache.set(cacheKey, { data, timestamp: now });
  return data;
}

function normalizeMarket(m: Record<string, unknown>, fallbackTicker = ""): DFlowMarket {
  const yesPriceRaw = Number(m.yesPrice ?? 0.5);
  const noPriceRaw = Number(m.noPrice ?? 1 - yesPriceRaw);
  const volumeRaw = Number(m.volume ?? 0);

  const yesPrice = Number.isFinite(yesPriceRaw) ? yesPriceRaw : 0.5;
  const noPrice = Number.isFinite(noPriceRaw) ? noPriceRaw : 1 - yesPrice;

  return {
    id: String(m.id ?? m.ticker ?? fallbackTicker),
    ticker: String(m.ticker ?? fallbackTicker),
    title: String(m.title ?? m.eventTitle ?? "Untitled Market"),
    description: typeof m.description === "string" ? m.description : undefined,
    yes_price: yesPrice.toFixed(2),
    no_price: noPrice.toFixed(2),
    yes_probability: `${Math.round(yesPrice * 100)}%`,
    volume: `$${(Number.isFinite(volumeRaw) ? volumeRaw / 1_000_000 : 0).toFixed(2)}M`,
    category:
      typeof m.category === "string"
        ? m.category
        : Array.isArray(m.tags) && typeof m.tags[0] === "string"
          ? (m.tags[0] as string)
          : undefined,
    end_date:
      typeof m.expirationDate === "string"
        ? m.expirationDate
        : typeof m.endDate === "string"
          ? m.endDate
          : undefined,
    success: true,
  };
}

function normalizeTickerKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function getActivePredictionMarkets(limit: number = 10): Promise<DFlowMarket[]> {
  const safeLimit = Math.max(1, Math.min(25, Math.floor(limit || 10)));
  const cacheKey = `markets_list_${safeLimit}`;
  try {
    const data = (await fetchWithCache(
      `${METADATA_BASE}/api/v1/markets?status=active&limit=${safeLimit}`,
      cacheKey,
    )) as { markets?: Record<string, unknown>[] };

    const markets = (data?.markets ?? []).map((m) => normalizeMarket(m));
    return markets.length > 0
      ? markets
      : [
          {
            id: "",
            ticker: "",
            title: "No active markets found",
            yes_price: "",
            no_price: "",
            yes_probability: "",
            volume: "",
            success: false,
            error: "No active DFlow markets returned",
          },
        ];
  } catch (error) {
    return [
      {
        id: "",
        ticker: "",
        title: "Failed to load markets",
        yes_price: "",
        no_price: "",
        yes_probability: "",
        volume: "",
        success: false,
        error: error instanceof Error ? error.message : "API unavailable",
      },
    ];
  }
}

export async function getMarketByTicker(ticker: string): Promise<DFlowMarket> {
  const normalizedTicker = ticker.toUpperCase().trim();
  const cacheKey = `market_${normalizedTicker}`;
  try {
    const data = (await fetchWithCache(
      `${METADATA_BASE}/api/v1/market/${encodeURIComponent(normalizedTicker)}`,
      cacheKey,
    )) as { market?: Record<string, unknown> } | Record<string, unknown>;

    const market = "market" in data && data.market ? data.market : (data as Record<string, unknown>);
    return normalizeMarket(market, normalizedTicker);
  } catch (error) {
    try {
      // Fallback 1: Search endpoint across broad market set.
      const searchData = (await fetchWithCache(
        `${METADATA_BASE}/api/v1/markets?search=${encodeURIComponent(normalizedTicker)}&limit=50`,
        `market_search_${normalizedTicker}`,
      )) as { markets?: Record<string, unknown>[] };
      const searchMarkets = (searchData.markets ?? []).map((m) => normalizeMarket(m));
      const key = normalizeTickerKey(normalizedTicker);
      const exactSearch = searchMarkets.find((m) => normalizeTickerKey(m.ticker) === key);
      if (exactSearch) return exactSearch;
      if (searchMarkets.length > 0) {
        const closest = searchMarkets[0];
        return {
          ...closest,
          description:
            `${closest.description ? `${closest.description} ` : ""}(Closest available market match for requested ticker ${normalizedTicker})`.trim(),
        };
      }

      // Fallback 2: Active market fuzzy lookup.
      const active = await getActivePredictionMarkets(50);
      const candidates = active.filter((m) => m.success);
      const exact = candidates.find((m) => normalizeTickerKey(m.ticker) === key);
      if (exact) return exact;
      const fuzzy = candidates.find((m) => {
        const t = normalizeTickerKey(m.ticker);
        return t.includes(key) || key.includes(t) || m.title.toUpperCase().includes(normalizedTicker);
      });
      if (fuzzy) return fuzzy;
    } catch {
      // ignore fallback failure; return default error below
    }

    // Better error: include hint that ticker may not exist in current dev dataset.
    return {
      id: "",
      ticker: normalizedTicker,
      title: "Market not found",
      yes_price: "",
      no_price: "",
      yes_probability: "",
      volume: "",
      success: false,
      error:
        `${error instanceof Error ? error.message : "Market not found"}. ` +
        "Ticker may be unavailable in current DFlow dev dataset; try 'Show active prediction markets' for valid tickers.",
    };
  }
}
