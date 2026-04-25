import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AiPredictionResult, getAiPricePrediction } from "@/lib/ai-price-prediction";
import {
  DFlowMarket,
  getActivePredictionMarkets,
  getMarketByTicker,
} from "@/lib/dflow-prediction-markets";

const PRIMARY_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-pro";
const GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const DEXSCREENER_BASE = "https://api.dexscreener.com";
const PUBLIC_SOLANA_RPC_URLS = [
  "https://solana-rpc.publicnode.com",
  "https://go.getblock.us/86aac42ad4484f3c813079afc201451c",
  "https://solana-mainnet.gateway.tatum.io/",
];
const JUPITER_QUOTE_BASE_URLS = [
  "https://quote-api.jup.ag/v6/quote",
  "https://lite-api.jup.ag/swap/v1/quote",
];
const GEMINI_MAX_RETRIES = 4;
const DEXSCREENER_PAIR_LIMIT = 3;

const TOKEN_MAP: Record<string, { symbol: string; mint: string; decimals: number }> = {
  SOL: {
    symbol: "SOL",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
  },
  USDC: {
    symbol: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
  },
  BONK: {
    symbol: "BONK",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6mKfG3Q8xUnxA3AF",
    decimals: 5,
  },
};

type AssistantRequest = {
  prompt?: string;
  walletAddress?: string | null;
  solPrice?: number;
  solBalance?: number;
  swapHistory?: Array<{
    fromSymbol: string;
    toSymbol: string;
    amount: string;
    status: string;
    createdAt: number;
  }>;
};

function isPredictionIntent(prompt: string): boolean {
  return /\b(prediction|predict|forecast)\b/i.test(prompt);
}

function isPredictionMarketIntent(prompt: string): boolean {
  return /\b(prediction market|kalshi|dflow)\b/i.test(prompt);
}

function extractPredictionRequest(prompt: string): { token: string; hours: number } {
  const tokenMatch = prompt.match(/\b(SOL|WIF|BONK|PUMP|MOODENG|[1-9A-HJ-NP-Za-km-z]{32,44})\b/i);
  const hoursMatch = prompt.match(/(\d+)\s*(?:hour|hr|h)\b/i);
  const token = tokenMatch ? tokenMatch[1].toUpperCase() : "SOL";
  const hoursRaw = hoursMatch ? Number.parseInt(hoursMatch[1], 10) : 1;
  const hours = Math.max(1, Math.min(24, Number.isFinite(hoursRaw) ? hoursRaw : 1));
  return { token, hours };
}

function extractPredictionMarketTicker(prompt: string): string | null {
  const match = prompt.match(/\b([A-Z0-9]{4,12})\b/);
  if (!match) return null;
  const candidate = match[1].toUpperCase();
  const blocked = new Set(["SOL", "USDC", "BONK", "WIF", "PUMP", "MOODENG"]);
  return blocked.has(candidate) ? null : candidate;
}

type DexPair = {
  chainId?: string;
  pairAddress?: string;
  dexId?: string;
  labels?: string[];
  url?: string;
  pairCreatedAt?: number;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
  priceUsd?: string;
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  txns?: {
    h24?: { buys?: number; sells?: number };
    h6?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    m5?: { buys?: number; sells?: number };
  };
  priceChange?: { h24?: number; h6?: number; h1?: number; m5?: number };
  baseToken?: { address?: string; symbol?: string; name?: string };
  quoteToken?: { address?: string; symbol?: string; name?: string };
};

type MarketSkillContext = {
  marketSnapshots: Array<{
    symbol: string;
    mint: string;
    topPair?: {
      pairAddress: string;
      dexId?: string;
      priceUsd?: number;
      marketCap?: number;
      fdv?: number;
      liquidityUsd?: number;
      volume24h?: number;
      priceChange24h?: number;
      priceChange6h?: number;
      priceChange1h?: number;
      buySellRatio1h?: number;
      safetyScore: number;
      safetyFlags: string[];
      technicalState: "bullish" | "bearish" | "neutral";
      technicalNotes: string[];
      onchainSafety?: {
        mintAuthorityRenounced: boolean;
        freezeAuthorityRenounced: boolean;
        mintAuthority?: string;
        freezeAuthority?: string;
        supply?: string;
        decimals?: number;
        lpLockStatus: "locked" | "unlocked" | "unknown" | "not_applicable";
        lpLockConfidence?: "high" | "medium" | "low";
        positionConcentrationRiskScore?: number;
        lockedLiquidityPercent?: number;
        sourceRpc?: string;
        notes: string[];
      };
      pairUrl?: string;
    };
  }>;
  derivatives?: {
    source: "drift-data-api";
    marketSymbol: string;
    openInterest?: number;
    fundingRateNow?: number;
    fundingRateAvg24h?: number;
    optionsSignal: "limited-on-solana";
    ahr999Proxy?: number;
    rainbowBand?:
      | "deep-value"
      | "accumulation"
      | "neutral"
      | "heating-up"
      | "euphoria"
      | "unknown";
    ohlcv?: {
      resolution: "60";
      latestClose?: number;
      latestQuoteVolume?: number;
      recordsUsed: number;
    };
    notes: string[];
  };
  chartReadingMode: boolean;
  referencedChartUrls: string[];
};

function normalizeTextList(input: unknown, max = 4): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized = input
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (entry && typeof entry === "object") {
        const maybe = entry as { bullet?: unknown; detail?: unknown; text?: unknown };
        const bullet = typeof maybe.bullet === "string" ? maybe.bullet.trim() : "";
        const detail = typeof maybe.detail === "string" ? maybe.detail.trim() : "";
        const text = typeof maybe.text === "string" ? maybe.text.trim() : "";
        const joined = [bullet, detail, text].filter(Boolean).join(": ").trim();
        return joined;
      }
      return "";
    })
    .filter((item) => item.length > 0);

  return normalized.slice(0, max);
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }
  return null;
}

function ensureStructuredReply(reply: string, marketSkillContext?: MarketSkillContext): string {
  const requiredSections = [
    "1. TRADE SNAPSHOT",
    "2. MARKET CONTEXT",
    "3. EDGE",
    "4. RISK MATRIX",
    "5. TRADE PLAN",
    "6. SCENARIO SWITCH",
    "7. FINAL CALL",
  ];
  const normalized = reply.trim();
  const hasAllSections = requiredSections.every((section) => normalized.includes(section));
  if (hasAllSections && normalized.length > 500) {
    return normalized;
  }

  const snapshot = marketSkillContext?.marketSnapshots?.[0]?.topPair;
  const symbol = marketSkillContext?.marketSnapshots?.[0]?.symbol ?? "SOL";
  const price = snapshot?.priceUsd;
  const safetyScore = snapshot?.safetyScore ?? 50;
  const tech = snapshot?.technicalState ?? "neutral";
  const confidence = Math.max(1, Math.min(10, Math.round((safetyScore / 100) * 10)));
  const bias =
    tech === "bullish" ? "🟢 Bullish" : tech === "bearish" ? "🔴 Bearish" : "Neutral";
  const decision =
    tech === "bullish" ? "Scale" : tech === "bearish" ? "Avoid" : "Wait";
  const priceLabel = typeof price === "number" && Number.isFinite(price) ? `$${price.toFixed(4)}` : "N/A";
  const ch24 =
    typeof snapshot?.priceChange24h === "number" ? `${snapshot.priceChange24h.toFixed(2)}%` : "N/A";
  const liq =
    typeof snapshot?.liquidityUsd === "number" ? `$${Math.round(snapshot.liquidityUsd).toLocaleString()}` : "N/A";
  const vol =
    typeof snapshot?.volume24h === "number" ? `$${Math.round(snapshot.volume24h).toLocaleString()}` : "N/A";
  const riskMeter = Math.max(1, Math.min(10, 10 - confidence));
  const lock = snapshot?.onchainSafety?.lpLockStatus ?? "unknown";
  const mintAuth = snapshot?.onchainSafety?.mintAuthorityRenounced ? "renounced" : "active";
  const freezeAuth = snapshot?.onchainSafety?.freezeAuthorityRenounced ? "renounced" : "active";
  const concentration =
    typeof snapshot?.onchainSafety?.positionConcentrationRiskScore === "number"
      ? `${snapshot.onchainSafety.positionConcentrationRiskScore}/100`
      : "N/A";

  return [
    "1. TRADE SNAPSHOT",
    "| Asset | Price | Bias | Confidence (1-10) | Timeframe | Decision |",
    "|---|---:|---|---:|---|---|",
    `| ${symbol} | ${priceLabel} | ${bias} | ${confidence} | Intraday-3D | ${decision} |`,
    "",
    "2. MARKET CONTEXT",
    "| Structure | Position | Volatility | Market Condition |",
    "|---|---|---|---|",
    `| ${tech} momentum | Mixed flow | Moderate | 24h change: ${ch24} |`,
    "",
    `Liquidity is ${liq} and 24h volume is ${vol}, which is tradable but requires strict execution discipline.`,
    `On-chain token controls are mint=${mintAuth}, freeze=${freezeAuth}; LP lock status=${lock}.`,
    `Safety score currently reads ${safetyScore}/100, so edge quality is conditional rather than clean trend continuation.`,
    "",
    "3. EDGE",
    "- Live price/flow context is incorporated from current pair metrics rather than stale historical assumptions.",
    "- Safety model combines liquidity, turnover, authority controls, and DEX-specific lock/concentration signals.",
    "- Trade bias is tied to short-horizon structure (1h/6h/24h regime blend), not a single indicator.",
    "- Execution focus is risk-first: confirmation before entry, predefined invalidation, capped size.",
    "",
    "4. RISK MATRIX",
    "| Risk factor | Impact |",
    "|---|---|",
    `| Mint authority (${mintAuth}) / Freeze authority (${freezeAuth}) | ${mintAuth === "active" || freezeAuth === "active" ? "High" : "Medium"} |`,
    `| LP/position concentration (${concentration}) | ${typeof snapshot?.onchainSafety?.positionConcentrationRiskScore === "number" && snapshot.onchainSafety.positionConcentrationRiskScore > 65 ? "High" : "Medium"} |`,
    `| Liquidity shocks / slippage (${liq}) | Medium |`,
    "",
    "5. TRADE PLAN",
    "| Entry zone | Confirmation trigger | Stop loss | Targets (T1, T2) | Risk/Reward | Position size | Invalidation |",
    "|---|---|---|---|---|---|---|",
    `| ${typeof price === "number" ? `$${(price * 0.992).toFixed(4)} - $${(price * 1.002).toFixed(4)}` : "Wait for live price"} | 15m/1h reclaim with buy-pressure follow-through | ${typeof price === "number" ? `$${(price * 0.975).toFixed(4)}` : "Structural low"} | ${typeof price === "number" ? `$${(price * 1.02).toFixed(4)}, $${(price * 1.045).toFixed(4)}` : "Next resistance levels"} | >= 2.0 | 0.5% - 1.0% risk | 1h close below stop or order-flow breakdown |`,
    "",
    "6. SCENARIO SWITCH",
    "| Scenario | Trigger | Action |",
    "|---|---|---|",
    "| Bullish continuation | Price holds entry zone + buy/sell ratio improves | Scale into target ladder with trailing protection |",
    "| Bearish failure | Entry rejection + breakdown below invalidation | Exit immediately; avoid averaging down |",
    "",
    "7. FINAL CALL",
    `${decision}. Execute only on confirmation, with strict invalidation and capped size.`,
    `Risk meter: ${riskMeter}/10. If confirmation fails, stand down and wait for cleaner structure.`,
  ].join("\n");
}

function extractChartImageUrls(prompt: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = prompt.match(urlRegex) ?? [];
  return matches.filter((url) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)).slice(0, 3);
}

function detectChartReadingMode(prompt: string): boolean {
  return /chart|screenshot|image|candles|ta\b|technical analysis/i.test(prompt);
}

function extractTokenAddresses(prompt: string): string[] {
  const addressRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
  const found = prompt.match(addressRegex) ?? [];
  const unique: string[] = [];
  for (const address of found) {
    if (!unique.includes(address)) {
      unique.push(address);
    }
    if (unique.length >= DEXSCREENER_PAIR_LIMIT) {
      break;
    }
  }
  return unique;
}

function extractSupportedSymbols(prompt: string): string[] {
  const upper = prompt.toUpperCase();
  return Object.keys(TOKEN_MAP).filter((symbol) =>
    new RegExp(`\\b${symbol}\\b`, "i").test(upper),
  );
}

function computeSafetyScore(pair: DexPair): { score: number; flags: string[] } {
  const flags: string[] = [];
  const liquidityUsd = Number(pair.liquidity?.usd ?? 0);
  const volume24h = Number(pair.volume?.h24 ?? 0);
  const marketCap = Number(pair.marketCap ?? pair.fdv ?? 0);
  const ageMs =
    typeof pair.pairCreatedAt === "number"
      ? Date.now() - pair.pairCreatedAt
      : Number.POSITIVE_INFINITY;

  let score = 50;
  if (liquidityUsd >= 1_000_000) score += 20;
  else if (liquidityUsd >= 250_000) score += 10;
  else if (liquidityUsd < 50_000) {
    score -= 20;
    flags.push("low-liquidity");
  }

  if (volume24h >= 2_000_000) score += 15;
  else if (volume24h < 100_000) {
    score -= 10;
    flags.push("thin-volume");
  }

  if (marketCap > 0 && liquidityUsd > 0) {
    const liqToMcap = liquidityUsd / marketCap;
    if (liqToMcap < 0.02) {
      score -= 10;
      flags.push("low-liquidity-vs-marketcap");
    } else if (liqToMcap > 0.1) {
      score += 5;
    }
  }

  if (Number.isFinite(ageMs)) {
    const ageHours = ageMs / 3_600_000;
    if (ageHours < 24) {
      score -= 12;
      flags.push("new-pair");
    } else if (ageHours > 24 * 30) {
      score += 5;
    }
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return { score: bounded, flags };
}

function computeSafetyScoreWithOnchain(
  pair: DexPair,
  onchainSafety?: {
    mintAuthorityRenounced: boolean;
    freezeAuthorityRenounced: boolean;
    lpLockStatus: "locked" | "unlocked" | "unknown" | "not_applicable";
    positionConcentrationRiskScore?: number;
  },
): { score: number; flags: string[] } {
  const base = computeSafetyScore(pair);
  let score = base.score;
  const flags = [...base.flags];

  if (onchainSafety) {
    if (!onchainSafety.mintAuthorityRenounced) {
      score -= 20;
      flags.push("mint-authority-active");
    }
    if (!onchainSafety.freezeAuthorityRenounced) {
      score -= 15;
      flags.push("freeze-authority-active");
    }
    if (onchainSafety.lpLockStatus === "unlocked") {
      score -= 10;
      flags.push("lp-unlocked");
    } else if (onchainSafety.lpLockStatus === "unknown") {
      flags.push("lp-lock-unverified");
    } else if (onchainSafety.lpLockStatus === "not_applicable") {
      flags.push("lp-lock-not-applicable");
    }
    if (typeof onchainSafety.positionConcentrationRiskScore === "number") {
      if (onchainSafety.positionConcentrationRiskScore >= 70) {
        score -= 12;
        flags.push("position-concentration-high");
      } else if (onchainSafety.positionConcentrationRiskScore >= 45) {
        score -= 6;
        flags.push("position-concentration-medium");
      } else {
        flags.push("position-concentration-low");
      }
    }
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), flags };
}

function buildTechnicalState(pair: DexPair): {
  state: "bullish" | "bearish" | "neutral";
  notes: string[];
  buySellRatio1h?: number;
} {
  const c1 = Number(pair.priceChange?.h1 ?? 0);
  const c6 = Number(pair.priceChange?.h6 ?? 0);
  const c24 = Number(pair.priceChange?.h24 ?? 0);
  const buys = Number(pair.txns?.h1?.buys ?? 0);
  const sells = Number(pair.txns?.h1?.sells ?? 0);
  const ratio = sells > 0 ? buys / sells : buys > 0 ? 999 : undefined;
  const notes: string[] = [];
  let score = 0;

  if (c1 > 0) {
    score += 1;
    notes.push("1h momentum positive");
  } else if (c1 < 0) {
    score -= 1;
    notes.push("1h momentum negative");
  }
  if (c6 > 0) score += 1;
  else if (c6 < 0) score -= 1;
  if (c24 > 0) score += 1;
  else if (c24 < 0) score -= 1;

  if (ratio !== undefined) {
    if (ratio >= 1.2) {
      score += 1;
      notes.push("buy pressure > sell pressure");
    } else if (ratio <= 0.85) {
      score -= 1;
      notes.push("sell pressure dominates");
    }
  }

  if (score >= 2) return { state: "bullish", notes, buySellRatio1h: ratio };
  if (score <= -2) return { state: "bearish", notes, buySellRatio1h: ratio };
  return { state: "neutral", notes, buySellRatio1h: ratio };
}

async function fetchDexPairsForToken(tokenAddress: string): Promise<DexPair[]> {
  const timeout = AbortSignal.timeout(8_000);
  const response = await fetch(`${DEXSCREENER_BASE}/token-pairs/v1/solana/${tokenAddress}`, {
    cache: "no-store",
    signal: timeout,
  });
  if (!response.ok) {
    throw new Error(`Dexscreener token-pairs failed (${response.status})`);
  }
  const payload = (await response.json()) as DexPair[];
  return payload.filter((pair) => pair.chainId === "solana");
}

type DriftMarketStat = {
  symbol?: string;
  openInterest?: string | number;
  fundingRate?: string | number;
  oraclePrice?: string | number;
};

type DriftFundingRecord = {
  ts?: number;
  fundingRate?: string | number;
};

type DriftCandleRecord = {
  ts?: number;
  fillClose?: number;
  oracleClose?: number;
  quoteVolume?: number;
};

async function fetchDriftDerivativesData(symbol: string) {
  const notes: string[] = [];

  const marketStat = await (async () => {
    try {
      const response = await fetch("https://data.api.drift.trade/stats/markets", {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers: { "user-agent": "Mozilla/5.0" },
      });
      if (!response.ok) {
        notes.push(`Drift stats/markets failed (${response.status})`);
        return undefined;
      }
      const payload = (await response.json()) as { markets?: DriftMarketStat[] };
      return payload.markets?.find((market) => market.symbol === symbol);
    } catch (error) {
      notes.push(`Drift stats/markets error: ${error instanceof Error ? error.message : "unknown"}`);
      return undefined;
    }
  })();

  const fundingRecords = await (async () => {
    try {
      const response = await fetch(`https://data.api.drift.trade/market/${symbol}/fundingRates?limit=24`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers: { "user-agent": "Mozilla/5.0" },
      });
      if (!response.ok) {
        notes.push(`Drift fundingRates failed (${response.status})`);
        return [] as DriftFundingRecord[];
      }
      const payload = (await response.json()) as { records?: DriftFundingRecord[] };
      return payload.records ?? [];
    } catch (error) {
      notes.push(`Drift fundingRates error: ${error instanceof Error ? error.message : "unknown"}`);
      return [] as DriftFundingRecord[];
    }
  })();

  const candles = await (async () => {
    try {
      const endTs = Math.floor(Date.now() / 1000);
      const startTs = endTs - 60 * 60 * 24 * 220; // ~220 days for 200d proxy MA
      const url = new URL(`https://data.api.drift.trade/market/${symbol}/candles/60`);
      url.searchParams.set("startTs", String(startTs));
      url.searchParams.set("endTs", String(endTs));
      url.searchParams.set("limit", "1000");
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers: { "user-agent": "Mozilla/5.0" },
      });
      if (!response.ok) {
        notes.push(`Drift candles failed (${response.status})`);
        return [] as DriftCandleRecord[];
      }
      const payload = (await response.json()) as { records?: DriftCandleRecord[] };
      return payload.records ?? [];
    } catch (error) {
      notes.push(`Drift candles error: ${error instanceof Error ? error.message : "unknown"}`);
      return [] as DriftCandleRecord[];
    }
  })();

  const fundingValues = fundingRecords
    .map((record) => Number(record.fundingRate))
    .filter((value) => Number.isFinite(value));
  const fundingRateNow = fundingValues.length > 0 ? fundingValues[0] : undefined;
  const fundingRateAvg24h =
    fundingValues.length > 0
      ? fundingValues.reduce((sum, value) => sum + value, 0) / fundingValues.length
      : undefined;

  const marketOpenInterest = Number(marketStat?.openInterest);
  const openInterest = Number.isFinite(marketOpenInterest) ? marketOpenInterest : undefined;

  const closes = candles
    .map((record) => Number(record.fillClose ?? record.oracleClose))
    .filter((value) => Number.isFinite(value));
  const latestClose = closes.length > 0 ? closes[closes.length - 1] : undefined;
  const ma200 = closes.length >= 200 ? closes.slice(-200).reduce((sum, value) => sum + value, 0) / 200 : undefined;
  const ahr999Proxy =
    typeof latestClose === "number" && typeof ma200 === "number" && ma200 > 0
      ? latestClose / ma200
      : undefined;

  const rainbowBand:
    | "deep-value"
    | "accumulation"
    | "neutral"
    | "heating-up"
    | "euphoria"
    | "unknown" =
    ahr999Proxy === undefined
      ? "unknown"
      : ahr999Proxy < 0.75
        ? "deep-value"
        : ahr999Proxy < 0.95
          ? "accumulation"
          : ahr999Proxy < 1.15
            ? "neutral"
            : ahr999Proxy < 1.35
              ? "heating-up"
              : "euphoria";

  const latestQuoteVolume = candles.length > 0 ? Number(candles[candles.length - 1].quoteVolume) : undefined;

  return {
    source: "drift-data-api" as const,
    marketSymbol: symbol,
    openInterest,
    fundingRateNow,
    fundingRateAvg24h,
    optionsSignal: "limited-on-solana" as const,
    ahr999Proxy,
    rainbowBand,
    ohlcv: {
      resolution: "60" as const,
      latestClose: Number.isFinite(latestClose) ? latestClose : undefined,
      latestQuoteVolume: Number.isFinite(latestQuoteVolume) ? latestQuoteVolume : undefined,
      recordsUsed: candles.length,
    },
    notes: [
      "AHR999 and rainbow are proxy metrics derived from Drift OHLCV (200-period MA ratio), not the original BTC-native formulation.",
      ...notes,
    ],
  };
}

const BURN_ADDRESSES = new Set([
  "11111111111111111111111111111111",
  "1nc1nerator11111111111111111111111111111111",
]);

async function evaluateRaydiumLpLock(pairAddress: string, connection: Connection) {
  const response = await fetch(`https://api-v3.raydium.io/pools/info/ids?ids=${pairAddress}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) {
    throw new Error(`Raydium pool lookup failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    data?: Array<{
      type?: string;
      lpMint?: { address?: string };
      burnPercent?: number;
    }>;
  };
  const pool = payload.data?.[0];
  if (!pool) {
    throw new Error("Raydium pool not found");
  }

  const poolType = String(pool.type ?? "").toLowerCase();
  if (poolType.includes("concentrated")) {
    const tvl = Number((pool as { tvl?: number }).tvl ?? 0);
    const burnPercent = Number(pool.burnPercent ?? 0);
    const openTime = Number((pool as { openTime?: string | number }).openTime ?? 0);
    const ageHours =
      Number.isFinite(openTime) && openTime > 0 ? (Date.now() - openTime * 1000) / 3_600_000 : undefined;

    // Raydium CLMM does not expose fungible LP ownership.
    // We approximate concentration/liquidity pull risk with pool depth, age, and burn metric.
    let concentrationRisk = 42;
    if (Number.isFinite(tvl)) {
      if (tvl < 200_000) concentrationRisk += 22;
      else if (tvl < 1_000_000) concentrationRisk += 10;
      else concentrationRisk -= 8;
    }
    if (Number.isFinite(ageHours)) {
      if ((ageHours ?? 0) < 24) concentrationRisk += 15;
      else if ((ageHours ?? 0) < 24 * 7) concentrationRisk += 8;
      else concentrationRisk -= 4;
    }
    if (Number.isFinite(burnPercent)) {
      if (burnPercent >= 0.5) concentrationRisk -= 8;
      else if (burnPercent <= 0.05) concentrationRisk += 6;
    }
    concentrationRisk = Math.max(0, Math.min(100, Math.round(concentrationRisk)));

    return {
      lpLockStatus: "not_applicable" as const,
      lpLockConfidence: "high" as const,
      positionConcentrationRiskScore: concentrationRisk,
      notes: [
        "Raydium concentrated pool (CLMM): LP lock is position-NFT based; fungible LP lock metric is not applicable.",
        "Applied CLMM concentration heuristic using TVL, pool age, and Raydium burnPercent metadata.",
      ],
    };
  }

  const lpMintAddress = pool.lpMint?.address;
  if (!lpMintAddress) {
    return {
      lpLockStatus: "unknown" as const,
      lpLockConfidence: "low" as const,
      notes: ["Raydium Standard pool missing lpMint metadata."],
    };
  }

  const lpMint = new PublicKey(lpMintAddress);
  const largest = await connection.getTokenLargestAccounts(lpMint, "confirmed");
  const mintInfo = await getMint(connection, lpMint, "confirmed", TOKEN_PROGRAM_ID);
  const totalSupply = Number(mintInfo.supply);
  const top = largest.value[0];
  if (!top || !Number.isFinite(totalSupply) || totalSupply <= 0) {
    return {
      lpLockStatus: "unknown" as const,
      lpLockConfidence: "low" as const,
      notes: ["Unable to derive LP concentration from on-chain LP mint statistics."],
    };
  }

  const topShare = Number(top.amount) / totalSupply;
  let topOwner: string | undefined;
  try {
    const topAccountInfo = await connection.getParsedAccountInfo(top.address, "confirmed");
    const parsed = topAccountInfo.value?.data;
    if (parsed && typeof parsed === "object" && "parsed" in parsed) {
      const maybeOwner = (
        parsed as {
          parsed?: { info?: { owner?: string } };
        }
      )?.parsed?.info?.owner;
      if (typeof maybeOwner === "string") {
        topOwner = maybeOwner;
      }
    }
  } catch {
    // Owner lookup best-effort; share still informative.
  }

  if (topOwner && BURN_ADDRESSES.has(topOwner) && topShare >= 0.9) {
    return {
      lpLockStatus: "locked" as const,
      lpLockConfidence: "medium" as const,
      notes: [
        `Top LP holder is burn/incinerator address with ${(topShare * 100).toFixed(2)}% LP share.`,
      ],
    };
  }

  const burnPercent = Number(pool.burnPercent ?? 0);
  if (burnPercent >= 0.95) {
    return {
      lpLockStatus: "locked" as const,
      lpLockConfidence: "medium" as const,
      notes: [`Raydium burnPercent reports ${(burnPercent * 100).toFixed(2)}% burned LP.`],
    };
  }

  if (topShare >= 0.3 && !(topOwner && BURN_ADDRESSES.has(topOwner))) {
    return {
      lpLockStatus: "unlocked" as const,
      lpLockConfidence: "medium" as const,
      notes: [
        `Top LP account controls ${(topShare * 100).toFixed(2)}% and is not a burn locker; rug/liquidity-pull risk elevated.`,
      ],
    };
  }

  return {
    lpLockStatus: "unknown" as const,
    lpLockConfidence: "low" as const,
    notes: ["Raydium LP ownership distribution inconclusive for strict lock classification."],
  };
}

async function evaluateOrcaWhirlpoolConcentration(pairAddress: string) {
  const response = await fetch(`https://api.orca.so/v2/solana/pools/${pairAddress}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) {
    throw new Error(`Orca pool lookup failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    data?: {
      hasWarning?: boolean;
      lockedLiquidityPercent?: Array<{
        locked_percentage?: string;
        lockedPercentage?: string;
        name?: string;
      }>;
      tvlUsdc?: string;
    };
  };

  const data = payload.data;
  if (!data) {
    throw new Error("Orca pool data missing");
  }

  const lockedPercentRaw = data.lockedLiquidityPercent?.[0];
  const lockedPct = Number(
    lockedPercentRaw?.lockedPercentage ?? lockedPercentRaw?.locked_percentage ?? 0,
  );
  const tvl = Number(data.tvlUsdc ?? 0);
  const hasWarning = Boolean(data.hasWarning);

  // Heuristic risk score: 0 (lowest concentration risk) -> 100 (highest concentration risk)
  let risk = 30;
  if (Number.isFinite(lockedPct)) {
    if (lockedPct < 0.001) risk += 45;
    else if (lockedPct < 0.01) risk += 30;
    else if (lockedPct < 0.05) risk += 18;
    else risk -= 8;
  }
  if (hasWarning) risk += 12;
  if (Number.isFinite(tvl) && tvl > 0 && tvl < 250_000) risk += 8;

  risk = Math.max(0, Math.min(100, Math.round(risk)));

  return {
    positionConcentrationRiskScore: risk,
    lockedLiquidityPercent: Number.isFinite(lockedPct) ? lockedPct : undefined,
    notes: [
      "Orca concentrated-liquidity pools use position NFTs; fungible LP lock is not directly applicable.",
      `Heuristic concentration risk derived from lockedLiquidityPercent + pool warnings + TVL context.`,
    ],
  };
}

function evaluateDexSpecificLpLockNotApplicable(dexId?: string, labels?: string[]) {
  const dex = String(dexId ?? "").toLowerCase();
  const normalizedLabels = (labels ?? []).map((label) => label.toLowerCase());
  if (dex.includes("meteora") || dex.includes("orca")) {
    return {
      lpLockStatus: "not_applicable" as const,
      lpLockConfidence: "high" as const,
      notes: [
        `${dexId ?? "DEX"} uses concentrated/bin-style LP positions; fungible LP lock metric is not directly applicable.`,
      ],
    };
  }
  if (normalizedLabels.some((label) => label.includes("clmm") || label.includes("dlmm"))) {
    return {
      lpLockStatus: "not_applicable" as const,
      lpLockConfidence: "high" as const,
      notes: [
        "CLMM/DLMM pool detected; LP lock check is not equivalent to standard fungible LP lock models.",
      ],
    };
  }
  return null;
}

async function fetchOnchainSafety(tokenMint: string, pair?: DexPair) {
  const notes: string[] = [];
  let lastError: string | null = null;

  for (const rpcUrl of PUBLIC_SOLANA_RPC_URLS) {
    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const mintPublicKey = new PublicKey(tokenMint);
      const mintAccountInfo = await connection.getAccountInfo(mintPublicKey);
      if (!mintAccountInfo) {
        throw new Error("Mint account not found");
      }
      const mintInfo = await getMint(connection, mintPublicKey, "confirmed", TOKEN_PROGRAM_ID);

      let lpLockStatus: "locked" | "unlocked" | "unknown" | "not_applicable" = "unknown";
      let lpLockConfidence: "high" | "medium" | "low" = "low";
      let positionConcentrationRiskScore: number | undefined;
      let lockedLiquidityPercent: number | undefined;
      const lpLockNotes: string[] = [];
      const dexNAA = evaluateDexSpecificLpLockNotApplicable(pair?.dexId, pair?.labels);
      if (dexNAA) {
        lpLockStatus = dexNAA.lpLockStatus;
        lpLockConfidence = dexNAA.lpLockConfidence;
        lpLockNotes.push(...dexNAA.notes);
        if (String(pair?.dexId ?? "").toLowerCase().includes("orca") && pair?.pairAddress) {
          try {
            const orcaConcentration = await evaluateOrcaWhirlpoolConcentration(pair.pairAddress);
            positionConcentrationRiskScore = orcaConcentration.positionConcentrationRiskScore;
            lockedLiquidityPercent = orcaConcentration.lockedLiquidityPercent;
            lpLockNotes.push(...orcaConcentration.notes);
          } catch (orcaError) {
            lpLockNotes.push(
              `Orca concentration check failed: ${orcaError instanceof Error ? orcaError.message : "unknown error"}`,
            );
          }
        }
      } else if (String(pair?.dexId ?? "").toLowerCase().includes("raydium") && pair?.pairAddress) {
        try {
          const raydiumLock = await evaluateRaydiumLpLock(pair.pairAddress, connection);
          lpLockStatus = raydiumLock.lpLockStatus;
          lpLockConfidence = raydiumLock.lpLockConfidence;
          if (typeof raydiumLock.positionConcentrationRiskScore === "number") {
            positionConcentrationRiskScore = raydiumLock.positionConcentrationRiskScore;
          }
          lpLockNotes.push(...raydiumLock.notes);
        } catch (lpError) {
          lpLockNotes.push(
            `Raydium LP lock check failed: ${lpError instanceof Error ? lpError.message : "unknown error"}`,
          );
        }
      } else {
        lpLockNotes.push(`No DEX-specific LP lock parser available for dexId=${pair?.dexId ?? "unknown"}.`);
      }

      return {
        mintAuthorityRenounced: mintInfo.mintAuthority === null,
        freezeAuthorityRenounced: mintInfo.freezeAuthority === null,
        mintAuthority: mintInfo.mintAuthority?.toBase58(),
        freezeAuthority: mintInfo.freezeAuthority?.toBase58(),
        supply: mintInfo.supply.toString(),
        decimals: mintInfo.decimals,
        lpLockStatus,
        lpLockConfidence,
        positionConcentrationRiskScore,
        lockedLiquidityPercent,
        sourceRpc: rpcUrl,
        notes: [
          ...notes,
          ...lpLockNotes,
        ],
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown RPC error";
      notes.push(`RPC failed (${rpcUrl}): ${lastError}`);
    }
  }

  return {
    mintAuthorityRenounced: false,
    freezeAuthorityRenounced: false,
    lpLockStatus: "unknown" as const,
      lpLockConfidence: "low" as const,
    notes: [...notes, `On-chain safety fetch failed across all RPCs: ${lastError ?? "unknown error"}`],
  };
}

function pickTopPair(pairs: DexPair[]): DexPair | undefined {
  return [...pairs].sort((a, b) => {
    const aLiq = Number(a.liquidity?.usd ?? 0);
    const bLiq = Number(b.liquidity?.usd ?? 0);
    const aVol = Number(a.volume?.h24 ?? 0);
    const bVol = Number(b.volume?.h24 ?? 0);
    return bLiq + bVol - (aLiq + aVol);
  })[0];
}

async function buildMarketSkillContext(prompt: string): Promise<MarketSkillContext> {
  const symbolMints = extractSupportedSymbols(prompt).map((symbol) => ({
    symbol,
    mint: TOKEN_MAP[symbol].mint,
  }));
  const explicitAddresses = extractTokenAddresses(prompt);
  const tokenTargets = [...symbolMints];

  for (const address of explicitAddresses) {
    if (!tokenTargets.some((item) => item.mint === address)) {
      tokenTargets.push({ symbol: "CUSTOM", mint: address });
    }
  }

  if (tokenTargets.length === 0) {
    tokenTargets.push({ symbol: "SOL", mint: TOKEN_MAP.SOL.mint });
  }

  const marketSnapshots: MarketSkillContext["marketSnapshots"] = [];
  for (const target of tokenTargets.slice(0, DEXSCREENER_PAIR_LIMIT)) {
    try {
      const pairs = await fetchDexPairsForToken(target.mint);
      const topPair = pickTopPair(pairs);
      if (!topPair?.pairAddress) {
        marketSnapshots.push({ symbol: target.symbol, mint: target.mint });
        continue;
      }
      const tech = buildTechnicalState(topPair);
      const mintForSafety = topPair.baseToken?.address ?? target.mint;
      const onchainSafety = await fetchOnchainSafety(mintForSafety, topPair);
      const mergedSafety = computeSafetyScoreWithOnchain(topPair, onchainSafety);
      marketSnapshots.push({
        symbol: topPair.baseToken?.symbol ?? target.symbol,
        mint: target.mint,
        topPair: {
          pairAddress: topPair.pairAddress,
          dexId: topPair.dexId,
          priceUsd: Number(topPair.priceUsd ?? 0) || undefined,
          marketCap: Number(topPair.marketCap ?? 0) || undefined,
          fdv: Number(topPair.fdv ?? 0) || undefined,
          liquidityUsd: Number(topPair.liquidity?.usd ?? 0) || undefined,
          volume24h: Number(topPair.volume?.h24 ?? 0) || undefined,
          priceChange24h: Number(topPair.priceChange?.h24 ?? 0) || undefined,
          priceChange6h: Number(topPair.priceChange?.h6 ?? 0) || undefined,
          priceChange1h: Number(topPair.priceChange?.h1 ?? 0) || undefined,
          buySellRatio1h: tech.buySellRatio1h,
          safetyScore: mergedSafety.score,
          safetyFlags: mergedSafety.flags,
          technicalState: tech.state,
          technicalNotes: tech.notes,
          onchainSafety,
          pairUrl: topPair.url,
        },
      });
    } catch {
      marketSnapshots.push({ symbol: target.symbol, mint: target.mint });
    }
  }

  const upperPrompt = prompt.toUpperCase();
  const derivativesSymbol =
    upperPrompt.includes("BTC") ? "BTC-PERP" : upperPrompt.includes("ETH") ? "ETH-PERP" : "SOL-PERP";
  const wantsDerivatives = /funding|open interest|oi\b|derivatives|perp|ahr|rainbow|options/i.test(prompt);
  const derivatives = wantsDerivatives ? await fetchDriftDerivativesData(derivativesSymbol) : undefined;

  return {
    marketSnapshots,
    derivatives,
    chartReadingMode: detectChartReadingMode(prompt),
    referencedChartUrls: extractChartImageUrls(prompt),
  };
}

function parseSwapIntent(prompt: string, solBalance?: number) {
  const normalizedPrompt = prompt
    .trim()
    .replace(/\s+with\s+/gi, " to ")
    .replace(/\s+into\s+/gi, " to ");

  const percentMatcher = /swap\s+([\d.]+)\s*%\s*(?:of\s+)?([a-zA-Z]+)\s+(?:to|for)\s+([a-zA-Z]+)/i.exec(
    normalizedPrompt,
  );
  if (percentMatcher) {
    const percent = Number(percentMatcher[1]);
    const fromSymbol = percentMatcher[2].toUpperCase();
    const toSymbol = percentMatcher[3].toUpperCase();
    if (
      Number.isFinite(percent) &&
      percent > 0 &&
      percent <= 100 &&
      TOKEN_MAP[fromSymbol] &&
      TOKEN_MAP[toSymbol] &&
      fromSymbol !== toSymbol &&
      fromSymbol === "SOL" &&
      typeof solBalance === "number" &&
      Number.isFinite(solBalance) &&
      solBalance > 0
    ) {
      const amount = (solBalance * percent) / 100;
      return { amount, fromSymbol, toSymbol };
    }
  }

  const matcher = /swap\s+([\d.]+)\s+(?:of\s+)?([a-zA-Z]+)\s+(?:to|for)\s+([a-zA-Z]+)/i.exec(
    normalizedPrompt,
  );
  if (!matcher) {
    return null;
  }

  const amount = Number(matcher[1]);
  const fromSymbol = matcher[2].toUpperCase();
  const toSymbol = matcher[3].toUpperCase();

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  if (!TOKEN_MAP[fromSymbol] || !TOKEN_MAP[toSymbol] || fromSymbol === toSymbol) {
    return null;
  }

  return { amount, fromSymbol, toSymbol };
}

async function createJupiterSwap(
  walletAddress: string | null | undefined,
  amount: number,
  fromSymbol: string,
  toSymbol: string,
) {
  const fromToken = TOKEN_MAP[fromSymbol];
  const toToken = TOKEN_MAP[toSymbol];
  const amountInBaseUnits = Math.round(amount * 10 ** fromToken.decimals);
  const slippageBps = 50;

  const jupiterApiKey = process.env.JUPITER_API_KEY;
  const quoteHeaders = {
    ...(jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}),
  };

  let quotePayload: {
    outAmount?: string;
    [key: string]: unknown;
  } | null = null;
  let lastQuoteError = "Jupiter quote request failed";

  for (const baseUrl of JUPITER_QUOTE_BASE_URLS) {
    try {
      const quoteUrl = `${baseUrl}?inputMint=${fromToken.mint}&outputMint=${toToken.mint}&amount=${amountInBaseUnits}&slippageBps=${slippageBps}`;
      const timeout = AbortSignal.timeout(8_000);
      const quoteResponse = await fetch(quoteUrl, {
        cache: "no-store",
        headers: quoteHeaders,
        signal: timeout,
      });

      if (!quoteResponse.ok) {
        const body = await quoteResponse.text();
        lastQuoteError = `Jupiter quote failed (${quoteResponse.status}) from ${baseUrl}: ${body}`;
        continue;
      }

      quotePayload = (await quoteResponse.json()) as {
        outAmount?: string;
        [key: string]: unknown;
      };
      break;
    } catch (error) {
      lastQuoteError = `${baseUrl} fetch error: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  if (!quotePayload) {
    throw new Error(lastQuoteError);
  }

  if (!quotePayload.outAmount) {
    throw new Error("Jupiter quote missing outAmount");
  }

  const expectedOut = Number(quotePayload.outAmount) / 10 ** toToken.decimals;
  const jupiterSwapUrl = `https://jup.ag/swap/${fromSymbol}-${toSymbol}`;
  return {
    kind: "swap" as const,
    fromSymbol,
    toSymbol,
    fromMint: fromToken.mint,
    toMint: toToken.mint,
    amount: amount.toString(),
    expectedOut: expectedOut.toFixed(6),
    slippageBps,
    jupiterSwapUrl,
    userPublicKey: walletAddress ?? undefined,
  };
}

async function askGemini(
  prompt: string,
  solPrice?: number,
  swapHistory?: AssistantRequest["swapHistory"],
  marketSkillContext?: MarketSkillContext,
) {
  const apiKey =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_GEMINI_API_KEY ??
    process.env.GEMINI_API_TOKEN;
  if (!apiKey) {
    throw new Error(
      "Missing Gemini API key. Set GEMINI_API_KEY (or GOOGLE_GEMINI_API_KEY) in .env.local.",
    );
  }

  const contextBlock = JSON.stringify(
    {
      nowIso: new Date().toISOString(),
      solPrice,
      recentSwaps: swapHistory ?? [],
      supportedPairs: Object.keys(TOKEN_MAP),
      marketSkillContext,
      instructions: [
        "Focus only on Solana market context.",
        "Skill 1: Market Analysis is enabled. Use Dexscreener-derived context for real-time price, volume, liquidity, market cap, and computed safety score.",
        "Skill 3: Derivatives Data is enabled via Drift Data API. Use derivatives.openInterest, fundingRateNow, fundingRateAvg24h, and OHLCV context when available.",
        "For AHR999/rainbow, use derivatives.ahr999Proxy and derivatives.rainbowBand, and clearly label these as proxy metrics.",
        "For options commentary on Solana, explicitly mention limited options depth and rely on perp/open-interest/funding context.",
        "When marketSkillContext.topPair exists, ground your analysis in these real metrics before giving strategy.",
        "Skill 2: Chart Reading is enabled. If user asks chart/screenshot analysis, combine chart-read heuristics with live pair metrics.",
        "If chartReadingMode is true but no chart image/url is provided, clearly request screenshot upload or URL, and still provide preliminary analysis from live data.",
        "If user asks for trading suggestions, include concise risk-managed ideas.",
        "If user asks for backtest, provide assumptions and what to validate before execution.",
        "Do not anchor examples to old years unless user explicitly asks for historical years.",
        "Respond with technical depth: market structure, volatility regime, liquidity, execution assumptions, and risk limits.",
        "Default to recent windows (intraday + last 7/30/90 days) instead of stale historical anchors.",
      ],
    },
    null,
    2,
  );

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "You are the FINAL SYNTHESIS AGENT of a quantitative trading system. Reply in JSON only with keys: reply (string), suggestions (string[]), strategyNotes (string[]), agentAction (object|null).\n" +
              "If the user requests a swap, set agentAction={\"type\":\"swap\",\"amount\":\"<number>\",\"fromSymbol\":\"SOL|USDC|BONK\",\"toSymbol\":\"SOL|USDC|BONK\"}. For unclear amounts, set agentAction=null and ask one clarifying question.\n" +
              "When discussing backtests, prefer recent rolling windows (e.g., last 3/6/12 months) unless the user asks for a specific historical date range.\n" +
              "Your goal is to produce a structured, UI-friendly, but information-rich trading decision.\n" +
              "Your job is to combine all upstream insights into one clean professional output. Do NOT mention agents. Do NOT show intermediate reasoning. Do NOT repeat raw data unless necessary.\n" +
              "Assume the user is deploying real capital. Be precise and accountable.\n" +
              "Style: professional and slightly analytical; concise but information-dense; no fluff, no storytelling, no emotional language, no generic advice.\n" +
              "Always quantify when possible (probabilities, levels, ranges, risk/reward, invalidation, sizing).\n" +
              "If user input is short or vague, internally reinterpret it into a quant task (technical structure, quant signals, entry/exit strategy, risk analysis, final call).\n" +
              "CRITICAL: Do NOT over-compress the answer. Do NOT reduce explanation below usefulness.\n" +
              "Balance clarity (easy scanning) with depth (enough insight to trade confidently).\n" +
              "Use tables for data and short paragraphs for insight. Never remove context completely. Never output only strategy without explanation.\n" +
              "Keep total output medium length (not tiny, not essay).\n" +
              "Rule: if a trader cannot execute based on your answer alone, the answer is incomplete.\n" +
              "Use this exact output format every time, headings in this exact order:\n" +
              "1. TRADE SNAPSHOT (table): Asset, Price, Bias, Confidence (1-10), Timeframe, Decision\n" +
              "2. MARKET CONTEXT (table): Structure, Position, Volatility, Market Condition; then add 2-3 lines explaining what is actually happening.\n" +
              "3. EDGE (3-5 bullet points): explain why this trade exists with structure/liquidity/quant reasoning.\n" +
              "4. RISK MATRIX (table): Risk factor, Impact.\n" +
              "5. TRADE PLAN (table): Entry zone, Confirmation trigger, Stop loss, Targets (T1, T2), Risk/Reward, Position size, Invalidation.\n" +
              "6. SCENARIO SWITCH (table)\n" +
              "7. FINAL CALL (2-3 lines, decisive, clearly tell the user what to do)\n" +
              "Formatting rules: clean markdown tables, short insight paragraphs, no repeated information, every section must add decision value.\n" +
              "Use emojis sparingly (⚠️ ✅ 📊), only when they improve scanability.\n" +
              "Trading rules: Always give a decision (Buy / Wait / Avoid / Scale). Always include entry + stop + targets. Always define invalidation.\n" +
              "Quality check before finalizing: ensure a trader can understand WHY the trade exists and can EXECUTE directly; if output feels like a signal alert, expand it; if it feels like an essay, compress it.\n" +
              "In strategyNotes, provide 3-5 technical bullets (entry trigger, stop logic, invalidation level, sizing rule, execution note).\n" +
              `Context:\n${contextBlock}\n\n` +
              `User prompt: ${prompt}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
    },
  };

  const candidateModels = [PRIMARY_GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS];
  let response: Response | null = null;
  let lastError = "Gemini request did not complete";

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt += 1) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(requestBody),
        },
      );

      if (response.ok) {
        break;
      }

      const geminiErrorBody = await response.text();
      lastError = `Gemini model ${model} failed with ${response.status}: ${geminiErrorBody}`;

      if (response.status !== 429 || attempt === GEMINI_MAX_RETRIES - 1) {
        break;
      }

      const delayMs = 500 * 2 ** attempt;
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }

    if (response?.ok) {
      break;
    }
  }

  if (!response || !response.ok) {
    throw new Error(lastError);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const trimmed = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  const jsonCandidate = extractFirstJsonObject(trimmed) ?? extractFirstJsonObject(text);

  try {
    const parsed = JSON.parse(jsonCandidate ?? trimmed) as {
      reply?: string;
      suggestions?: unknown[];
      strategyNotes?: unknown[];
      agentAction?: {
        type?: string;
        amount?: string | number;
        fromSymbol?: string;
        toSymbol?: string;
      } | null;
    };
    return {
      reply: ensureStructuredReply(parsed.reply ?? "No response generated.", marketSkillContext),
      suggestions: normalizeTextList(parsed.suggestions, 4),
      strategyNotes: normalizeTextList(parsed.strategyNotes, 4),
      agentAction: parsed.agentAction ?? null,
    };
  } catch {
    return {
      reply: ensureStructuredReply(text || "No response generated.", marketSkillContext),
      suggestions: [],
      strategyNotes: [],
      agentAction: null,
    };
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AssistantRequest;
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    if (isPredictionMarketIntent(prompt)) {
      const maybeTicker = extractPredictionMarketTicker(prompt);
      if (maybeTicker) {
        const market = await getMarketByTicker(maybeTicker);
        if (!market.success) {
          return NextResponse.json({
            reply: `DFlow market lookup failed for ${maybeTicker}: ${market.error ?? "unknown error"}`,
            suggestions: [
              "Show active prediction markets",
              "Check another market ticker",
              "Compare market odds with SOL trend",
            ],
            strategyNotes: [],
            derivatives: null,
            prediction: null as AiPredictionResult | null,
            predictionMarkets: null as { type: "single" | "list"; data: DFlowMarket[] } | null,
            action: null,
          });
        }
        return NextResponse.json({
          predictionMarkets: {
            type: "single" as const,
            data: [market],
          },
          reply: [
            `1. TRADE SNAPSHOT`,
            `| Asset | Price | Bias | Confidence (1-10) | Timeframe | Decision |`,
            `|---|---:|---|---:|---|---|`,
            `| ${market.ticker} | Yes ${market.yes_price} / No ${market.no_price} | Event-driven | 7 | Until ${market.end_date ?? "expiry"} | Monitor |`,
            ``,
            `2. MARKET CONTEXT`,
            `| Structure | Position | Volatility | Market Condition |`,
            `|---|---|---|---|`,
            `| Prediction market | Binary pricing | Event volatility | ${market.title} |`,
            ``,
            `Current implied YES probability is ${market.yes_probability}, with volume ${market.volume}.`,
            `This is event-risk pricing, not spot token trend following.`,
            ``,
            `3. EDGE`,
            `- Probabilities are explicit and continuously repriced by market participants.`,
            `- Useful for macro/event overlays against spot/perp positioning.`,
            `- Can be used as sentiment anchor for scenario-weighted trading.`,
            ``,
            `4. RISK MATRIX`,
            `| Risk factor | Impact |`,
            `|---|---|`,
            `| Event headline risk | High |`,
            `| Liquidity gap near settlement | Medium-High |`,
            `| Mispricing persistence | Medium |`,
            ``,
            `5. TRADE PLAN`,
            `| Entry zone | Confirmation trigger | Stop loss | Targets (T1, T2) | Risk/Reward | Position size | Invalidation |`,
            `|---|---|---|---|---|---|---|`,
            `| Around implied yes=${market.yes_probability} | Cross-check with spot/perp flow alignment | Event-risk hard stop | Reprice bands around major catalyst windows | >= 2.0 | <=0.5%-1.0% risk | Thesis invalid if new event data breaks prior assumptions |`,
            ``,
            `6. SCENARIO SWITCH`,
            `| Scenario | Trigger | Action |`,
            `|---|---|---|`,
            `| YES-side momentum | Probability trend up + confirming external data | Scale cautiously |`,
            `| NO-side reversal | Probability trend down + contradictory data | De-risk / hedge |`,
            ``,
            `7. FINAL CALL`,
            `${market.title}`,
            `Yes: ${market.yes_probability} (${market.yes_price}) | No: ${Math.max(0, 100 - Number.parseInt(market.yes_probability, 10))}% (${market.no_price}) | Volume: ${market.volume} | Ends: ${market.end_date ?? "TBD"}.`,
          ].join("\n"),
          suggestions: [
            "Show active prediction markets",
            "Compare this market probability with SOL trend",
            "Give event-risk strategy with strict sizing",
          ],
          strategyNotes: [
            "Treat prediction market probabilities as event-implied odds, not guaranteed outcomes.",
            "Use smaller sizing due to binary settlement dynamics.",
            "Reassess after each major headline/catalyst update.",
          ],
          derivatives: null,
          prediction: null as AiPredictionResult | null,
          action: null,
        });
      }

      const markets = await getActivePredictionMarkets(6);
      const active = markets.filter((m) => m.success).slice(0, 6);
      const lines =
        active.length > 0
          ? active.map((m) => `- ${m.title} → Yes ${m.yes_probability} | Vol ${m.volume}`)
          : ["- No active markets currently available."];

      return NextResponse.json({
        predictionMarkets: {
          type: "list" as const,
          data: active,
        },
        reply: [
          `1. TRADE SNAPSHOT`,
          `| Asset | Price | Bias | Confidence (1-10) | Timeframe | Decision |`,
          `|---|---:|---|---:|---|---|`,
          `| DFlow/Kalshi Markets | Implied probabilities | Event-driven | 6 | Active events | Watchlist |`,
          ``,
          `2. MARKET CONTEXT`,
          `| Structure | Position | Volatility | Market Condition |`,
          `|---|---|---|---|`,
          `| Prediction markets list | Multi-event | Event volatility | Active opportunities |`,
          ``,
          `Active DFlow Prediction Markets (Kalshi on Solana):`,
          ...lines,
          ``,
          `3. EDGE`,
          `- Immediate event-implied probability surface across multiple catalysts.`,
          `- Useful for mapping market narrative into tradable scenario weights.`,
          `- Efficient watchlist input for cross-asset risk overlay.`,
          ``,
          `4. RISK MATRIX`,
          `| Risk factor | Impact |`,
          `|---|---|`,
          `| Binary event settlement | High |`,
          `| Liquidity dispersion across markets | Medium |`,
          `| Headline shock | High |`,
          ``,
          `5. TRADE PLAN`,
          `| Entry zone | Confirmation trigger | Stop loss | Targets (T1, T2) | Risk/Reward | Position size | Invalidation |`,
          `|---|---|---|---|---|---|---|`,
          `| Choose top-liquidity markets | Probability drift + external data confirmation | Event-risk hard stop | Probability reprice bands pre/post catalyst | >= 2.0 | <=0.5%-1.0% | Invalid if event assumptions materially change |`,
          ``,
          `6. SCENARIO SWITCH`,
          `| Scenario | Trigger | Action |`,
          `|---|---|---|`,
          `| Consensus strengthening | Probabilities trend persistently | Add gradually |`,
          `| Consensus breakdown | Sudden probability reversal | Exit or hedge quickly |`,
          ``,
          `7. FINAL CALL`,
          `Use these as event-implied probability signals, then cross-check with spot/perp structure before deploying risk.`,
        ].join("\n"),
        suggestions: [
          "Open market ticker details (example: PRES2028)",
          "Compare prediction market odds with SOL derivatives",
          "Build event-driven trade plan with position caps",
        ],
        strategyNotes: [
          "Prioritize markets with stronger volume for more reliable pricing.",
          "Never size prediction-market positions like trend-following spot trades.",
        ],
        derivatives: null,
        prediction: null as AiPredictionResult | null,
        action: null,
      });
    }

    if (isPredictionIntent(prompt)) {
      const { token, hours } = extractPredictionRequest(prompt);
      const prediction = await getAiPricePrediction(token, hours);
      if (!prediction.success) {
        return NextResponse.json(
          {
            reply: `Prediction failed: ${prediction.error ?? "Unknown prediction error"}`,
            suggestions: [
              "Predict SOL in 1h",
              "Forecast BONK for 4h",
              "Give me SOL prediction with confidence",
            ],
            strategyNotes: [],
            derivatives: null,
            prediction: null as AiPredictionResult | null,
            predictionMarkets: null as { type: "single" | "list"; data: DFlowMarket[] } | null,
            action: null,
          },
          { status: 200 },
        );
      }

      return NextResponse.json({
        prediction,
        reply: [
          `1. TRADE SNAPSHOT`,
          `| Asset | Price | Bias | Confidence (1-10) | Timeframe | Decision |`,
          `|---|---:|---|---:|---|---|`,
          `| ${prediction.symbol} | ${prediction.current_price} | Model-driven | ${Math.max(
            1,
            Math.min(10, Math.round(Number.parseInt(prediction.confidence, 10) / 10)),
          )} | ${prediction.predicted_in} | Monitor |`,
          ``,
          `2. MARKET CONTEXT`,
          `| Structure | Position | Volatility | Market Condition |`,
          `|---|---|---|---|`,
          `| Short-horizon forecast mode | N/A | Adaptive | ${prediction.reason} |`,
          ``,
          `Projection model is a momentum-plus-volume heuristic using live Dexscreener market context.`,
          `Predicted price path is indicative, not guaranteed execution alpha.`,
          ``,
          `3. EDGE`,
          `- Real-time Dexscreener liquidity/volume context with no paid API dependency.`,
          `- Fast 30s cache for low-latency repeated forecast queries.`,
          `- Confidence adapts to volatility and turnover conditions.`,
          ``,
          `4. RISK MATRIX`,
          `| Risk factor | Impact |`,
          `|---|---|`,
          `| Short-horizon noise | High |`,
          `| Regime shift in next ${hours}h | Medium-High |`,
          `| Liquidity shock / slippage | Medium |`,
          ``,
          `5. TRADE PLAN`,
          `| Entry zone | Confirmation trigger | Stop loss | Targets (T1, T2) | Risk/Reward | Position size | Invalidation |`,
          `|---|---|---|---|---|---|---|`,
          `| Near ${prediction.current_price} | Align with live flow + structure reclaim | 1h structural break below support | Use ${prediction.predicted_price} as T1 proxy, T2 by market structure | >= 2.0 preferred | 0.5%-1.0% risk | Forecast disconfirmed by opposite momentum + volume regime |`,
          ``,
          `6. SCENARIO SWITCH`,
          `| Scenario | Trigger | Action |`,
          `|---|---|---|`,
          `| Bull continuation | Price tracks toward forecast with supportive flow | Scale gradually with trailing risk |`,
          `| Forecast failure | Price diverges with rising opposite-side flow | Exit quickly; wait for reset |`,
          ``,
          `7. FINAL CALL`,
          `Current: ${prediction.current_price} | Predicted: ${prediction.predicted_price} ${prediction.predicted_in} | Confidence: ${prediction.confidence}.`,
          `Use this as probabilistic guidance only; execute only with confirmation and strict risk controls.`,
        ].join("\n"),
        suggestions: [
          `Predict ${prediction.symbol} in 4h`,
          `Forecast ${prediction.symbol} in 12h`,
          `Analyze ${prediction.symbol} with full market and on-chain safety score`,
        ],
        strategyNotes: [
          `Prediction model: ${prediction.reason}`,
          "Never use forecast output as standalone execution trigger without confirmation.",
          "Cap risk and re-evaluate if momentum regime shifts.",
        ],
        predictionMarkets: null as { type: "single" | "list"; data: DFlowMarket[] } | null,
        action: null,
      });
    }

    const swapIntent = parseSwapIntent(prompt, body.solBalance);
    let action: Awaited<ReturnType<typeof createJupiterSwap>> | undefined;
    let marketSkillContext: MarketSkillContext | undefined;

    let ai: Awaited<ReturnType<typeof askGemini>>;
    try {
      marketSkillContext = await buildMarketSkillContext(prompt);
      ai = await askGemini(prompt, body.solPrice, body.swapHistory, marketSkillContext);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unknown assistant error";
      if (text.includes("429")) {
        ai = {
          reply:
            "1. TRADE SNAPSHOT\n| Asset | Price | Bias | Confidence (1-10) | Timeframe | Decision |\n|---|---:|---|---:|---|---|\n| SOL | Feed limited | Neutral | 2 | Intraday | Wait |\n\n2. MARKET CONTEXT\n| Structure | Position | Volatility | Market Condition |\n|---|---|---|---|\n| Unverified (429) | Flat / defensive | Elevated uncertainty | Data-degraded environment |\n\nThe live signal feed is rate-limited, so structure and momentum reads are not reliably refreshed.\nWithout verified market state, directional setups have weak statistical support.\nCurrent optimal posture is capital protection until data quality normalizes.\n\n3. EDGE\n- No durable long/short edge can be validated while real-time confirmation is unavailable.\n- The highest-confidence edge right now is avoiding low-quality entries.\n- Liquidity and trend conditions cannot be scored with required confidence due to feed degradation.\n\n4. RISK MATRIX\n| Risk factor | Impact |\n|---|---|\n| Stale-signal entry ⚠️ | High |\n| False breakout participation | High |\n| Execution slippage under uncertainty | Medium |\n\n5. TRADE PLAN\n| Entry zone | Confirmation trigger | Stop loss | Targets (T1, T2) | Risk/Reward | Position size | Invalidation |\n|---|---|---|---|---|---|---|\n| Wait for feed recovery | Fresh structure + momentum alignment | N/A | N/A | N/A | 0-0.25% (maintenance only) | Any directional trade before validated refresh |\n\n6. SCENARIO SWITCH\n| Scenario | Trigger | Action |\n|---|---|---|\n| ✅ Feed restored | Normalized data + aligned signals | Recompute setup and execute only if R:R >= 2.0 |\n| ⚠️ Feed remains degraded | Continued 429 / stale metrics | Stay in wait mode; no directional deployment |\n\n7. FINAL CALL\nWAIT.\nDo not open directional risk until the feed recovers and a full setup is revalidated.\nIf execution is required, keep size minimal and defensive only.",
          suggestions: [
            "Swap 0.1 SOL to USDC",
            "Show me a low-risk Solana strategy",
            "Explain SOL support and resistance setup",
          ],
          strategyNotes: [
            "Use smaller position sizing during API degradation windows.",
            "Set strict stop-loss and validate liquidity before execution.",
          ],
          agentAction: null,
        };
      } else {
        throw error;
      }
    }

    let resolvedSwapIntent = swapIntent;
    if (!resolvedSwapIntent && ai.agentAction?.type === "swap") {
      const fromSymbol = String(ai.agentAction.fromSymbol ?? "").toUpperCase();
      const toSymbol = String(ai.agentAction.toSymbol ?? "").toUpperCase();
      const amount = Number(ai.agentAction.amount ?? 0);
      if (
        Number.isFinite(amount) &&
        amount > 0 &&
        TOKEN_MAP[fromSymbol] &&
        TOKEN_MAP[toSymbol] &&
        fromSymbol !== toSymbol
      ) {
        resolvedSwapIntent = { amount, fromSymbol, toSymbol };
      }
    }

    if (resolvedSwapIntent) {
      try {
        action = await createJupiterSwap(
          body.walletAddress,
          resolvedSwapIntent.amount,
          resolvedSwapIntent.fromSymbol,
          resolvedSwapIntent.toSymbol,
        );
      } catch (swapError) {
        const swapErrorMessage =
          swapError instanceof Error ? swapError.message : "Unknown Jupiter quote error";
        ai = {
          ...ai,
          reply: `${ai.reply}\n\nI understood your swap intent, but Jupiter quote fetch failed right now (${swapErrorMessage}). Please retry in a few seconds.`,
        };
      }
    }

    return NextResponse.json({
      reply: ai.reply,
      suggestions: ai.suggestions,
      strategyNotes: ai.strategyNotes,
      derivatives: marketSkillContext?.derivatives,
      prediction: null as AiPredictionResult | null,
      predictionMarkets: null as { type: "single" | "list"; data: DFlowMarket[] } | null,
      action,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown assistant error",
      },
      { status: 500 },
    );
  }
}
