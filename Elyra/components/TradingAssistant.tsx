"use client";

import { FormEvent, useMemo, useState } from "react";

export type SwapAction = {
  kind: "swap";
  fromSymbol: string;
  toSymbol: string;
  fromMint: string;
  toMint: string;
  amount: string;
  expectedOut: string;
  slippageBps: number;
  swapTransaction: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  action?: SwapAction;
  suggestions?: string[];
  strategyNotes?: string[];
};

export type SwapHistoryItem = {
  id: string;
  fromSymbol: string;
  toSymbol: string;
  amount: string;
  signature?: string;
  status: "pending" | "confirmed" | "failed";
  createdAt: number;
  error?: string;
};

type TradingAssistantProps = {
  solPrice: number;
  walletAddress?: string;
  onExecuteSwap: (action: SwapAction) => Promise<{ signature?: string; error?: string }>;
  swapHistory: SwapHistoryItem[];
};

const STARTER_PROMPTS = [
  "What is the trend for SOL right now?",
  "Backtest a simple DCA strategy on SOL",
  "Swap 0.1 SOL to USDC",
  "Suggest a low-risk Solana strategy for today",
];

export default function TradingAssistant({
  solPrice,
  walletAddress,
  onExecuteSwap,
  swapHistory,
}: TradingAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "I am your Solana trading copilot. Ask market questions, request strategy ideas, or type a swap like 'Swap 0.1 SOL to USDC'.",
      timestamp: Date.now(),
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [executingSwapAt, setExecutingSwapAt] = useState<number | null>(null);

  const canTrade = Boolean(walletAddress);
  const historyPreview = useMemo(
    () => swapHistory.slice(0, 5).map(({ fromSymbol, toSymbol, amount, status, createdAt }) => ({
      fromSymbol,
      toSymbol,
      amount,
      status,
      createdAt,
    })),
    [swapHistory],
  );

  const submitPrompt = async (nextPrompt?: string) => {
    const text = (nextPrompt ?? prompt).trim();
    if (!text || isSubmitting) {
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          walletAddress: walletAddress ?? null,
          solPrice,
          swapHistory: historyPreview,
        }),
      });

      const payload = (await response.json()) as {
        reply?: string;
        suggestions?: string[];
        strategyNotes?: string[];
        action?: SwapAction;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Assistant failed with ${response.status}`);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: payload.reply ?? "I could not generate a reply right now.",
          timestamp: Date.now(),
          suggestions: payload.suggestions ?? [],
          strategyNotes: payload.strategyNotes ?? [],
          action: payload.action,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await submitPrompt();
  };

  const runSwap = async (action: SwapAction, messageTimestamp: number) => {
    if (!canTrade) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Connect or create a Solana wallet first to execute swaps.",
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    setExecutingSwapAt(messageTimestamp);
    const result = await onExecuteSwap(action);
    setExecutingSwapAt(null);

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: result.signature
          ? `Swap submitted successfully. Signature: ${result.signature}`
          : `Swap failed: ${result.error ?? "Unknown error"}`,
        timestamp: Date.now(),
      },
    ]);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold">Solana Assistant</p>
          <p className="text-xs text-white/50">Gemini + Jupiter Swap</p>
        </div>
      </div>

      <div className="mb-3 rounded-xl border border-white/10 bg-[#0f1628] p-3 text-xs text-white/75">
        Live SOL: <span className="font-semibold text-white">${solPrice.toFixed(2)}</span>
        <br />
        Wallet:{" "}
        <span className="font-mono text-[11px] text-white/60">
          {walletAddress ?? "No wallet connected"}
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((message) => (
          <div
            key={`${message.timestamp}-${message.role}`}
            className={`rounded-xl border p-3 ${
              message.role === "user"
                ? "ml-8 border-indigo-400/30 bg-indigo-500/10"
                : "mr-8 border-white/10 bg-[#0d1324]"
            }`}
          >
            <p className="text-sm text-white/90">{message.content}</p>

            {message.strategyNotes && message.strategyNotes.length > 0 ? (
              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2">
                <p className="text-[11px] uppercase tracking-wide text-white/50">Backtest / Strategy</p>
                <ul className="mt-1 space-y-1 text-xs text-white/80">
                  {message.strategyNotes.map((note) => (
                    <li key={note}>- {note}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {message.suggestions && message.suggestions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.suggestions.map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      void submitPrompt(item);
                    }}
                    className="rounded-md border border-white/15 bg-[#10192d] px-2 py-1 text-xs text-white/80 hover:bg-[#12213d]"
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}

            {message.action?.kind === "swap" ? (
              <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3">
                <p className="text-sm text-emerald-200">
                  Swap {message.action.amount} {message.action.fromSymbol} to {message.action.toSymbol}
                </p>
                <p className="mt-1 text-xs text-emerald-100/80">
                  Expected output: {message.action.expectedOut} {message.action.toSymbol}
                </p>
                <button
                  onClick={() => {
                    void runSwap(message.action as SwapAction, message.timestamp);
                  }}
                  disabled={!canTrade || executingSwapAt === message.timestamp}
                  className="mt-2 rounded-md border border-emerald-300/40 bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-100 disabled:opacity-60"
                >
                  {executingSwapAt === message.timestamp ? "Executing swap..." : "Execute swap"}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          {STARTER_PROMPTS.map((item) => (
            <button
              key={item}
              onClick={() => {
                void submitPrompt(item);
              }}
              className="rounded-md border border-white/10 bg-[#0d1324] px-2 py-1 text-xs text-white/80"
            >
              {item}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask Solana questions or type: Swap 0.1 SOL to USDC"
            className="w-full rounded-lg border border-white/15 bg-[#0d1324] px-3 py-2 text-sm text-white/90 placeholder:text-white/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg border border-indigo-400/60 bg-indigo-500/20 px-3 py-2 text-sm text-indigo-100 disabled:opacity-60"
          >
            {isSubmitting ? "..." : "Send"}
          </button>
        </form>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-[#0b1222] p-3">
        <p className="text-[11px] uppercase tracking-[0.15em] text-white/45">Recent Swap Activity</p>
        <div className="mt-2 space-y-1">
          {swapHistory.length === 0 ? (
            <p className="text-xs text-white/50">No swaps yet.</p>
          ) : (
            swapHistory.slice(0, 5).map((item) => (
              <p key={item.id} className="text-xs text-white/80">
                {item.amount} {item.fromSymbol} → {item.toSymbol} [{item.status}]
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
