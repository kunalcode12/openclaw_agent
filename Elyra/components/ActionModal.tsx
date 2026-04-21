"use client";

import type { FormEvent } from "react";
import Image from "next/image";
import { ChevronDown, X } from "lucide-react";

type ActionType = "deposit" | "withdraw" | "transfer";

type ActionModalProps = {
  open: boolean;
  isAuthenticated: boolean;
  activeAction: ActionType;
  onSetActiveAction: (action: ActionType) => void;
  onClose: () => void;
  solAddress?: string;
  onCreateSolWallet: () => void | Promise<void>;
  onActionSubmit: (event: FormEvent) => void | Promise<void>;
  amount: string;
  onAmountChange: (value: string) => void;
  tokenSymbol: string;
  onTokenSymbolChange: (value: string) => void;
  targetAddress: string;
  onTargetAddressChange: (value: string) => void;
  isSubmittingTx: boolean;
  userName?: string;
  statusMessage: string;
  onAddressCopied: () => void;
};

export default function ActionModal({
  open,
  isAuthenticated,
  activeAction,
  onSetActiveAction,
  onClose,
  solAddress,
  onCreateSolWallet,
  onActionSubmit,
  amount,
  onAmountChange,
  tokenSymbol,
  onTokenSymbolChange,
  targetAddress,
  onTargetAddressChange,
  isSubmittingTx,
  userName,
  statusMessage,
  onAddressCopied,
}: ActionModalProps) {
  void userName;

  if (!open || !isAuthenticated) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-black/75 p-3 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-[24rem] overflow-y-auto rounded-2xl border border-white/10 bg-linear-to-b from-[#08080d] to-black p-4 shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-white/60 hover:text-white"
        >
          <X size={18} />
        </button>

        <div className="mb-3 pr-8">
          <div className="flex rounded-lg border border-white/10 bg-black/60 p-1 text-sm">
            {(["deposit", "withdraw", "transfer"] as const).map((action) => (
              <button
                key={action}
                onClick={() => onSetActiveAction(action)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold capitalize transition ${
                  activeAction === action
                    ? "border border-transparent bg-linear-to-r from-blue-600 via-blue-500 to-cyan-500 text-white shadow-md shadow-blue-500/35"
                    : "border border-white/10 bg-black/40 text-white/70 hover:text-white"
                }`}
              >
                {action}
              </button>
            ))}
          </div>
        </div>

        {!solAddress ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                void onCreateSolWallet();
              }}
              className="w-full rounded-lg border border-emerald-400/60 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/10"
            >
              Create Solana Wallet Account
            </button>
            {statusMessage ? (
              <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-[11px] leading-relaxed text-white/70">
                {statusMessage}
              </p>
            ) : null}
          </div>
        ) : activeAction === "deposit" ? (
          <div className="space-y-3">
            <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-1 text-xs text-white/85">
              <Image
                src="/solana.png"
                alt="Solana"
                width={14}
                height={14}
                className="rounded-full"
              />
              <span>Solana</span>
              <ChevronDown size={14} className="text-white/50" />
            </button>

            <div className="mx-auto w-fit rounded-xl border border-white/10 bg-white p-2">
              <Image
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(solAddress)}`}
                alt="Deposit QR"
                width={165}
                height={165}
                unoptimized
              />
            </div>

            <p className="text-center text-xs text-[#9fa3ff]">
              Send only Solana assets to this address
            </p>

            <div>
              <p className="mb-1.5 text-lg font-bold leading-none text-white">
                Solana Address
              </p>
              <p className="rounded-lg border border-white/15 bg-white/5 p-2.5 text-xs text-white/80 break-all">
                {solAddress}
              </p>
            </div>

            <button
              onClick={async () => {
                await navigator.clipboard.writeText(solAddress);
                onAddressCopied();
              }}
              className="w-full rounded-lg border border-blue-500/60 bg-linear-to-r from-blue-600 via-blue-500 to-cyan-500 px-3 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/30"
            >
              Copy Address
            </button>
          </div>
        ) : activeAction === "transfer" ? (
          <div className="relative">
            <div className="space-y-3 blur-[2px] select-none pointer-events-none">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-1 text-xs text-white/85"
              >
                <Image
                  src="/solana.png"
                  alt="Solana"
                  width={14}
                  height={14}
                  className="rounded-full"
                />
                <span>Solana</span>
                <ChevronDown size={14} className="text-white/50" />
              </button>

              <div className="rounded-xl border border-white/15 bg-white/5 p-2.5">
                <p className="mb-1.5 text-xs text-white/70">From</p>
                <div className="h-9 rounded-lg border border-white/10 bg-black/40" />
              </div>

              <div className="rounded-xl border border-white/15 bg-white/5 p-2.5">
                <p className="mb-1.5 text-xs text-white/70">To</p>
                <div className="h-9 rounded-lg border border-white/10 bg-black/40" />
              </div>

              <button
                type="button"
                className="w-full rounded-lg border border-blue-500/60 bg-linear-to-r from-blue-600 via-blue-500 to-cyan-500 px-3 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/30"
              >
                Transfer
              </button>
            </div>

            <div className="absolute inset-0 grid place-items-center">
              <div className="rounded-xl border border-white/15 bg-black/80 px-4 py-2 text-center backdrop-blur-md">
                <p className="text-sm font-semibold text-white">Coming Soon</p>
                <p className="text-xs text-white/65">
                  Cross-wallet transfer UI is under development
                </p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={onActionSubmit} className="space-y-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-1 text-xs text-white/85"
            >
              <Image
                src="/solana.png"
                alt="Solana"
                width={14}
                height={14}
                className="rounded-full"
              />
              <span>Solana</span>
              <ChevronDown size={14} className="text-white/50" />
            </button>

            <div className="mx-auto w-fit">
              <Image
                src="/logo.png"
                alt="Mascot"
                width={72}
                height={72}
                className="rounded-full opacity-90"
              />
            </div>

            <div className="rounded-xl border border-white/15 bg-white/5 p-2.5">
              <p className="mb-1.5 text-xs text-white/70">Send</p>
              <div className="flex items-center justify-between gap-3">
                <input
                  value={amount}
                  onChange={(event) => onAmountChange(event.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent text-xl font-semibold text-white placeholder:text-white/35 outline-none"
                />
                <select
                  value={tokenSymbol}
                  onChange={(event) => onTokenSymbolChange(event.target.value)}
                  className="rounded-md border border-white/15 bg-black/50 px-2 py-1 text-xs text-white outline-none"
                >
                  <option value="SOL">SOL</option>
                  <option value="USDC">USDC</option>
                  <option value="BONK">BONK</option>
                </select>
              </div>
              <p className="mt-1 text-[11px] text-white/45">$0</p>
            </div>

            <input
              value={targetAddress}
              onChange={(event) => onTargetAddressChange(event.target.value)}
              placeholder="Recipient address"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/40"
            />

            <div className="flex items-center justify-between text-xs text-white/55">
              <span>Est. fee:</span>
              <span>—</span>
            </div>

            <button
              type="submit"
              disabled={isSubmittingTx}
              className="w-full rounded-lg border border-blue-500/60 bg-linear-to-r from-blue-600 via-blue-500 to-cyan-500 px-3 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/30 disabled:opacity-60"
            >
              {isSubmittingTx
                ? "Submitting..."
                : activeAction === "withdraw"
                  ? "Withdraw"
                  : "Transfer"}
            </button>
          </form>
        )}

        {solAddress && statusMessage ? (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-[11px] leading-relaxed text-white/70">
            {statusMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
