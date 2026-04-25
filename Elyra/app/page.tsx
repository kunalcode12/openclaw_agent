"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  useCreateWallet,
  useSignAndSendTransaction,
  useWallets,
} from "@privy-io/react-auth/solana";
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
import TradingAssistant, {
  type SwapHistoryItem,
} from "@/components/TradingAssistant";
import Navbar from "@/components/Navbar";
import ActionModal from "@/components/ActionModal";

type TokenBalance = {
  symbol: string;
  amount: number;
};

const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const SOLANA_MAINNET_CHAIN = "solana:mainnet" as const;
const RPC_FALLBACK_URLS = [
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
];
const BLOCKED_SOLANA_ADDRESSES = new Set([
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
  const { login, logout, authenticated, ready, user } = usePrivy();
  const { wallets: solanaWallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<
    "deposit" | "withdraw" | "transfer"
  >("deposit");
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
  const [statusMessage, setStatusMessage] = useState("");
  const [hideBalances, setHideBalances] = useState(false);
  const [activeRpcUrl, setActiveRpcUrl] = useState(rpcUrl);
  const [blockedRpcUrls, setBlockedRpcUrls] = useState<string[]>([]);
  const [lastBalanceFetchAt, setLastBalanceFetchAt] = useState<number>(0);
  const [nextBalanceRetryAt, setNextBalanceRetryAt] = useState<number>(0);
  const [solPrice, setSolPrice] = useState<number>(tradingDummyToken.price);
  const [solPriceChange, setSolPriceChange] = useState<number>(
    tradingDummyToken.priceChange,
  );
  const [swapHistory, setSwapHistory] = useState<SwapHistoryItem[]>([]);
  const [selectedSolAddress] = useState<string | undefined>(undefined);

  const isReady = ready;
  const isAuthenticated = authenticated;
  const userDisplayName = useMemo(() => {
    const privyUser = user as
      | {
          email?: { address?: string };
          google?: { email?: string };
          phone?: { number?: string };
          wallet?: { address?: string };
          id?: string;
        }
      | undefined;

    return (
      privyUser?.email?.address ??
      privyUser?.google?.email ??
      privyUser?.phone?.number ??
      privyUser?.wallet?.address ??
      privyUser?.id
    );
  }, [user]);

  const solAddresses = useMemo(() => {
    const walletList = (solanaWallets ?? []) as Array<{ address?: string }>;
    const discoveredAddresses: string[] = [];

    for (const wallet of walletList) {
      if (
        wallet.address &&
        !BLOCKED_SOLANA_ADDRESSES.has(wallet.address) &&
        !discoveredAddresses.includes(wallet.address)
      ) {
        discoveredAddresses.push(wallet.address);
      }
    }

    return discoveredAddresses;
  }, [solanaWallets]);

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
  const activeWallet = useMemo(() => {
    return (solanaWallets ?? []).find(
      (wallet) => wallet.address === activeAddress,
    );
  }, [activeAddress, solanaWallets]);

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
            setBlockedRpcUrls((previous) =>
              previous.includes(candidate)
                ? previous
                : [...previous, candidate],
            );
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

        if (
          !cancelled &&
          typeof nextPrice === "number" &&
          Number.isFinite(nextPrice)
        ) {
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

    await createWallet();
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
        const tokenMeta =
          TOKEN_METADATA[tokenSymbol as keyof typeof TOKEN_METADATA];
        if (!tokenMeta) {
          throw new Error("Unsupported token selected");
        }

        const mint = new PublicKey(tokenMeta.mint);
        const sourceAta = getAssociatedTokenAddressSync(mint, owner);
        const destinationAta = getAssociatedTokenAddressSync(mint, destination);

        const destinationAtaInfo =
          await connection.getAccountInfo(destinationAta);
        if (!destinationAtaInfo) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              owner,
              destinationAta,
              destination,
              mint,
            ),
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
      if (!activeWallet) {
        throw new Error("No Privy Solana wallet is available for signing.");
      }

      await signAndSendTransaction({
        wallet: activeWallet,
        chain: SOLANA_MAINNET_CHAIN,
        transaction: versionedTx.serialize(),
      });

      setStatusMessage(
        `${activeAction} transaction submitted on Solana mainnet.`,
      );

      setAmount("");
      setTargetAddress("");
      await refreshBalances();
    } catch (error) {
      console.error("Transaction failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        errorMessage.toLowerCase().includes("not enabled") ||
        errorMessage.toLowerCase().includes("permission")
      ) {
        setStatusMessage(
          "Privy Solana send is disabled for this app. Please enable embedded Solana wallet permissions in Privy before withdraw/transfer.",
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
      <div className="min-h-screen bg-black text-white grid place-items-center">
        <p className="text-sm text-white/80">Initializing Privy client...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar
        solPrice={solPrice}
        isAuthenticated={isAuthenticated}
        onLogin={() => {
          void login();
        }}
        walletMenuOpen={walletMenuOpen}
        onWalletMenuOpenChange={setWalletMenuOpen}
        hideBalances={hideBalances}
        balances={balances}
        onToggleHideBalances={() => setHideBalances((value) => !value)}
        onRefreshBalances={() => {
          void refreshBalances();
        }}
        isFetchingBalances={isFetchingBalances}
        activeRpcUrl={activeRpcUrl}
        onOpenDeposit={() => {
          setActiveAction("deposit");
          setActionModalOpen(true);
        }}
        profileMenuOpen={profileMenuOpen}
        onProfileMenuOpenChange={setProfileMenuOpen}
        userName={userDisplayName}
        solAddress={solAddress}
        onLogout={() => {
          void logout();
        }}
      />

      <main className="mx-auto grid w-full max-w-[1800px] grid-cols-1 gap-0 xl:grid-cols-10">
        <section className="overflow-hidden rounded-l-xl border border-white/10 bg-black xl:col-span-7 xl:h-[calc(100vh-96px)]">
          <TradingTerminal tokenInfo={liveTokenInfo} />
        </section>

        <aside className="border border-l-0 border-white/10 bg-black xl:col-span-3 xl:h-[calc(100vh-96px)]">
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

      <ActionModal
        open={actionModalOpen}
        isAuthenticated={isAuthenticated}
        activeAction={activeAction}
        onSetActiveAction={setActiveAction}
        onClose={() => setActionModalOpen(false)}
        solAddress={solAddress}
        onCreateSolWallet={handleCreateSolWallet}
        onActionSubmit={handleActionSubmit}
        amount={amount}
        onAmountChange={setAmount}
        tokenSymbol={tokenSymbol}
        onTokenSymbolChange={setTokenSymbol}
        targetAddress={targetAddress}
        onTargetAddressChange={setTargetAddress}
        isSubmittingTx={isSubmittingTx}
        userName={userDisplayName}
        statusMessage={statusMessage}
        onAddressCopied={() => setStatusMessage("Address copied.")}
      />
    </div>
  );
}
