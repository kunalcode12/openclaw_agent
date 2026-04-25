import { NextResponse } from "next/server";

const PRIMARY_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-pro";
const GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const JUPITER_QUOTE_BASE_URLS = [
  "https://quote-api.jup.ag/v6/quote",
  "https://lite-api.jup.ag/swap/v1/quote",
];
const GEMINI_MAX_RETRIES = 4;

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

async function askGemini(prompt: string, solPrice?: number, swapHistory?: AssistantRequest["swapHistory"]) {
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
      instructions: [
        "Focus only on Solana market context.",
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

  try {
    const parsed = JSON.parse(trimmed) as {
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
      reply: parsed.reply ?? "No response generated.",
      suggestions: normalizeTextList(parsed.suggestions, 4),
      strategyNotes: normalizeTextList(parsed.strategyNotes, 4),
      agentAction: parsed.agentAction ?? null,
    };
  } catch {
    return {
      reply: text || "No response generated.",
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

    const swapIntent = parseSwapIntent(prompt, body.solBalance);
    let action: Awaited<ReturnType<typeof createJupiterSwap>> | undefined;

    let ai: Awaited<ReturnType<typeof askGemini>>;
    try {
      ai = await askGemini(prompt, body.solPrice, body.swapHistory);
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
