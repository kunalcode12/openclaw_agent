import { NextResponse } from "next/server";

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_URL = "https://quote-api.jup.ag/v6/swap";

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
  swapHistory?: Array<{
    fromSymbol: string;
    toSymbol: string;
    amount: string;
    status: string;
    createdAt: number;
  }>;
};

function parseSwapIntent(prompt: string) {
  const matcher = /swap\s+([\d.]+)\s+([a-zA-Z]+)\s+(?:to|for)\s+([a-zA-Z]+)/i.exec(prompt.trim());
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
  walletAddress: string,
  amount: number,
  fromSymbol: string,
  toSymbol: string,
) {
  const fromToken = TOKEN_MAP[fromSymbol];
  const toToken = TOKEN_MAP[toSymbol];
  const amountInBaseUnits = Math.round(amount * 10 ** fromToken.decimals);
  const slippageBps = 50;

  const quoteUrl = `${JUPITER_QUOTE_URL}?inputMint=${fromToken.mint}&outputMint=${toToken.mint}&amount=${amountInBaseUnits}&slippageBps=${slippageBps}`;
  const quoteResponse = await fetch(quoteUrl, { cache: "no-store" });
  if (!quoteResponse.ok) {
    throw new Error(`Jupiter quote failed with ${quoteResponse.status}`);
  }

  const quotePayload = (await quoteResponse.json()) as {
    outAmount?: string;
    [key: string]: unknown;
  };
  if (!quotePayload.outAmount) {
    throw new Error("Jupiter quote missing outAmount");
  }

  const jupiterApiKey = process.env.JUPITER_API_KEY;
  const swapResponse = await fetch(JUPITER_SWAP_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}),
    },
    body: JSON.stringify({
      quoteResponse: quotePayload,
      userPublicKey: walletAddress,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });

  if (!swapResponse.ok) {
    throw new Error(`Jupiter swap tx build failed with ${swapResponse.status}`);
  }

  const swapPayload = (await swapResponse.json()) as {
    swapTransaction?: string;
  };

  if (!swapPayload.swapTransaction) {
    throw new Error("Jupiter swap response missing transaction");
  }

  const expectedOut = Number(quotePayload.outAmount) / 10 ** toToken.decimals;
  return {
    kind: "swap" as const,
    fromSymbol,
    toSymbol,
    fromMint: fromToken.mint,
    toMint: toToken.mint,
    amount: amount.toString(),
    expectedOut: expectedOut.toFixed(6),
    slippageBps,
    swapTransaction: swapPayload.swapTransaction,
  };
}

async function askGemini(prompt: string, solPrice?: number, swapHistory?: AssistantRequest["swapHistory"]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  const contextBlock = JSON.stringify(
    {
      solPrice,
      recentSwaps: swapHistory ?? [],
      supportedPairs: Object.keys(TOKEN_MAP),
      instructions: [
        "Focus only on Solana market context.",
        "If user asks for trading suggestions, include concise risk-managed ideas.",
        "If user asks for backtest, provide assumptions and what to validate before execution.",
      ],
    },
    null,
    2,
  );

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "You are a production Solana trading assistant. Reply in JSON only with keys: reply (string), suggestions (string[]), strategyNotes (string[]).\n" +
                `Context:\n${contextBlock}\n\n` +
                `User prompt: ${prompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini failed with ${response.status}`);
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
      suggestions?: string[];
      strategyNotes?: string[];
    };
    return {
      reply: parsed.reply ?? "No response generated.",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 4) : [],
      strategyNotes: Array.isArray(parsed.strategyNotes) ? parsed.strategyNotes.slice(0, 4) : [],
    };
  } catch {
    return {
      reply: text || "No response generated.",
      suggestions: [],
      strategyNotes: [],
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

    const swapIntent = parseSwapIntent(prompt);
    let action: Awaited<ReturnType<typeof createJupiterSwap>> | undefined;
    if (swapIntent && body.walletAddress) {
      action = await createJupiterSwap(
        body.walletAddress,
        swapIntent.amount,
        swapIntent.fromSymbol,
        swapIntent.toSymbol,
      );
    }

    const ai = await askGemini(prompt, body.solPrice, body.swapHistory);
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
