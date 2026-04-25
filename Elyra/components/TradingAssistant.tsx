"use client";

import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  Loader2,
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

function newMessageId() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type ChatMessage = {
  id: string;
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

const AGENT_PROFILES = [
  { id: 1, name: "Agent 1", role: "Discovery", colorClass: "border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-200" },
  { id: 2, name: "Agent 2", role: "Alpha", colorClass: "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" },
  { id: 3, name: "Agent 3", role: "Risk", colorClass: "border-amber-400/50 bg-amber-500/10 text-amber-200" },
  { id: 4, name: "Agent 4", role: "Execution", colorClass: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200" },
  { id: 5, name: "Agent 5", role: "Portfolio", colorClass: "border-violet-400/50 bg-violet-500/10 text-violet-200" },
] as const;

/** One ordered pass: Agent 1 → … → Agent 5 (one line each, Grok-style density). */
const AGENT_SWARM_TASKS: readonly string[] = [
  "Regime & liquidity",
  "Alpha ranking",
  "Risk limits",
  "Route & fees",
  "Desk memo",
] as const;

type MultiAgentRun = {
  userMessageId: string;
  /** 0–4 = that agent is active; 5 = all five finished */
  stage: number;
  /** Set when the assistant reply is appended (may jump ahead of timed stages). */
  replyReady: boolean;
  /** Request failed after the swarm had started. */
  failed?: boolean;
};

const AGENT_SWARM_TICK_MS = 520;

const AGENT_LABEL_COLOR = [
  "text-fuchsia-200/90",
  "text-cyan-200/90",
  "text-amber-200/90",
  "text-emerald-200/90",
  "text-violet-200/90",
] as const;

function MultiAgentSwarmCard({ run }: { run: MultiAgentRun }) {
  const workingIndex = Math.min(run.stage, 4);
  const agent = AGENT_PROFILES[workingIndex];
  const task = AGENT_SWARM_TASKS[workingIndex] ?? "";
  const labelColor = AGENT_LABEL_COLOR[workingIndex] ?? "text-white/80";

  const stripKey = run.failed
    ? "failed"
    : run.replyReady
      ? "ready"
      : run.stage >= 5
        ? "finalize"
        : `agent-${run.stage}`;

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border border-white/[0.07] bg-black/55 px-2 py-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-violet-400/25 to-transparent opacity-80" />
      <div className="relative flex items-center gap-2">
        <div className="flex shrink-0 gap-0.5" aria-hidden>
          {AGENT_PROFILES.map((_, i) => {
            if (run.failed) {
              const hit = i <= Math.min(run.stage, 4);
              return (
                <span
                  key={i}
                  className={`h-1 w-1 rounded-full transition-colors duration-200 ${
                    hit ? "bg-rose-400/70" : "bg-white/[0.12]"
                  }`}
                />
              );
            }
            if (run.replyReady) {
              return (
                <span
                  key={i}
                  className="h-1 w-1 rounded-full bg-emerald-400/55 transition-colors duration-200"
                />
              );
            }
            const done = run.stage > i;
            const active = run.stage === i && run.stage < 5;
            return (
              <motion.span
                key={i}
                layout
                className={`block h-1 w-1 rounded-full ${
                  done
                    ? "bg-emerald-500/45"
                    : active
                      ? "bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.55)]"
                      : "bg-white/[0.12]"
                }`}
                animate={
                  active
                    ? { opacity: [0.55, 1, 0.55], scale: [1, 1.15, 1] }
                    : { opacity: 1, scale: 1 }
                }
                transition={
                  active
                    ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.2 }
                }
              />
            );
          })}
        </div>

        <div className="h-2.5 w-px shrink-0 bg-white/[0.08]" aria-hidden />

        <div className="min-w-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stripKey}
              initial={{ opacity: 0, x: 5 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -5 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-w-0 items-center gap-1.5"
            >
              {run.failed ? (
                <p className="truncate text-[10px] leading-tight text-rose-200/90">
                  <span className="font-mono text-white/45">Swarm</span>{" "}
                  <span className="text-white/35">·</span> stopped
                </p>
              ) : run.replyReady ? (
                <p className="truncate text-[10px] leading-tight text-emerald-200/85">
                  <span className="font-mono text-white/45">5 agents</span>{" "}
                  <span className="text-white/35">·</span> done
                </p>
              ) : run.stage >= 5 ? (
                <p className="truncate text-[10px] leading-tight text-sky-200/85">
                  <span className="font-mono text-white/45">Swarm</span>{" "}
                  <span className="text-white/35">·</span> finalizing…
                </p>
              ) : (
                <p className="min-w-0 truncate text-[10px] leading-tight">
                  <span className={`font-mono font-semibold ${labelColor}`}>
                    Agent {agent.id}
                  </span>
                  <span className="text-white/35"> · </span>
                  <span className="text-white/55">{agent.role}</span>
                  <span className="text-white/35"> · </span>
                  <span className="text-white/40">{task}</span>
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {!run.replyReady && !run.failed ? (
          <Loader2
            size={11}
            className="shrink-0 animate-spin text-white/35"
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}

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

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-[12px] leading-snug text-white/92">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="text-[13px] font-semibold text-white">{children}</h3>,
          h2: ({ children }) => <h3 className="text-[13px] font-semibold text-white">{children}</h3>,
          h3: ({ children }) => <h4 className="text-[12px] font-semibold text-white">{children}</h4>,
          p: ({ children }) => <p className="break-words whitespace-pre-wrap text-[12px] leading-snug text-white/92">{children}</p>,
          ul: ({ children }) => <ul className="space-y-1 pl-4 text-[12px] text-white/90">{children}</ul>,
          ol: ({ children }) => <ol className="space-y-1 pl-4 text-[12px] text-white/90">{children}</ol>,
          li: ({ children }) => <li className="list-disc">{children}</li>,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-white/12 bg-black/35">
              <table className="min-w-full border-collapse text-left text-[11px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/[0.06] text-white/80">{children}</thead>,
          tbody: ({ children }) => <tbody className="text-white/88">{children}</tbody>,
          tr: ({ children }) => <tr className="border-t border-white/10 first:border-t-0">{children}</tr>,
          th: ({ children }) => <th className="px-2.5 py-2 font-semibold whitespace-nowrap">{children}</th>,
          td: ({ children }) => <td className="px-2.5 py-2 align-top">{children}</td>,
          code: ({ children }) => (
            <code className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[11px] text-white/95">{children}</code>
          ),
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic text-white/90">{children}</em>,
          hr: () => <hr className="my-2 border-white/12" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

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
  const chatSessionRef = useRef(0);
  const progressTimerRef = useRef<number | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [executingSwapAt, setExecutingSwapAt] = useState<number | null>(null);
  const [swarmRun, setSwarmRun] = useState<MultiAgentRun | null>(null);
  /** Finished swarms keyed by user message id (keeps history after a new question). */
  const [completedSwarms, setCompletedSwarms] = useState<Record<string, MultiAgentRun>>({});
  const [landingStartIndex, setLandingStartIndex] = useState(0);
  const [showInputSuggestions, setShowInputSuggestions] = useState(true);

  const clearProgressTimer = () => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const startNewChat = () => {
    chatSessionRef.current += 1;
    clearProgressTimer();
    setMessages([]);
    setPrompt("");
    setIsSubmitting(false);
    setExecutingSwapAt(null);
    setSwarmRun(null);
    setCompletedSwarms({});
    setShowInputSuggestions(true);
    setLandingStartIndex(0);
  };

  const canTrade = Boolean(walletAddress);
  const showLanding = messages.length === 0;
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

    const sessionAtStart = chatSessionRef.current;

    const userMessage: ChatMessage = {
      id: newMessageId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    const stale = () => sessionAtStart !== chatSessionRef.current;

    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    setIsSubmitting(true);
    setSwarmRun({
      userMessageId: userMessage.id,
      stage: 0,
      replyReady: false,
    });

    clearProgressTimer();
    progressTimerRef.current = window.setInterval(() => {
      if (stale()) {
        clearProgressTimer();
        return;
      }
      setSwarmRun((prev) => {
        if (!prev || prev.replyReady || prev.failed) {
          return prev;
        }
        const nextStage = Math.min(prev.stage + 1, 5);
        return { ...prev, stage: nextStage };
      });
    }, AGENT_SWARM_TICK_MS);

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

      if (stale()) {
        clearProgressTimer();
        return;
      }

      const assistantTimestamp = Date.now();
      clearProgressTimer();
      setSwarmRun((prev) =>
        prev && prev.userMessageId === userMessage.id
          ? { ...prev, stage: 5, replyReady: true }
          : prev,
      );
      setCompletedSwarms((history) => ({
        ...history,
        [userMessage.id]: {
          userMessageId: userMessage.id,
          stage: 5,
          replyReady: true,
        },
      }));
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
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
        if (!stale()) {
          setMessages((prev) => [
            ...prev,
            {
              id: newMessageId(),
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
      }
    } catch (error) {
      clearProgressTimer();
      if (!stale()) {
        setSwarmRun((prev) =>
          prev && prev.userMessageId === userMessage.id
            ? { ...prev, stage: 5, replyReady: false, failed: true }
            : prev,
        );
        setCompletedSwarms((history) => ({
          ...history,
          [userMessage.id]: {
            userMessageId: userMessage.id,
            stage: 5,
            replyReady: false,
            failed: true,
          },
        }));
        setMessages((prev) => [
          ...prev,
          {
            id: newMessageId(),
            role: "assistant",
            content: `Request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            timestamp: Date.now(),
          },
        ]);
      }
    } finally {
      if (!stale()) {
        setIsSubmitting(false);
      }
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await submitPrompt();
  };

  const formatAssistantText = (text: string) => text.trim();

  const runSwap = async (action: SwapAction, messageTimestamp: number) => {
    if (!canTrade) {
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: "assistant",
          content: "Connect or create a Solana wallet first to execute swaps.",
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    setExecutingSwapAt(messageTimestamp);
    const simulatedSignature = `SIM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    onManualSwapRecorded({
      fromSymbol: action.fromSymbol,
      toSymbol: action.toSymbol,
      amount: action.amount,
      status: "confirmed",
    });
    const result: { signature?: string; error?: string } = { signature: simulatedSignature };
    setExecutingSwapAt(null);

    setMessages((prev) => [
      ...prev,
      {
        id: newMessageId(),
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

  useEffect(() => {
    if (showLanding) {
      return;
    }
    const el = messagesScrollRef.current;
    if (!el) {
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 160) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, showLanding]);

  const shiftLandingCards = (direction: "prev" | "next") => {
    setLandingStartIndex((prev) => {
      if (direction === "next") {
        return (prev + 1) % LANDING_CARDS.length;
      }
      return (prev - 1 + LANDING_CARDS.length) % LANDING_CARDS.length;
    });
  };

  return (
    <div className="flex h-full max-h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black text-white">
      <div className="mb-0 flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <div>
          <div className="text-[13px] font-bold tracking-tight text-white">Elyra</div>
         
        </div>
        <div className="flex items-center gap-1 text-white/55">
          <button
            type="button"
            onClick={startNewChat}
            className="rounded-lg p-2 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="New chat"
            title="New chat"
          >
            <Plus size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={startNewChat}
            className="rounded-lg p-2 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Reset conversation"
            title="Reset conversation"
          >
            <RotateCcw size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="rounded-lg p-2 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Help"
            title="Ask about Solana trades, strategies, or swaps"
          >
            <CircleHelp size={15} strokeWidth={2} />
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
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-white/[0.06] px-3 py-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-snug text-white/65">
              <span>
                SOL{" "}
                <span className="font-semibold text-white">${solPrice.toFixed(2)}</span>
              </span>
              <span className="text-white/25" aria-hidden>
                ·
              </span>
              <span className="min-w-0 truncate font-mono text-[9px] text-white/45">
                {walletAddress ?? "No wallet"}
              </span>
            </div>
          </div>

          <div
            ref={messagesScrollRef}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-y-contain px-2.5 py-2 pr-1.5 [scrollbar-width:thin] [scrollbar-color:#2a2a35_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb:hover]:bg-white/20"
          >
            {messages.map((message) => {
              const isUser = message.role === "user";
              const swarmForUser =
                isUser
                  ? swarmRun?.userMessageId === message.id
                    ? swarmRun
                    : completedSwarms[message.id]
                  : undefined;
              const body = isUser ? (
                <p className="break-words whitespace-pre-wrap text-[12px] leading-snug text-white/95">
                  {message.content}
                </p>
              ) : (
                <AssistantMarkdown content={message.content} />
              );

              return (
                <Fragment key={message.id}>
                <div
                  className={`flex min-w-0 w-full ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`min-w-0 max-w-[min(100%,28rem)] ${
                      isUser
                        ? "rounded-xl rounded-br-sm border border-indigo-400/35 bg-linear-to-br from-indigo-500/25 via-violet-600/18 to-fuchsia-600/12 px-3 py-2 shadow-[0_8px_28px_-14px_rgba(99,102,241,0.3)]"
                        : "rounded-xl rounded-bl-sm border border-white/[0.08] bg-white/[0.04] px-3 py-2 shadow-[0_6px_24px_-14px_rgba(0,0,0,0.75)] backdrop-blur-md"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
                          isUser ? "text-indigo-100/80" : "text-white/40"
                        }`}
                      >
                        {isUser ? "You" : "Elyra"}
                      </span>
                      <span className="text-[10px] text-white/30">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {body}

                    {message.executionReport ? (
                      <div className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-500/[0.07] p-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/90">
                          Simulated execution
                        </p>
                        <p className="mt-1.5 font-mono text-[11px] text-emerald-100/90">
                          {message.executionReport.route} · {message.executionReport.size}
                        </p>
                        <p className="mt-1 text-[11px] text-white/70">
                          Out ≈ {message.executionReport.estimatedOutput}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-white/45">
                          {message.executionReport.simulatedTxId}
                        </p>
                      </div>
                    ) : null}

                    {message.strategyNotes && message.strategyNotes.length > 0 ? (
                      <div className="mt-2 rounded-lg border border-white/10 bg-black/25 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
                          Backtest / Strategy
                        </p>
                        <ul className="mt-2 space-y-1.5 text-[12px] text-white/82">
                          {message.strategyNotes.map((note) => (
                            <li key={note} className="flex gap-2">
                              <span className="text-indigo-300/80">·</span>
                              <span>{note}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {message.suggestions && message.suggestions.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.suggestions.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              void submitPrompt(item);
                            }}
                            className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/85 transition-colors hover:border-indigo-400/40 hover:bg-indigo-500/15"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {message.action?.kind === "swap" ? (
                      <div className="mt-2 rounded-lg border border-emerald-400/30 bg-linear-to-br from-emerald-500/12 to-teal-500/8 p-2">
                        <p className="text-xs font-semibold text-emerald-100">
                          Swap {message.action.amount} {message.action.fromSymbol} → {message.action.toSymbol}
                        </p>
                        <p className="mt-1 text-[11px] text-emerald-100/75">
                          Expected: ~{message.action.expectedOut} {message.action.toSymbol}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            void runSwap(message.action as SwapAction, message.timestamp);
                          }}
                          disabled={!canTrade || executingSwapAt === message.timestamp}
                          className="mt-2 w-full rounded-lg border border-emerald-400/40 bg-emerald-500/15 py-1.5 text-[11px] font-semibold text-emerald-50 transition hover:bg-emerald-500/25 disabled:opacity-50"
                        >
                          {executingSwapAt === message.timestamp ? "Executing…" : "Execute swap"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                {swarmForUser ? (
                  <div className="mt-1 flex min-w-0 w-full justify-end">
                    <div className="w-full min-w-0 max-w-[min(100%,28rem)]">
                      <MultiAgentSwarmCard run={swarmForUser} />
                    </div>
                  </div>
                ) : null}
                </Fragment>
              );
            })}
          </div>

          <div className="shrink-0 space-y-2 border-t border-white/[0.06] px-3 pb-2 pt-2">
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
                className="min-h-[44px] flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-white placeholder:text-white/40 focus:border-indigo-400/35 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="shrink-0 rounded-xl border border-indigo-400/50 bg-linear-to-br from-indigo-500/30 to-violet-600/25 px-5 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-indigo-500/15 disabled:opacity-50"
              >
                {isSubmitting ? "…" : "Send"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
