"use client";

import Image from "next/image";
import { Eye, EyeOff, Wallet, LogOut, Copy, Check, Zap } from "lucide-react";
import WalletMenu from "@/components/WalletMenu";
import { useState } from "react";

type TokenBalance = {
  symbol: string;
  amount: number;
};

type NavbarProps = {
  solPrice: number;
  isAuthenticated: boolean;
  onLogin: () => void;
  walletMenuOpen: boolean;
  onWalletMenuOpenChange: (open: boolean) => void;
  hideBalances: boolean;
  balances: TokenBalance[];
  onToggleHideBalances: () => void;
  onRefreshBalances: () => void;
  isFetchingBalances: boolean;
  activeRpcUrl: string;
  onOpenDeposit: () => void;
  profileMenuOpen: boolean;
  onProfileMenuOpenChange: (open: boolean) => void;
  userName?: string;
  solAddress?: string;
  onLogout: () => void;
};

export default function Navbar({
  solPrice,
  isAuthenticated,
  onLogin,
  walletMenuOpen,
  onWalletMenuOpenChange,
  hideBalances,
  balances,
  onToggleHideBalances,
  onRefreshBalances,
  isFetchingBalances,
  activeRpcUrl,
  onOpenDeposit,
  profileMenuOpen,
  onProfileMenuOpenChange,
  userName,
  solAddress,
  onLogout,
}: NavbarProps) {
  const [copied, setCopied] = useState(false);
  const shortSolAddress =
    solAddress && solAddress.length > 10
      ? `${solAddress.slice(0, 4)}...${solAddress.slice(-4)}`
      : solAddress;

  const handleCopyAddress = async () => {
    if (solAddress) {
      await navigator.clipboard.writeText(solAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <nav
      className="sticky top-0 z-50 border-b border-white/5 bg-linear-to-b from-black via-black to-black/80 px-6 py-2 shadow-2xl backdrop-blur-xl"
      title={`SOL $${solPrice.toFixed(2)}`}
    >
      <style>{`
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.3); }
          50% { box-shadow: 0 0 30px rgba(59, 130, 246, 0.5); }
        }
        @keyframes slide-in-left {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slide-in-down {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float-up {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        .glow-pulse { animation: glow-pulse 2s ease-in-out infinite; }
        .slide-in { animation: slide-in-left 0.5s ease-out; }
        .dropdown-slide { animation: slide-in-down 0.3s ease-out; }
        .float-in { animation: float-up 0.4s ease-out; }
        .shimmer-effect { 
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
      `}</style>

      <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between">
        {/* Logo Section */}
        <div className="flex items-center gap-4 slide-in">
          <div className="group relative h-9 w-9 cursor-pointer overflow-hidden rounded-xl bg-linear-to-br from-blue-500 via-blue-600 to-purple-700 shadow-xl transition-transform duration-300 hover:scale-110 glow-pulse">
            <Image
              src="/logo.png"
              alt="Elyra logo"
              width={36}
              height={36}
              priority
              className="rounded-xl"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/30 to-transparent" />
          </div>

          <div className="flex items-center gap-4">
            <span className="text-base font-bold tracking-tight text-white text-shadow-sm drop-shadow-md">
              Elyra
            </span>
            <div className="h-5 w-px bg-linear-to-b from-blue-500/50 to-transparent" />

            <div className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/3 border border-white/8 hover:border-blue-500/30 transition-all duration-300 cursor-default">
              <span className="text-xs font-medium text-white/60 group-hover:text-white/80 transition-colors">
                SOL
              </span>
              <span className="text-sm font-bold text-white tracking-tight">
                ${solPrice.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          {/* Free Credits Badge - Hidden on mobile */}

          {!isAuthenticated ? (
            <button
              onClick={onLogin}
              className="group relative inline-flex items-center gap-2.5 rounded-lg border border-green-500/20 bg-linear-to-r from-green-500/10 to-emerald-500/10 px-4 py-2 text-xs font-semibold text-white transition-all duration-300 hover:border-green-500/40 hover:from-green-500/20 hover:to-emerald-500/20 hover:shadow-lg hover:shadow-green-500/10 hover:scale-105 active:scale-95 float-in"
            >
              <div className="relative flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-400 group-hover:bg-green-300 group-hover:shadow-lg group-hover:shadow-green-500/50 transition-all duration-300 animate-pulse" />
                <span>Login with Privy</span>
              </div>
            </button>
          ) : (
            <>
              {/* Wallet Section */}
              <div
                className="relative float-in"
                onMouseEnter={() => {
                  onWalletMenuOpenChange(true);
                }}
                onMouseLeave={() => {
                  onWalletMenuOpenChange(false);
                }}
              >
                <button
                  onClick={() => onWalletMenuOpenChange(!walletMenuOpen)}
                  className="group inline-flex items-center gap-2 rounded-lg border border-white/10 bg-linear-to-br from-white/8 to-white/3 px-3.5 py-2 text-xs font-semibold text-white transition-all duration-300 hover:border-blue-500/30 hover:from-blue-500/15 hover:to-white/8 hover:shadow-lg hover:shadow-blue-500/10 hover:scale-105 active:scale-95 backdrop-blur-xl"
                >
                  <Wallet
                    size={15}
                    className="text-white/60 group-hover:text-blue-400 transition-colors duration-300"
                  />
                  <span className="font-mono font-bold tracking-tight">
                    {hideBalances
                      ? "••••"
                      : `$${balances[0].amount.toFixed(2)}`}
                  </span>
                  <button
                    type="button"
                    aria-label={hideBalances ? "Show balance" : "Hide balance"}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleHideBalances();
                    }}
                    className="ml-1 text-white/40 transition-all duration-300 hover:text-white/80 hover:scale-110 active:scale-95"
                  >
                    {hideBalances ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </button>

                {walletMenuOpen ? (
                  <div className="dropdown-slide">
                    <WalletMenu
                      balances={balances}
                      hideBalances={hideBalances}
                      onToggleHideBalances={onToggleHideBalances}
                      onRefreshBalances={onRefreshBalances}
                      isFetchingBalances={isFetchingBalances}
                      activeRpcUrl={activeRpcUrl}
                    />
                  </div>
                ) : null}
              </div>

              {/* Deposit Button */}
              <button
                onClick={onOpenDeposit}
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg border border-blue-500/30 bg-linear-to-r from-blue-500/20 to-purple-500/15 px-4 py-2 text-xs font-semibold text-white transition-all duration-300 hover:border-blue-500/50 hover:from-blue-500/30 hover:to-purple-500/25 hover:shadow-lg hover:shadow-blue-500/20 hover:scale-105 active:scale-95 float-in"
              >
                <div className="absolute inset-0 shimmer-effect opacity-0 group-hover:opacity-100" />
                <Zap
                  size={14}
                  className="relative text-blue-400 group-hover:text-blue-300 transition-colors"
                />
                <span className="relative">Deposit</span>
              </button>

              {shortSolAddress ? (
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="group inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-mono text-white/80 transition-all duration-300 hover:border-blue-500/30 hover:bg-white/10 hover:text-white"
                  title={solAddress}
                >
                  <span>{shortSolAddress}</span>
                  {copied ? (
                    <Check size={13} className="text-green-400" />
                  ) : (
                    <Copy
                      size={13}
                      className="text-white/40 group-hover:text-white/70"
                    />
                  )}
                </button>
              ) : null}

              {/* Profile Menu */}
              <div className="relative float-in">
                <button
                  onClick={() => onProfileMenuOpenChange(!profileMenuOpen)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-linear-to-br from-white/10 to-white/5 text-xs font-bold text-white transition-all duration-300 hover:border-purple-500/40 hover:from-purple-500/20 hover:to-white/10 hover:shadow-lg hover:shadow-purple-500/10 hover:scale-110 active:scale-95 backdrop-blur-xl"
                >
                  {userName?.[0]?.toUpperCase() ?? "P"}
                </button>
                {profileMenuOpen ? (
                  <div className="dropdown-slide absolute right-0 top-full mt-3 w-80 rounded-xl border border-white/10 bg-linear-to-b from-black/90 to-black/70 bg-black p-6 shadow-2xl shadow-black/50 backdrop-blur-2xl">
                    {/* Header */}
                    <div className="border-b border-white/10 pb-4 float-in">
                      <p className="text-xs font-medium text-white/50 uppercase tracking-widest">
                        Account
                      </p>
                      <p className="mt-3 text-sm font-bold text-white tracking-tight">
                        {userName ?? "Privy User"}
                      </p>
                    </div>

                    {/* Address Section */}
                    <div
                      className="mt-5 float-in"
                      style={{ animationDelay: "0.1s" }}
                    >
                      <p className="text-xs font-medium text-white/50 uppercase tracking-widest">
                        Solana Address
                      </p>
                      <button
                        onClick={handleCopyAddress}
                        className="mt-3 w-full group/copy flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs font-mono text-white/80 transition-all duration-300 hover:border-blue-500/30 hover:bg-white/10 hover:shadow-lg hover:shadow-blue-500/10 active:scale-95"
                      >
                        <span className="truncate">
                          {solAddress ?? "No Solana wallet account"}
                        </span>
                        <div className="shrink-0 transition-all duration-300">
                          {copied ? (
                            <Check
                              size={15}
                              className="text-green-400 animate-bounce"
                            />
                          ) : (
                            <Copy
                              size={15}
                              className="text-white/40 group-hover/copy:text-white/70 group-hover/copy:scale-110 transition-all duration-300"
                            />
                          )}
                        </div>
                      </button>
                    </div>

                    {/* Logout Button */}
                    <button
                      onClick={onLogout}
                      className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-lg border border-red-500/30 bg-linear-to-r from-red-500/15 to-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-400 transition-all duration-300 hover:border-red-500/50 hover:from-red-500/25 hover:to-red-500/15 hover:shadow-lg hover:shadow-red-500/15 hover:text-red-300 hover:scale-105 active:scale-95 float-in"
                      style={{ animationDelay: "0.2s" }}
                    >
                      <LogOut size={15} />
                      <span>Logout</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
