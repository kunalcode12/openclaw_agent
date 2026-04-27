"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const INVITE_UNLOCK_KEY = "elyra_invite_unlocked";
const VALID_INVITE_CODES = [
  "ELYRA1",
  "ALPHA7",
  "SWARM9",
  "PRIVY8",
  "SOLANA",
] as const;

// Animated grid/noise background component
function GridBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      {/* Deep black base */}
      <div className="absolute inset-0 bg-[#030303]" />

      {/* Subtle radial glow at center */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,255,255,0.03) 0%, transparent 70%)",
        }}
      />

      {/* Top-left corner glow */}
      <div
        className="absolute -top-40 -left-40 w-96 h-96 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* Bottom-right corner glow */}
      <div
        className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(100,200,255,0.04) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      {/* Fine grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Larger grid overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "240px 240px",
        }}
      />

      {/* Noise texture overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.4'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
        }}
      />

      {/* Diagonal accent lines */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.04]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line
          x1="0"
          y1="30%"
          x2="100%"
          y2="70%"
          stroke="white"
          strokeWidth="0.5"
        />
        <line
          x1="0"
          y1="70%"
          x2="100%"
          y2="30%"
          stroke="white"
          strokeWidth="0.5"
        />
        <line
          x1="20%"
          y1="0"
          x2="80%"
          y2="100%"
          stroke="white"
          strokeWidth="0.5"
        />
      </svg>

      {/* Star/logo echo shapes in background */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] opacity-[0.015]"
        style={{
          background: "radial-gradient(circle, white 0%, transparent 60%)",
          transform: "translate(-50%, -50%) rotate(22.5deg)",
        }}
      >
        {/* 8-pointed star echo */}
        <svg
          viewBox="0 0 200 200"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <polygon
            points="100,5 115,85 195,100 115,115 100,195 85,115 5,100 85,85"
            fill="white"
            opacity="0.5"
          />
        </svg>
      </div>
    </div>
  );
}

// Floating orb component
function FloatingOrb({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`absolute rounded-full pointer-events-none ${className}`}
      style={{
        animation: "float 8s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

// Shimmer line component
function ShimmerLine({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="absolute h-px w-full overflow-hidden"
      style={{ animationDelay: `${delay}s` }}
    >
      <div
        className="h-full w-1/3"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
          animation: `shimmer 3s ease-in-out ${delay}s infinite`,
        }}
      />
    </div>
  );
}

export default function InviteCodePage() {
  const router = useRouter();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [contentScale, setContentScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateScale = () => {
      const viewportEl = viewportRef.current;
      const contentEl = contentRef.current;
      if (!viewportEl || !contentEl) return;

      const availableHeight = viewportEl.clientHeight;
      const availableWidth = viewportEl.clientWidth;
      const contentHeight = contentEl.scrollHeight;
      const contentWidth = contentEl.scrollWidth;
      if (!contentHeight || !contentWidth) return;

      const heightScale = availableHeight / contentHeight;
      const widthScale = availableWidth / contentWidth;
      const nextScale = Math.min(1, Math.max(0.72, Math.min(heightScale, widthScale)));
      setContentScale(nextScale);
    };

    updateScale();
    const resizeObserver = new ResizeObserver(updateScale);
    if (viewportRef.current) resizeObserver.observe(viewportRef.current);
    if (contentRef.current) resizeObserver.observe(contentRef.current);
    window.addEventListener("resize", updateScale);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, []);

  const handleInput = (i: number, val: string) => {
    const char = val.slice(-1).toUpperCase();
    if (!/[A-Z0-9]/.test(char) && char !== "") return;
    const newCode = [...code];
    newCode[i] = char;
    setCode(newCode);
    if (char && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
    if (e.key === "Enter" && code.every((c) => c)) handleSubmit();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 6);
    const newCode = Array(6)
      .fill("")
      .map((_, i) => pasted[i] || "");
    setCode(newCode);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleSubmit = async () => {
    if (!code.every((c) => c)) return;
    setStatus("loading");
    await new Promise((r) => setTimeout(r, 2000));
    const full = code.join("");
    const isValid = VALID_INVITE_CODES.includes(
      full as (typeof VALID_INVITE_CODES)[number],
    );
    setStatus(isValid ? "success" : "error");

    if (isValid && typeof window !== "undefined") {
      window.localStorage.setItem(INVITE_UNLOCK_KEY, "true");
      window.setTimeout(() => {
        router.replace("/");
      }, 450);
      return;
    }

    if (!isValid) {
      setTimeout(() => setStatus("idle"), 2500);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap');

        * { box-sizing: border-box; }

        html, body {
          height: 100%;
          margin: 0;
          padding: 0;
        }

        #__next, main {
          height: 100%;
        }

        body {
          font-family: 'Syne', sans-serif;
          background: #030303;
          margin: 0;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-20px) scale(1.05); }
        }

        @keyframes shimmer {
          0% { transform: translateX(-200%); }
          100% { transform: translateX(400%); }
        }

        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }

        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        @keyframes data-flow {
          0% { stroke-dashoffset: 200; opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }

        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }

        @keyframes swarm-pulse {
          0%, 100% { opacity: 0.05; }
          50% { opacity: 0.12; }
        }

        .animate-fade-up { animation: fade-up 0.8s ease forwards; }
        .animate-fade-up-1 { animation: fade-up 0.8s ease 0.1s forwards; opacity: 0; }
        .animate-fade-up-2 { animation: fade-up 0.8s ease 0.2s forwards; opacity: 0; }
        .animate-fade-up-3 { animation: fade-up 0.8s ease 0.3s forwards; opacity: 0; }
        .animate-fade-up-4 { animation: fade-up 0.8s ease 0.4s forwards; opacity: 0; }
        .animate-fade-up-5 { animation: fade-up 0.8s ease 0.5s forwards; opacity: 0; }
        .animate-fade-up-6 { animation: fade-up 0.8s ease 0.6s forwards; opacity: 0; }
        .animate-fade-up-7 { animation: fade-up 0.8s ease 0.7s forwards; opacity: 0; }

        .code-input {
          caret-color: white;
          transition: all 0.2s ease;
        }

        .code-input:focus {
          outline: none;
          border-color: rgba(255,255,255,0.5);
          background: rgba(255,255,255,0.07);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 0 20px rgba(255,255,255,0.05);
        }

        .submit-btn {
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .submit-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .submit-btn:hover::before { opacity: 1; }
        .submit-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 32px rgba(255,255,255,0.1); }
        .submit-btn:active { transform: translateY(0); }

        .status-badge {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.15em;
        }

        .scanline-effect {
          animation: scanline 8s linear infinite;
          pointer-events: none;
        }

        .logo-star {
          filter: drop-shadow(0 0 20px rgba(255,255,255,0.3));
        }
      `}</style>

      <GridBackground />

      {/* Scanline effect */}
      <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden">
        <div
          className="scanline-effect absolute w-full h-[2px]"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.02), transparent)",
          }}
        />
      </div>

      {/* Main layout — scrollable wrapper so nothing gets clipped */}
      <div
        className="relative z-20 flex flex-col overflow-hidden"
        style={{
          minHeight: "100dvh",
          paddingTop: "max(env(safe-area-inset-top), 12px)",
          paddingBottom: "max(env(safe-area-inset-bottom), 8px)",
        }}
      >
        {/* Top navigation bar */}
        <nav className="shrink-0 flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-white/6">
          <div className="flex items-center gap-3 animate-fade-up">
            {/* Logo mark */}
            <div className="w-7 h-7 logo-star">
              <img
                src="/logo.png"
                alt="Elyra"
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = "none";
                  const svg = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "svg",
                  );
                  svg.setAttribute("viewBox", "0 0 100 100");
                  svg.style.width = "28px";
                  svg.style.height = "28px";
                  const polygon = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "polygon",
                  );
                  polygon.setAttribute(
                    "points",
                    "50,2 61,38 98,38 68,59 79,95 50,74 21,95 32,59 2,38 39,38",
                  );
                  polygon.setAttribute("fill", "white");
                  svg.appendChild(polygon);
                  target.parentNode?.appendChild(svg);
                }}
              />
            </div>
            <span className="text-white font-bold text-sm tracking-[0.15em] uppercase">
              Elyra
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-6 animate-fade-up-1">
            <span className="status-badge text-white/30 hidden sm:block">
              PRIVATE BETA
            </span>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="status-badge text-white/40">SWARM ACTIVE</span>
            </div>
          </div>
        </nav>

        {/* Main content area — flex-1 + overflow-y-auto so it scrolls on tiny screens */}
        <div
          ref={viewportRef}
          className="flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center px-3 sm:px-4 py-3 sm:py-6"
        >
          <div className="w-full max-w-4xl flex items-center justify-center">
            <div
              style={{
                transform: `scale(${contentScale})`,
                transformOrigin: "center center",
              }}
            >
              <div ref={contentRef} className="w-full max-w-4xl">
            {/* Agent swarm visualization above card */}
            <div className="mb-2 sm:mb-3 flex items-center justify-center animate-fade-up-2">
              <div className="relative">
                {/* Orbit rings */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="w-28 h-28 rounded-full border border-white/6"
                    style={{ animation: "spin-slow 20s linear infinite" }}
                  />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="w-20 h-20 rounded-full border border-white/8"
                    style={{ animation: "spin-reverse 14s linear infinite" }}
                  />
                </div>

                {/* Center logo */}
                <div
                  className="relative w-14 h-14 rounded-xl border border-white/20 bg-white/4 flex items-center justify-center m-7"
                  style={{
                    boxShadow:
                      "0 0 30px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.1)",
                  }}
                >
                  <svg viewBox="0 0 100 100" className="w-7 h-7">
                    <polygon
                      points="50,5 61,40 98,40 68,61 79,95 50,74 21,95 32,61 2,40 39,40"
                      fill="white"
                      opacity="0.9"
                    />
                  </svg>
                  {/* Pulse ring */}
                  <div
                    className="absolute inset-0 rounded-xl border border-white/30"
                    style={{ animation: "pulse-ring 2s ease-out infinite" }}
                  />
                </div>
              </div>
            </div>

            {/* Card */}
            <div
              className="relative rounded-2xl overflow-hidden animate-fade-up-3"
              style={{
                background: "rgba(10,10,10,0.8)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.03), 0 32px 64px rgba(0,0,0,0.8), 0 0 80px rgba(255,255,255,0.02)",
              }}
            >
              {/* Card top shimmer line */}
              <div className="absolute top-0 left-0 right-0 h-px overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
                  }}
                />
              </div>

              {/* Inner glow */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,255,255,0.04) 0%, transparent 100%)",
                }}
              />

              <div className="relative px-8 py-2.5 sm:px-12 sm:py-3.5">
                {/* Header */}
                <div className="text-center mb-2 sm:mb-3 animate-fade-up-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/4 mb-2 sm:mb-3">
                    <div className="w-1 h-1 rounded-full bg-white/60" />
                    <span className="status-badge text-white/50 text-[10px]">
                      AUTONOMOUS CAPITAL SWARM
                    </span>
                    <div className="w-1 h-1 rounded-full bg-white/60" />
                  </div>
                  <h1 className="text-3xl sm:text-[2.55rem] font-bold text-white mb-0.5 tracking-tight">
                    Request Early Access
                  </h1>
                </div>

                {/* Code input group */}
                <div className="mb-2 sm:mb-3 animate-fade-up-5">
                  <label className="block text-[10px] text-white/30 uppercase tracking-[0.2em] mb-3 font-mono">
                    Invite Code
                  </label>
                  <div
                    className="flex gap-4 sm:gap-5 justify-center"
                    onPaste={handlePaste}
                  >
                    {code.map((char, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          inputRefs.current[i] = el;
                        }}
                        className="code-input w-16 h-16 sm:w-24 sm:h-24 text-center text-white text-2xl sm:text-3xl font-bold rounded-lg border border-white/10 bg-white/4"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        maxLength={1}
                        value={char}
                        onChange={(e) => handleInput(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        disabled={status === "loading" || status === "success"}
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>
                  {/* Separator dot */}
                  <div className="flex justify-center mt-3 gap-1.5">
                    {code.map((char, i) => (
                      <div
                        key={i}
                        className={`w-1 h-1 rounded-full transition-all duration-300 ${char ? "bg-white/50" : "bg-white/10"}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Status messages */}
                <div className="h-5 mb-2 flex items-center justify-center animate-fade-up-5">
                  {status === "error" && (
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-red-400" />
                      <span className="text-red-400/80 text-[11px] font-mono tracking-wider">
                        INVALID CODE — ACCESS DENIED
                      </span>
                    </div>
                  )}
                  {status === "success" && (
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-emerald-400" />
                      <span className="text-emerald-400/80 text-[11px] font-mono tracking-wider">
                        ACCESS GRANTED — INITIALIZING
                      </span>
                    </div>
                  )}
                  {status === "loading" && (
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-1 h-1 rounded-full bg-white/50"
                            style={{
                              animation: `blink 1.2s ease ${i * 0.2}s infinite`,
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-white/40 text-[11px] font-mono tracking-wider">
                        VERIFYING CREDENTIALS
                      </span>
                    </div>
                  )}
                </div>

                {/* Submit button */}
                <div className="animate-fade-up-6">
                  {status === "success" ? (
                    <button
                      className="submit-btn w-full py-3 sm:py-3.5 rounded-xl text-lg sm:text-xl font-bold tracking-widest uppercase text-black"
                      style={{
                        background:
                          "linear-gradient(135deg, #e8f5e9 0%, #a5d6a7 100%)",
                      }}
                    >
                      Enter the Swarm →
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={!code.every((c) => c) || status === "loading"}
                      className="submit-btn w-full py-3 sm:py-3.5 rounded-xl text-lg sm:text-xl font-bold tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none"
                      style={{
                        background:
                          code.every((c) => c) && status !== "loading"
                            ? "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.08) 100%)"
                            : "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: code.every((c) => c)
                          ? "rgba(255,255,255,0.9)"
                          : "rgba(255,255,255,0.3)",
                      }}
                    >
                      {status === "loading"
                        ? "Authenticating..."
                        : "Unlock Access"}
                    </button>
                  )}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 my-2.5 sm:my-3 animate-fade-up-7">
                  <div className="flex-1 h-px bg-white/6" />
                  <span className="text-white/20 text-[10px] font-mono tracking-widest">
                    OR
                  </span>
                  <div className="flex-1 h-px bg-white/6" />
                </div>

                {/* Request invite */}
                <div className="text-center animate-fade-up-7">
                  <p className="text-white/25 text-xs font-mono mb-2">
                    Don't have an invite?
                  </p>
                  <a
                    href="https://getelyra.xyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/50 text-xs font-mono hover:text-white/80 transition-colors duration-200 border-b border-white/20 hover:border-white/50 pb-px"
                  >
                    Request access at getelyra.xyz →
                  </a>
                </div>
              </div>

              {/* Card bottom shimmer line */}
              <div className="absolute bottom-0 left-0 right-0 h-px">
                <div
                  className="h-full"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)",
                  }}
                />
              </div>
            </div>

            {/* Below-card info */}
            <div className="mt-3 sm:mt-4 text-center animate-fade-up-7">
              <p className="text-white/15 text-[10px] font-mono tracking-wider">
                TEE-SECURED · NON-CUSTODIAL · SOVEREIGN
              </p>
            </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <footer className="shrink-0 border-t border-white/4 px-4 sm:px-8 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-1 sm:gap-0">
          <span className="text-white/15 text-[10px] font-mono text-center sm:text-left">
            © 2025 ELYRA · WEAPONIZING TRANSPARENCY
          </span>
          <span className="text-white/10 text-[10px] font-mono">
            HYPERLIQUID · JUPITER · KAMINO
          </span>
        </footer>
      </div>
    </>
  );
}
