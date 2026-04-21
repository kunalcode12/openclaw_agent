"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import Image from "next/image";

type TokenBalance = {
  symbol: string;
  amount: number;
};

type WalletMenuProps = {
  balances: TokenBalance[];
  hideBalances: boolean;
  onToggleHideBalances: () => void;
  onRefreshBalances: () => void;
  isFetchingBalances: boolean;
  activeRpcUrl: string;
};

// Dummy token data with icons and details
const tokenDetails: Record<
  string,
  { icon: string; iconSrc?: string; fullAmount: string; value: number }
> = {
  USDC: {
    icon: "🪙",
    iconSrc: "/usdc.png",
    fullAmount: "0.084697 USDC",
    value: 0.08,
  },
  SOL: {
    icon: "◎",
    iconSrc: "/solana.png",
    fullAmount: "0 SOL",
    value: 0,
  },
};

export default function WalletMenu({
  balances,
  hideBalances,
  onRefreshBalances,
  isFetchingBalances,
}: WalletMenuProps) {
  const [activeTab, setActiveTab] = useState<"token" | "defi">("token");

  // Calculate total value from balances
  const totalValue = balances.reduce((sum, token) => {
    const details = tokenDetails[token.symbol];
    return sum + (details?.value || 0);
  }, 0);

  const containerVariants: Variants = {
    hidden: { opacity: 0, y: -20, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.4, ease: "easeOut" as const, staggerChildren: 0.08 },
    },
  };

  const childVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, x: -15 },
    visible: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: { delay: i * 0.06, duration: 0.4, ease: "easeOut" as const },
    }),
  };

  const buttonVariants = {
    hover: {
      scale: 1.05,
      transition: { duration: 0.2 },
    },
    tap: {
      scale: 0.96,
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="absolute right-0 mt-2 w-88 rounded-2xl border border-white/12 bg-linear-to-br from-black via-black to-slate-950 p-5 shadow-2xl backdrop-blur-2xl"
      style={{
        boxShadow:
          "0 20px 60px -12px rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
      }}
    >
      {/* Header with title and refresh */}
      <motion.div
        variants={childVariants}
        className="mb-3.5 flex items-center justify-between"
      >
        <h3 className="text-xs font-bold text-white/70 tracking-widest uppercase letter-spacing-2">
          Total value of Spot
        </h3>
        <motion.button
          onClick={onRefreshBalances}
          disabled={isFetchingBalances}
          whileHover={{ scale: 1.15, rotate: 180 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="rounded-lg p-1.5 text-white/50 transition-all duration-300 hover:bg-white/10 hover:text-white/90"
          title="Refresh balances"
        >
          <RefreshCw
            size={16}
            className={isFetchingBalances ? "animate-spin" : ""}
          />
        </motion.button>
      </motion.div>

      {/* Total Value Display */}
      <motion.div
        variants={childVariants}
        className="mb-3.5"
      >
        <motion.div
          className="mb-3.5 font-mono text-3xl font-bold tracking-tight text-white"
          key={totalValue}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, type: "spring", stiffness: 100 }}
        >
          ${hideBalances ? "••••" : totalValue.toFixed(2)}
        </motion.div>

        {/* Action Buttons */}
        <div className="flex gap-2.5">
          <motion.button
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
            className="group relative flex-1 overflow-hidden rounded-lg border-2 border-transparent bg-linear-to-r from-blue-600 via-blue-500 to-cyan-500 py-2 text-xs font-bold text-white shadow-lg shadow-blue-500/30 transition-all duration-300 hover:shadow-blue-500/60"
          >
            <div className="absolute inset-0 bg-linear-to-r from-blue-400 via-blue-300 to-cyan-400 opacity-0 transition-opacity duration-300 group-hover:opacity-20" />
            <span className="relative z-10">Deposit</span>
          </motion.button>
          <motion.button
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
            className="group relative flex-1 overflow-hidden rounded-lg border-2 border-purple-500/50 bg-linear-to-r from-purple-900/30 to-pink-900/30 py-2 text-xs font-bold text-white backdrop-blur-sm transition-all duration-300 hover:border-purple-400/80 hover:shadow-lg hover:shadow-purple-500/20"
          >
            <div className="absolute inset-0 bg-linear-to-r from-purple-500/0 via-purple-400/10 to-pink-500/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <span className="relative z-10">Withdraw</span>
          </motion.button>
        </div>

        {/* Divider */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mt-3.5 h-px origin-left bg-linear-to-r from-transparent via-white/20 to-transparent"
        />
      </motion.div>

      {/* Tab Navigation */}
      <motion.div
        variants={childVariants}
        className="relative mb-3.5 flex gap-3"
      >
        <button
          onClick={() => setActiveTab("token")}
          className={`relative flex-1 pb-2.5 text-xs font-bold tracking-wide transition-all duration-300 ${
            activeTab === "token"
              ? "text-white"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          <span className="relative">
            Token
            {activeTab === "token" && (
              <motion.div
                className="absolute inset-0 -z-10 rounded bg-linear-to-r from-blue-500/20 to-cyan-500/20 blur-md"
                layoutId="tabGlow"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </span>
          {activeTab === "token" && (
            <motion.div
              className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-linear-to-r from-blue-500 to-cyan-500"
              layoutId="activeTab"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab("defi")}
          className={`relative flex-1 pb-2.5 text-xs font-bold tracking-wide transition-all duration-300 ${
            activeTab === "defi"
              ? "text-white"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          <span className="relative">
            DeFi
            {activeTab === "defi" && (
              <motion.div
                className="absolute inset-0 -z-10 rounded bg-linear-to-r from-purple-500/20 to-pink-500/20 blur-md"
                layoutId="tabGlow"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </span>
          {activeTab === "defi" && (
            <motion.div
              className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-linear-to-r from-purple-500 to-pink-500"
              layoutId="activeTab"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
        </button>
      </motion.div>

      {/* Token List */}
      <AnimatePresence mode="wait">
        {activeTab === "token" && (
          <motion.div
            key="token-list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-1.5"
          >
            {balances.filter((token) => token.symbol !== "BONK").map((token, i) => {
              const details = tokenDetails[token.symbol] || {
                icon: "○",
                iconSrc: undefined,
                fullAmount: `${token.amount} ${token.symbol}`,
                value: 0,
              };

              return (
                <motion.div
                  key={token.symbol}
                  custom={i}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ scale: 1.02, x: 4 }}
                  className="group flex cursor-pointer items-center justify-between rounded-lg border border-white/8 bg-linear-to-r from-white/5 to-white/2 px-2.5 py-2.5 transition-all duration-300 hover:from-white/10 hover:to-white/5"
                >
                  <div className="flex items-center gap-2.5">
                    {/* Token Icon */}
                    <motion.div
                      whileHover={{ scale: 1.15, rotate: 8 }}
                      whileTap={{ scale: 0.95 }}
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white transition-all duration-300 ${
                        details.iconSrc
                          ? ""
                          : "border border-blue-400/30 bg-linear-to-br from-blue-500/40 to-cyan-500/20 shadow-lg shadow-blue-500/10 backdrop-blur-sm group-hover:border-blue-400/60 group-hover:from-blue-500/60 group-hover:to-cyan-500/30 group-hover:shadow-blue-500/20"
                      }`}
                    >
                      {details.iconSrc ? (
                        <Image
                          src={details.iconSrc}
                          alt={`${token.symbol} icon`}
                          width={24}
                          height={24}
                          className="rounded-full object-contain"
                        />
                      ) : (
                        details.icon
                      )}
                    </motion.div>

                    {/* Token Info */}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white transition-colors group-hover:text-blue-300">
                        {token.symbol}
                      </p>
                      <p className="text-xs text-white/50 group-hover:text-white/70 transition-colors">
                        {hideBalances
                          ? "••••••••• " + token.symbol
                          : details.fullAmount}
                      </p>
                    </div>
                  </div>

                  {/* Value */}
                  <motion.div
                    className="shrink-0 text-right"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.06 }}
                  >
                    <p className="text-sm font-bold text-white transition-colors group-hover:text-cyan-300">
                      ${hideBalances ? "••••" : details.value.toFixed(2)}
                    </p>
                  </motion.div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* DeFi Tab Content */}
        {activeTab === "defi" && (
          <motion.div
            key="defi-content"
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="py-6 text-center"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="mb-4"
            >
              <div className="text-5xl">🚀</div>
            </motion.div>
            <p className="text-sm font-semibold text-white/50">No DeFi positions yet</p>
            <p className="text-white/30 text-xs mt-1">Start exploring DeFi opportunities</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
