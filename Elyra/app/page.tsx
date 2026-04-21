"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthState, ClientState, useTurnkey } from "@turnkey/react-wallet-kit";
import TradingTerminal, { type TokenInfo } from "../components/TradingTerminal";
import { tradingDummyToken } from "@/lib/tradeDummyData";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Buffer } from "buffer";
import TradingAssistant, {
  type SwapHistoryItem,
} from "@/components/TradingAssistant";

type TokenBalance = {
  symbol: string;
  amount: number;
};

const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const RPC_FALLBACK_URLS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://rpc.ankr.com/solana",
];
const BLOCKED_TURNKEY_ADDRESSES = new Set([
  "JCsFjtj6tem9Dv83Ks4HxsL7p8GhdLtokveqW7uWjGyi",
]);

const TOKEN_METADATA = {
  USDC: {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
  },
  BONK: {
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6mKfG3Q8xUnxA3AF",
    decimals: 5,
  },
} as const;

export default function Home() {
  const {
    handleLogin,
    logout,
    authState,
    clientState,
    user,
    wallets,
    createWallet,
    handleSendTransaction,
  } = useTurnkey();

  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<"deposit" | "withdraw" | "transfer">("deposit");
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? DEFAULT_RPC_URL;
  const [amount, setAmount] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("SOL");
  const [targetAddress, setTargetAddress] = useState("");
  const [balances, setBalances] = useState<TokenBalance[]>([
    { symbol: "SOL", amount: 0 },
    { symbol: "USDC", amount: 0 },
    { symbol: "BONK", amount: 0 },
  ]);
  const [isFetchingBalances, setIsFetchingBalances] = useState(false);
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);
  const [isSolSendDisabled, setIsSolSendDisabled] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [hideBalances, setHideBalances] = useState(false);
  const [activeRpcUrl, setActiveRpcUrl] = useState(rpcUrl);
  const [blockedRpcUrls, setBlockedRpcUrls] = useState<string[]>([]);
  const [lastBalanceFetchAt, setLastBalanceFetchAt] = useState<number>(0);
  const [nextBalanceRetryAt, setNextBalanceRetryAt] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(0);
  const [solPrice, setSolPrice] = useState<number>(tradingDummyToken.price);
  const [solPriceChange, setSolPriceChange] = useState<number>(tradingDummyToken.priceChange);
  const [swapHistory, setSwapHistory] = useState<SwapHistoryItem[]>([]);
  const [selectedSolAddress, setSelectedSolAddress] = useState<string | undefined>(undefined);

  const isReady = clientState === ClientState.Ready;
  const isAuthenticated = authState === AuthState.Authenticated;

  const solAddresses = useMemo(() => {
    const walletList = (wallets ?? []) as Array<{
      accounts?: Array<{ address?: string; addressFormat?: string }>;
    }>;
    const discoveredAddresses: string[] = [];

    for (const wallet of walletList) {
      for (const account of wallet.accounts ?? []) {
        if (
          account.addressFormat?.includes("SOLANA") &&
          account.address &&
          !BLOCKED_TURNKEY_ADDRESSES.has(account.address) &&
          !discoveredAddresses.includes(account.address)
        ) {
          discoveredAddresses.push(account.address);
        }
      }
    }

    return discoveredAddresses;
  }, [wallets]);

  const solAddress = useMemo(() => {
    if (solAddresses.length === 0) {
      return undefined;
    }
    if (selectedSolAddress && solAddresses.includes(selectedSolAddress)) {
      return selectedSolAddress;
    }
    return solAddresses[0];
  }, [selectedSolAddress, solAddresses]);
  const activeAddress = solAddress;

  const liveTokenInfo = useMemo<TokenInfo>(
    () => ({
      ...tradingDummyToken,
      price: solPrice,
      priceChange: solPriceChange,
    }),
    [solPrice, solPriceChange],
  );

  const refreshBalances = useCallback(async () => {
    if (!activeAddress) {
      return;
    }
    if (Date.now() < nextBalanceRetryAt) {
      return;
    }

    setIsFetchingBalances(true);
    setStatusMessage("");

    try {
      const owner = new PublicKey(activeAddress);
      const rpcCandidates = Array.from(
        new Set(
          [rpcUrl, ...RPC_FALLBACK_URLS].filter(
            (url) => url.trim().length > 0 && !blockedRpcUrls.includes(url),
          ),
        ),
      );
      if (rpcCandidates.length === 0) {
        // Recover from over-blocking by restoring public fallbacks for the next attempt.
        setBlockedRpcUrls(rpcUrl ? [rpcUrl] : []);
        throw new Error("No available RPC endpoints after filtering.");
      }
      let lastError: unknown;
      let sawForbiddenError = false;
      let sawRateLimitError = false;

      for (const candidate of rpcCandidates) {
        try {
          const connection = new Connection(candidate, "confirmed");
          const lamports = await connection.getBalance(owner);
          let usdcAmount = 0;
          let bonkAmount = 0;
          try {
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
              programId: TOKEN_PROGRAM_ID,
            });
            for (const tokenAccount of tokenAccounts.value) {
              const parsedData = tokenAccount.account.data.parsed;
              const mint = parsedData.info.mint as string;
              const uiAmount = Number(parsedData.info.tokenAmount.uiAmount ?? 0);
              if (mint === TOKEN_METADATA.USDC.mint) {
                usdcAmount += uiAmount;
              }
              if (mint === TOKEN_METADATA.BONK.mint) {
                bonkAmount += uiAmount;
              }
            }
          } catch (tokenError) {
            // Do not drop SOL balance if token account parsing endpoint is throttled.
            const tokenErrorText = String(tokenError);
            if (tokenErrorText.includes("429")) {
              setStatusMessage(
                "Token account lookup is rate-limited; showing SOL balance and retrying token balances later.",
              );
            }
          }

          setBalances([
            { symbol: "SOL", amount: lamports / LAMPORTS_PER_SOL },
            { symbol: "USDC", amount: usdcAmount },
            { symbol: "BONK", amount: bonkAmount },
          ]);
          setActiveRpcUrl(candidate);
          setLastBalanceFetchAt(Date.now());
          return;
        } catch (error) {
          const errorText = String(error);
          if (errorText.includes("403")) {
            sawForbiddenError = true;
            if (candidate === rpcUrl) {
              setBlockedRpcUrls((previous) =>
                previous.includes(candidate) ? previous : [...previous, candidate],
              );
              setStatusMessage(
                "Configured RPC key is forbidden (403). Automatically switched to public RPC fallback.",
              );
            }
          }
          if (errorText.includes("429")) {
            sawRateLimitError = true;
            if (candidate === rpcUrl) {
              setBlockedRpcUrls((previous) =>
                previous.includes(candidate) ? previous : [...previous, candidate],
              );
            }
          }
          lastError = error;
        }
      }

      if (sawForbiddenError || sawRateLimitError) {
        setStatusMessage(
          sawForbiddenError
            ? "Configured RPC key is forbidden (403). Using public fallback RPC endpoints."
            : "Configured RPC is rate-limited (429). Using public fallback RPC endpoints.",
        );
      }

      throw lastError;
    } catch (error) {
      const errorText = String(error);
      setNextBalanceRetryAt(Date.now() + 15_000);
      if (errorText.includes("403")) {
        setStatusMessage(
          "RPC key is blocked/invalid (403). Remove NEXT_PUBLIC_SOLANA_RPC_URL or replace it with a blockchain-enabled key.",
        );
      } else if (errorText.includes("429")) {
        setStatusMessage(
          "Balance fetch is rate-limited (429). Try refresh shortly or switch RPC endpoint.",
        );
      } else {
        setStatusMessage("Failed to fetch balances. Please retry.");
      }
    } finally {
      setIsFetchingBalances(false);
    }
  }, [activeAddress, blockedRpcUrls, nextBalanceRetryAt, rpcUrl]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!walletMenuOpen || !activeAddress) {
      return;
    }
    if (Date.now() - lastBalanceFetchAt < 30_000) {
      return;
    }
    queueMicrotask(() => {
      void refreshBalances();
    });
  }, [walletMenuOpen, activeAddress, lastBalanceFetchAt, refreshBalances]);

  useEffect(() => {
    if (!activeAddress) {
      return;
    }
    // Refresh immediately when active wallet changes.
    queueMicrotask(() => {
      void refreshBalances();
    });
  }, [activeAddress, refreshBalances]);


  useEffect(() => {
    let cancelled = false;

    const fetchSolPrice = async () => {
      try {
        const response = await fetch("/api/pyth/sol-price");
        if (!response.ok) {
          throw new Error(`Price feed failed with ${response.status}`);
        }

        const payload = (await response.json()) as {
          price?: number;
          timestampUs?: string;
        };
        const nextPrice = payload.price;

        if (!cancelled && typeof nextPrice === "number" && Number.isFinite(nextPrice)) {
          setSolPrice((previousPrice) => {
            const base = previousPrice <= 0 ? nextPrice : previousPrice;
            const nextChangePct = ((nextPrice - base) / base) * 100;
            setSolPriceChange(nextChangePct);
            return nextPrice;
          });
        }
      } catch (error) {
        console.error("Failed to fetch SOL price feed:", error);
      }
    };

    void fetchSolPrice();
    const intervalId = window.setInterval(() => {
      void fetchSolPrice();
    }, 2_500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const handleCreateSolWallet = async () => {
    if (!isAuthenticated) {
      return;
    }

    await createWallet({
      walletName: "Elyra Solana Wallet",
      accounts: ["ADDRESS_FORMAT_SOLANA"],
    });
  };

  const handleActionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!activeAddress) {
      setStatusMessage("No active Solana wallet address found.");
      return;
    }

    if (!targetAddress) {
      setStatusMessage("Destination address is required.");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setStatusMessage("Enter a valid positive amount.");
      return;
    }

    setIsSubmittingTx(true);
    setStatusMessage("");

    if (isSolSendDisabled) {
      setIsSubmittingTx(false);
      setStatusMessage(
        "Turnkey Solana send is not enabled for this organization. Enable 'sol send transaction' in Turnkey settings.",
      );
      return;
    }

    try {
      const owner = new PublicKey(activeAddress);
      const destination = new PublicKey(targetAddress);
      const connection = new Connection(activeRpcUrl, "confirmed");
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const instructions = [];

      if (tokenSymbol === "SOL") {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: owner,
            toPubkey: destination,
            lamports: Math.round(parsedAmount * LAMPORTS_PER_SOL),
          }),
        );
      } else {
        const tokenMeta = TOKEN_METADATA[tokenSymbol as keyof typeof TOKEN_METADATA];
        if (!tokenMeta) {
          throw new Error("Unsupported token selected");
        }

        const mint = new PublicKey(tokenMeta.mint);
        const sourceAta = getAssociatedTokenAddressSync(mint, owner);
        const destinationAta = getAssociatedTokenAddressSync(mint, destination);

        const destinationAtaInfo = await connection.getAccountInfo(destinationAta);
        if (!destinationAtaInfo) {
          instructions.push(
            createAssociatedTokenAccountInstruction(owner, destinationAta, destination, mint),
          );
        }

        const amountInBaseUnits = BigInt(
          Math.round(parsedAmount * 10 ** tokenMeta.decimals),
        );
        instructions.push(
          createTransferInstruction(
            sourceAta,
            destinationAta,
            owner,
            amountInBaseUnits,
            [],
            TOKEN_PROGRAM_ID,
          ),
        );
      }

      const txMessage = new TransactionMessage({
        payerKey: owner,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const versionedTx = new VersionedTransaction(txMessage);
      const serializedTx = Buffer.from(versionedTx.serialize()).toString("base64");

      await handleSendTransaction({
        transaction: {
          unsignedTransaction: serializedTx,
          signWith: activeAddress,
          caip2: SOLANA_MAINNET_CAIP2,
          recentBlockhash: blockhash,
        },
      });
      setStatusMessage(`${activeAction} transaction submitted on Solana mainnet.`);

      setAmount("");
      setTargetAddress("");
      await refreshBalances();
    } catch (error) {
      console.error("Transaction failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        errorMessage.toLowerCase().includes("sol send transaction feature is not enabled") ||
        errorMessage.toLowerCase().includes("turnkey error 7")
      ) {
        setIsSolSendDisabled(true);
        setStatusMessage(
          "Turnkey Solana send is disabled for this organization. Please enable it in Turnkey before withdraw/transfer.",
        );
        return;
      }
      setStatusMessage(
        `Transaction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsSubmittingTx(false);
    }
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-[#05070f] text-white grid place-items-center">
        <p className="text-sm text-white/80">Initializing Turnkey client...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-white">
      <nav className="border-b border-white/10 bg-[#0b1020] px-4 py-4">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Elyra logo" width={40} height={40} priority />
            <span className="text-xl font-semibold tracking-wide">Elyra</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 lg:flex">
              <span className="rounded-md border border-white/15 bg-[#0f1728] px-2 py-1 text-[10px] text-white/80">
                Free Credits 7
              </span>
              <button className="rounded-md border border-white/20 bg-[#121a2d] px-2 py-1 text-[10px]">
                Unlock
              </button>
              <span className="rounded-md border border-white/20 bg-[#121a2d] px-2 py-1 text-[10px]">
                ${solPrice.toFixed(2)}
              </span>
              <button className="rounded-md border border-white/20 bg-[#121a2d] px-2 py-1 text-[10px]">
                Deposit
              </button>
            </div>
            {!isAuthenticated ? (
              <button
                onClick={() => {
                  void handleLogin();
                }}
                className="rounded-lg border border-indigo-400/60 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/20"
              >
                Login with Turnkey
              </button>
            ) : (
              <>
                <div
                  className="relative"
                  onMouseEnter={() => setWalletMenuOpen(true)}
                  onMouseLeave={() => setWalletMenuOpen(false)}
                >
                  <button
                    onClick={() => setWalletMenuOpen((open) => !open)}
                    className="rounded-lg border border-white/20 px-3 py-2 text-sm hover:border-indigo-400/60"
                  >
                    Wallet • {hideBalances ? "****" : `${balances[0].amount.toFixed(4)} ${balances[0].symbol}`}
                  </button>

                  {walletMenuOpen ? (
                    <div className="absolute right-0 mt-2 w-80 rounded-xl border border-white/10 bg-[#0f1629] p-4 shadow-xl">
                      <p className="mb-3 text-xs text-white/60">
                        Token balances (mainnet)
                      </p>
                      <div className="space-y-2">
                        {balances.map((token) => (
                          <div
                            key={token.symbol}
                            className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm"
                          >
                            <span>{token.symbol}</span>
                            <span>{hideBalances ? "****" : token.amount}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setHideBalances((value) => !value)}
                        className="mt-3 rounded-md border border-white/20 px-2 py-1 text-xs"
                      >
                        {hideBalances ? "Show balances" : "Hide balances"}
                      </button>
                      <button
                        onClick={refreshBalances}
                        disabled={isFetchingBalances}
                        className="mt-2 rounded-md border border-white/20 px-2 py-1 text-xs disabled:opacity-60"
                      >
                        {isFetchingBalances ? "Refreshing..." : "Refresh balances"}
                      </button>
                      {nextBalanceRetryAt > nowMs ? (
                        <p className="mt-1 text-[11px] text-amber-300/90">
                          Retry in {Math.ceil((nextBalanceRetryAt - nowMs) / 1000)}s
                        </p>
                      ) : null}
                      <button
                        onClick={() => {
                          void handleCreateSolWallet();
                        }}
                        className="mt-2 w-full rounded-md border border-indigo-400/60 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-100"
                      >
                        Add Solana wallet account
                      </button>
                      {solAddresses.length > 0 ? (
                        <>
                          <p className="mt-3 text-[11px] text-white/60">Active wallet</p>
                          <select
                            value={solAddress ?? ""}
                            onChange={(event) => {
                              setSelectedSolAddress(event.target.value || undefined);
                              setLastBalanceFetchAt(0);
                            }}
                            className="mt-1 w-full rounded-md border border-white/20 bg-[#0b1120] px-2 py-1.5 text-xs text-white"
                          >
                            {solAddresses.map((address) => (
                              <option key={address} value={address}>
                                {address}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : null}
                      <p className="mt-2 text-[11px] text-white/50">RPC: {activeRpcUrl}</p>
                    </div>
                  ) : null}
                </div>

                <button
                  onClick={() => {
                    setActiveAction("deposit");
                    setActionModalOpen(true);
                  }}
                  className="rounded-lg border border-indigo-400/60 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-100"
                >
                  Deposit
                </button>

                <div className="relative">
                  <button
                    onClick={() => setProfileMenuOpen((open) => !open)}
                    className="rounded-lg border border-white/20 px-3 py-2 text-sm"
                  >
                    {user?.userName?.[0]?.toUpperCase() ?? "P"}
                  </button>
                  {profileMenuOpen ? (
                    <div className="absolute right-0 mt-2 w-80 rounded-xl border border-white/10 bg-[#0f1629] p-4 shadow-xl">
                      <p className="text-xs text-white/60">Profile</p>
                      <p className="mt-2 text-sm text-white/80">{user?.userName ?? "Turnkey user"}</p>
                      <p className="mt-3 text-xs text-white/60">
                        Active Turnkey Solana address
                      </p>
                      <p className="mt-1 rounded-lg border border-white/10 bg-black/20 p-2 text-xs break-all">
                        {activeAddress ?? "No Solana wallet account"}
                      </p>
                      <button
                        onClick={() => {
                          void logout();
                        }}
                        className="mt-3 w-full rounded-md border border-red-400/60 px-2 py-1.5 text-xs text-red-200"
                      >
                        Logout
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="mx-auto grid w-full max-w-[1800px] grid-cols-1 gap-0 p-3 xl:grid-cols-10">
        <section className="overflow-hidden rounded-l-xl border border-white/10 bg-[#0b0f19] xl:col-span-7 xl:h-[calc(100vh-96px)]">
          <TradingTerminal tokenInfo={liveTokenInfo} />
        </section>

        <aside className="rounded-r-xl border border-l-0 border-white/10 bg-[#090d1a] p-4 xl:col-span-3 xl:h-[calc(100vh-96px)]">
          <TradingAssistant
            solPrice={solPrice}
            solBalance={balances[0]?.amount ?? 0}
            walletAddress={activeAddress}
            swapHistory={swapHistory}
            onManualSwapRecorded={(entry) => {
              setSwapHistory((previous) => [
                {
                  id: crypto.randomUUID(),
                  fromSymbol: entry.fromSymbol,
                  toSymbol: entry.toSymbol,
                  amount: entry.amount,
                  status: entry.status,
                  createdAt: Date.now(),
                  error: entry.error,
                },
                ...previous,
              ]);
            }}
          />
        </aside>
      </main>

      {actionModalOpen && isAuthenticated ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4"
          onClick={() => setActionModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1020] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex gap-2 text-sm">
                {(["deposit", "withdraw", "transfer"] as const).map((action) => (
                  <button
                    key={action}
                    onClick={() => setActiveAction(action)}
                    className={`rounded-md px-3 py-1.5 capitalize ${
                      activeAction === action
                        ? "border border-indigo-400/70 bg-indigo-500/20"
                        : "border border-white/20"
                    }`}
                  >
                    {action}
                  </button>
                ))}
              </div>
              <button
                className="rounded-md border border-white/20 px-2 py-1 text-xs"
                onClick={() => setActionModalOpen(false)}
              >
                Close
              </button>
            </div>

            {!activeAddress ? (
              <button
                onClick={() => {
                  void handleCreateSolWallet();
                }}
                className="rounded-lg border border-emerald-400/60 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/10"
              >
                Create Solana Wallet Account
              </button>
            ) : activeAction === "deposit" ? (
              <div className="space-y-3">
                <p className="text-sm text-white/70">Send only Solana assets to this address:</p>
                <p className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs break-all">
                  {activeAddress}
                </p>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(activeAddress);
                    setStatusMessage("Address copied.");
                  }}
                  className="w-full rounded-lg border border-indigo-400/70 bg-indigo-500/20 px-3 py-2 text-sm"
                >
                  Copy Address
                </button>
              </div>
            ) : (
              <form onSubmit={handleActionSubmit} className="grid gap-3">
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Amount"
                  className="rounded-lg border border-white/20 bg-[#060a16] px-3 py-2 text-sm"
                />
                <select
                  value={tokenSymbol}
                  onChange={(event) => setTokenSymbol(event.target.value)}
                  className="rounded-lg border border-white/20 bg-[#060a16] px-3 py-2 text-sm"
                >
                  <option value="SOL">SOL</option>
                  <option value="USDC">USDC</option>
                  <option value="BONK">BONK</option>
                </select>
                <input
                  value={targetAddress}
                  onChange={(event) => setTargetAddress(event.target.value)}
                  placeholder="Recipient destination address"
                  className="rounded-lg border border-white/20 bg-[#060a16] px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={isSubmittingTx || isSolSendDisabled}
                  className="rounded-lg border border-indigo-400/70 bg-indigo-500/20 px-3 py-2 text-sm"
                >
                  {isSubmittingTx
                    ? "Submitting..."
                    : isSolSendDisabled
                      ? "Enable Turnkey Sol Send"
                      : `Confirm ${activeAction}`}
                </button>
              </form>
            )}

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-white/60">
                {user?.userName ?? "Turnkey user"}
              </p>
            </div>
            {statusMessage ? <p className="mt-3 text-xs text-white/70">{statusMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
