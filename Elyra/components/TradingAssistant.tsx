"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Search,
  PencilLine,
  Sparkles,
  Plus,
  RotateCcw,
  CircleHelp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export type SwapAction = {
  kind?: "swap";
  fromSymbol: string;
  toSymbol: string;
  fromMint: string;
  toMint: string;
  amount: string;
  expectedOut: string;
  slippageBps: number;
  jupiterSwapUrl: string;
  userPublicKey?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  action?: SwapAction;
  suggestions?: string[];
  strategyNotes?: string[];
  executionReport?: {
    route: string;
    size: string;
    estimatedOutput: string;
    simulatedTxId: string;
    executedAt: string;
  };
};

type AgentTrace = {
  id: number;
  agentId: number;
  agentName: string;
  task: string;
};

type LiveAgentState = {
  agentId: number;
  agentName: string;
  task: string;
  colorClass: string;
};

const AGENT_PROFILES = [
  { id: 1, name: "Agent 1", role: "Discovery", colorClass: "border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-200" },
  { id: 2, name: "Agent 2", role: "Alpha", colorClass: "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" },
  { id: 3, name: "Agent 3", role: "Risk", colorClass: "border-amber-400/50 bg-amber-500/10 text-amber-200" },
  { id: 4, name: "Agent 4", role: "Execution", colorClass: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200" },
  { id: 5, name: "Agent 5", role: "Portfolio", colorClass: "border-violet-400/50 bg-violet-500/10 text-violet-200" },
] as const;

const AGENT_TASKS = [
  [1, "scanning onchain momentum regime"],
  [2, "ranking SOL edges vs stablecoin rotation"],
  [3, "checking drawdown and slippage limits"],
  [1, "refining signal confidence"],
  [4, "simulating route + fee path"],
  [3, "revalidating risk guardrails"],
  [1, "confirming market context coherence"],
  [5, "sizing final capital allocation"],
] as const;

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
  solBalance: number;
  walletAddress?: string;
  swapHistory: SwapHistoryItem[];
  onManualSwapRecorded: (entry: {
    fromSymbol: string;
    toSymbol: string;
    amount: string;
    status: "confirmed" | "failed";
    error?: string;
  }) => void;
};

const STARTER_PROMPTS = [
  "What is the trend for SOL right now?",
  "Backtest a simple DCA strategy on SOL",
  "Swap 0.1 SOL to USDC",
  "Suggest a low-risk Solana strategy for today",
];

const LANDING_CARDS = [
  { title: "Draw support & resistance levels", subtitle: "Strategy", icon: PencilLine },
  { title: "Volatility Regime Analyzer", subtitle: "Research", icon: Search },
  { title: "Backtest 2 years btc DCA", subtitle: "Strategy", icon: Bot },
  { title: "Meteora DAMM & LST Yield Allocation Optimizer", subtitle: "Strategy", icon: Sparkles },
  { title: "Momentum breakout scanner", subtitle: "Research", icon: Search },
  { title: "SOL mean reversion setup", subtitle: "Strategy", icon: Bot },
  { title: "Whale flow sentiment tracker", subtitle: "Research", icon: Sparkles },
  { title: "Risk-adjusted portfolio rebalance", subtitle: "Strategy", icon: PencilLine },
];

export default function TradingAssistant({
  solPrice,
  solBalance,
  walletAddress,
  swapHistory,
  onManualSwapRecorded,
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
  const [landingStartIndex, setLandingStartIndex] = useState(0);
  const [showInputSuggestions, setShowInputSuggestions] = useState(true);

  const canTrade = Boolean(walletAddress);
  const showLanding = messages.length <= 1;
  const visibleLandingCards = useMemo(() => {
    const pageSize = 4;
    return Array.from({ length: pageSize }, (_, offset) => {
      const index = (landingStartIndex + offset) % LANDING_CARDS.length;
      return LANDING_CARDS[index];
    });
  }, [landingStartIndex]);
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

    const agentTrace: AgentTrace[] = [];
    let currentStep = 0;
    const [firstAgentId, firstTask] = AGENT_TASKS[0];
    const firstAgent = AGENT_PROFILES.find((agent) => agent.id === firstAgentId);
    if (firstAgent) {
      setLiveAgentState({
        agentId: firstAgent.id,
        agentName: `${firstAgent.name} · ${firstAgent.role}`,
        task: firstTask,
        colorClass: firstAgent.colorClass,
      });
      agentTrace.push({
        id: 1,
        agentId: firstAgent.id,
        agentName: `${firstAgent.name} · ${firstAgent.role}`,
        task: firstTask,
      });
    }
    const progressTimer = window.setInterval(() => {
      currentStep += 1;
      if (currentStep >= AGENT_TASKS.length) {
        window.clearInterval(progressTimer);
        return;
      }
      const [agentId, task] = AGENT_TASKS[currentStep];
      const nextAgent = AGENT_PROFILES.find((agent) => agent.id === agentId);
      if (!nextAgent) {
        return;
      }
      setLiveAgentState({
        agentId: nextAgent.id,
        agentName: `${nextAgent.name} · ${nextAgent.role}`,
        task,
        colorClass: nextAgent.colorClass,
      });
      agentTrace.push({
        id: currentStep + 1,
        agentId: nextAgent.id,
        agentName: `${nextAgent.name} · ${nextAgent.role}`,
        task,
      });
    }, 450);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          walletAddress: walletAddress ?? null,
          solPrice,
          solBalance,
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

      const assistantTimestamp = Date.now();
      window.clearInterval(progressTimer);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: formatAssistantText(payload.reply ?? "I could not generate a reply right now."),
          timestamp: assistantTimestamp,
          suggestions: payload.suggestions ?? [],
          strategyNotes: payload.strategyNotes ?? [],
          action: payload.action,
        },
      ]);
      if (payload.action) {
        const action = payload.action;
        const simulatedSignature = `SIM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
        const executedAt = new Date().toISOString();
        onManualSwapRecorded({
          fromSymbol: action.fromSymbol,
          toSymbol: action.toSymbol,
          amount: action.amount,
          status: "confirmed",
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Execution completed.",
            timestamp: Date.now(),
            executionReport: {
              route: `${action.fromSymbol}/${action.toSymbol}`,
              size: `${action.amount} ${action.fromSymbol}`,
              estimatedOutput: `${action.expectedOut} ${action.toSymbol}`,
              simulatedTxId: simulatedSignature,
              executedAt,
            },
          },
        ]);
      }
      setLiveAgentState(null);
    } catch (error) {
      window.clearInterval(progressTimer);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        },
      ]);
      setLiveAgentState(null);
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

  useEffect(() => {
    if (!showLanding) {
      return;
    }
    const interval = window.setInterval(() => {
      setLandingStartIndex((prev) => (prev + 1) % LANDING_CARDS.length);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [showLanding]);

  const shiftLandingCards = (direction: "prev" | "next") => {
    setLandingStartIndex((prev) => {
      if (direction === "next") {
        return (prev + 1) % LANDING_CARDS.length;
      }
      return (prev - 1 + LANDING_CARDS.length) % LANDING_CARDS.length;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black text-white">
      <div className="mb-2 flex items-center justify-between px-4 py-3">
        <div className="text-sm font-bold text-white">New chat</div>
        <div className="flex items-center gap-3 text-white/60">
          <button className="hover:text-white" aria-label="New chat">
            <Plus size={13} />
          </button>
          <button className="hover:text-white" aria-label="History">
            <RotateCcw size={13} />
          </button>
          <button className="hover:text-white" aria-label="Help">
            <CircleHelp size={13} />
          </button>
        </div>
      </div>

      {showLanding ? (
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
          <div className="min-h-0 flex-1">
            <div className="mx-auto flex h-full w-full max-w-[94%] flex-col justify-center py-1 text-center">
              <div className="mx-auto flex w-fit items-center gap-2">
                <Image src="/logo.png" alt="Elyra" width={22} height={22} className="rounded-full" />
                <h2 className="text-lg font-extrabold leading-none text-white sm:text-xl">Elyra</h2>
              </div>
              <p className="mt-1 text-base font-bold leading-none text-white sm:text-lg">Keep your money moving</p>
              <p className="mt-1 text-[11px] font-semibold text-[#a69ef0] sm:text-xs">How can I help you today?</p>

              <div className="mt-3 overflow-hidden text-left">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={landingStartIndex}
                    initial={{ x: 28, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -28, opacity: 0 }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    className="space-y-1.5"
                  >
                    {visibleLandingCards.map((card) => {
                      const Icon = card.icon;
                      return (
                        <button
                          key={card.title}
                          onClick={() => {
                            void submitPrompt(card.title);
                          }}
                          className="w-full border border-indigo-400/25 bg-black px-2.5 py-1.5 hover:border-indigo-400/45"
                        >
                          <div className="flex items-start gap-2.5">
                            <Icon size={12} className="mt-0.5 text-indigo-300/90" />
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-semibold text-white sm:text-xs">{card.title}</p>
                              <p className="text-[10px] text-white/45">{card.subtitle}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-white/45">currently only on Solana</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Previous suggestions"
                    onClick={() => shiftLandingCards("prev")}
                    className="border border-white/15 bg-black/50 p-1 text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next suggestions"
                    onClick={() => shiftLandingCards("next")}
                    className="border border-white/15 bg-black/50 p-1 text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-2 shrink-0">
            <div className="border border-indigo-400/25 bg-black p-2">
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask about trades or / for shortcuts"
                className="w-full bg-transparent px-2 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none"
              />
              <div className="flex items-center justify-between px-2 pb-1">
                <span className="text-white/40">⌄</span>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="border border-indigo-400/50 bg-indigo-500/20 px-2 py-1 text-xs text-white disabled:opacity-60"
                >
                  ↑
                </button>
              </div>
            </div>
          </form>
          <p className="mt-2 px-1 text-[10px] text-white/35">
            Elyra gives guidance, not certainty. Review key information.
          </p>
        </div>
      ) : (
        <>
          <div className="px-4">
            <div className="mb-3 border border-white/10 bg-black p-3 text-[11px] text-white/75">
              Live SOL: <span className="font-semibold text-white">${solPrice.toFixed(2)}</span>
              <br />
              Wallet:{" "}
              <span className="font-mono text-[11px] text-white/60">
                {walletAddress ?? "No wallet connected"}
              </span>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 pr-2 [scrollbar-width:thin] [scrollbar-color:#1f1f1f_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#1f1f1f] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-[#2a2a2a]">
            {messages.map((message) => (
              <div
                key={`${message.timestamp}-${message.role}`}
                className={`border p-3 ${
                  message.role === "user"
                    ? "ml-8 border-indigo-400/35 bg-black"
                    : "mr-8 border-white/10 bg-black"
                }`}
              >
                <p className="text-xs font-semibold text-white">{message.content}</p>

                {message.strategyNotes && message.strategyNotes.length > 0 ? (
                  <div className="mt-3 border border-white/10 bg-black/20 p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Backtest / Strategy</p>
                    <ul className="mt-1 space-y-1 text-[11px] text-white/80">
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
                        className="border border-white/15 bg-black px-2 py-1 text-[11px] text-white/75 hover:bg-white/5"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : null}

                {message.action?.kind === "swap" ? (
                  <div className="mt-3 border border-emerald-400/35 bg-black p-3">
                    <p className="text-xs font-semibold text-emerald-200">
                      Swap {message.action.amount} {message.action.fromSymbol} to {message.action.toSymbol}
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-100/80">
                      Expected output: {message.action.expectedOut} {message.action.toSymbol}
                    </p>
                    <button
                      onClick={() => {
                        void runSwap(message.action as SwapAction, message.timestamp);
                      }}
                      disabled={!canTrade || executingSwapAt === message.timestamp}
                      className="mt-2 border border-emerald-300/45 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-100 disabled:opacity-60"
                    >
                      {executingSwapAt === message.timestamp ? "Executing swap..." : "Execute swap"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-3 space-y-2 px-4 pb-3">
            {showInputSuggestions ? (
              <div className="relative border border-white/10 bg-black p-2 pr-8">
                <button
                  type="button"
                  aria-label="Hide suggestions"
                  onClick={() => setShowInputSuggestions(false)}
                  className="absolute right-2 top-1.5 text-white/55 hover:text-white"
                >
                  ×
                </button>
                <div className="flex flex-wrap gap-2">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        void submitPrompt(item);
                      }}
                      className="border border-white/10 bg-black px-2 py-1 text-[11px] font-semibold text-white/85 hover:bg-white/5"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask Solana questions or type: Swap 0.1 SOL to USDC"
                className="w-full border border-white/15 bg-black px-3 py-2 text-xs font-semibold text-white placeholder:text-white/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="border border-indigo-400/60 bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-100 disabled:opacity-60"
              >
                {isSubmitting ? "..." : "Send"}
              </button>
            </form>

            <div className="mt-2 border border-white/10 bg-black p-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/45">Recent Swap Activity</p>
              <div className="mt-2 space-y-1">
                {swapHistory.length === 0 ? (
                  <p className="text-[11px] text-white/50">No swaps yet.</p>
                ) : (
                  swapHistory.slice(0, 5).map((item) => (
                    <p key={item.id} className="text-[11px] text-white/80">
                      {item.amount} {item.fromSymbol} → {item.toSymbol} [{item.status}]
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
