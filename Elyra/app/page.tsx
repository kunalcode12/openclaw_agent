"use client";

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
  type SwapAction,
  type SwapHistoryItem,
} from "@/components/TradingAssistant";
import Navbar from "@/components/Navbar";
import ActionModal from "@/components/ActionModal";

type TokenBalance = {
  symbol: string;
  amount: number;
};

const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const RPC_FALLBACK_URLS = [
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
];

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
  const [solPrice, setSolPrice] = useState<number>(tradingDummyToken.price);
  const [solPriceChange, setSolPriceChange] = useState<number>(
    tradingDummyToken.priceChange,
  );
  const [swapHistory, setSwapHistory] = useState<SwapHistoryItem[]>([]);

  const isReady = clientState === ClientState.Ready;
  const isAuthenticated = authState === AuthState.Authenticated;

  const solAddress = useMemo(() => {
    const walletList = (wallets ?? []) as Array<{
      accounts?: Array<{ address?: string; addressFormat?: string }>;
    }>;

    for (const wallet of walletList) {
      for (const account of wallet.accounts ?? []) {
        if (account.addressFormat?.includes("SOLANA") && account.address) {
          return account.address;
        }
      }
    }

    return undefined;
  }, [wallets]);

  const liveTokenInfo = useMemo<TokenInfo>(
    () => ({
      ...tradingDummyToken,
      price: solPrice,
      priceChange: solPriceChange,
    }),
    [solPrice, solPriceChange],
  );

  const refreshBalances = useCallback(async () => {
    if (!solAddress) {
      return;
    }

    setIsFetchingBalances(true);
    setStatusMessage("");

    try {
      const owner = new PublicKey(solAddress);
      const rpcCandidates = Array.from(
        new Set(
          [rpcUrl, ...RPC_FALLBACK_URLS].filter(
            (url) => !blockedRpcUrls.includes(url),
          ),
        ),
      );
      let lastError: unknown;
      let sawForbiddenError = false;
      let sawRateLimitError = false;

      for (const candidate of rpcCandidates) {
        try {
          const connection = new Connection(candidate, "confirmed");
          const lamports = await connection.getBalance(owner);
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            owner,
            {
              programId: TOKEN_PROGRAM_ID,
            },
          );

          let usdcAmount = 0;
          let bonkAmount = 0;

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
          }
          if (errorText.includes("429")) {
            sawRateLimitError = true;
          }
          lastError = error;
        }
      }

      if (sawForbiddenError && rpcCandidates.length > 1) {
        setStatusMessage(
          "Primary RPC access is forbidden (403). Switched to fallback RPCs where possible.",
        );
      }

      if (sawRateLimitError) {
        setStatusMessage(
          "RPC is rate-limited (429). Retrying with fallback endpoints automatically.",
        );
      }

      throw lastError;
    } catch (error) {
      console.error("Failed to fetch balances:", error);
      const errorText = String(error);
      if (errorText.includes("403")) {
        setStatusMessage(
          "RPC key is blocked/invalid (403). Add a valid NEXT_PUBLIC_SOLANA_RPC_URL key or keep public fallback RPCs.",
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
  }, [blockedRpcUrls, rpcUrl, solAddress]);

  useEffect(() => {
    if (!walletMenuOpen || !isAuthenticated || !solAddress) {
      return;
    }
    if (Date.now() - lastBalanceFetchAt < 30_000) {
      return;
    }
    queueMicrotask(() => {
      void refreshBalances();
    });
  }, [
    walletMenuOpen,
    isAuthenticated,
    solAddress,
    lastBalanceFetchAt,
    refreshBalances,
  ]);

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

    await createWallet({
      walletName: "Elyra Solana Wallet",
      accounts: ["ADDRESS_FORMAT_SOLANA"],
    });
  };

  const handleActionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!solAddress) {
      setStatusMessage("No Solana wallet account found. Create one first.");
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
      const owner = new PublicKey(solAddress);
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
      const serializedTx = Buffer.from(versionedTx.serialize()).toString(
        "base64",
      );

      await handleSendTransaction({
        transaction: {
          unsignedTransaction: serializedTx,
          signWith: solAddress,
          caip2: SOLANA_MAINNET_CAIP2,
          recentBlockhash: blockhash,
        },
      });

      setStatusMessage(
        `${activeAction} transaction submitted on Solana mainnet.`,
      );
      setAmount("");
      setTargetAddress("");
      await refreshBalances();
    } catch (error) {
      console.error("Transaction failed:", error);
      setStatusMessage(
        `Transaction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsSubmittingTx(false);
    }
  };

  const executeSwapFromChat = useCallback(
    async (action: SwapAction) => {
      if (!solAddress) {
        return { error: "No Solana wallet found." };
      }

      const historyId = crypto.randomUUID();
      setSwapHistory((previous) => [
        {
          id: historyId,
          fromSymbol: action.fromSymbol,
          toSymbol: action.toSymbol,
          amount: action.amount,
          status: "pending",
          createdAt: Date.now(),
        },
        ...previous,
      ]);

      try {
        const versionedTx = VersionedTransaction.deserialize(
          Buffer.from(action.swapTransaction, "base64"),
        );
        const recentBlockhash = versionedTx.message.recentBlockhash;

        const result = await handleSendTransaction({
          transaction: {
            unsignedTransaction: action.swapTransaction,
            signWith: solAddress,
            caip2: SOLANA_MAINNET_CAIP2,
            recentBlockhash,
          },
        });

        const signature =
          typeof result === "object" &&
          result !== null &&
          "transactionId" in result
            ? String(
                (
                  result as {
                    transactionId?: string;
                  }
                ).transactionId ?? "",
              )
            : undefined;

        setSwapHistory((previous) =>
          previous.map((item) =>
            item.id === historyId
              ? {
                  ...item,
                  status: "confirmed",
                  signature,
                }
              : item,
          ),
        );
        await refreshBalances();
        return { signature };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown swap error";
        setSwapHistory((previous) =>
          previous.map((item) =>
            item.id === historyId
              ? {
                  ...item,
                  status: "failed",
                  error: errorMessage,
                }
              : item,
          ),
        );
        return { error: errorMessage };
      }
    },
    [handleSendTransaction, refreshBalances, solAddress],
  );

  if (!isReady) {
    return (
      <div className="min-h-screen bg-black text-white grid place-items-center">
        <p className="text-sm text-white/80">Initializing Turnkey client...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar
        solPrice={solPrice}
        isAuthenticated={isAuthenticated}
        onLogin={() => {
          void handleLogin();
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
        userName={user?.userName}
        solAddress={solAddress}
        onLogout={() => {
          void logout();
        }}
      />

      <main className="mx-auto grid w-full max-w-[1800px] grid-cols-1 gap-0 xl:grid-cols-10">
        <section className="overflow-hidden rounded-l-xl border border-white/10 bg-black xl:col-span-7 xl:h-[calc(100vh-96px)]">
          <TradingTerminal tokenInfo={liveTokenInfo} />
        </section>

        <aside className=" border border-l-0 border-white/10 bg-black xl:col-span-3 xl:h-[calc(100vh-96px)]">
          <TradingAssistant
            solPrice={solPrice}
            walletAddress={solAddress}
            onExecuteSwap={executeSwapFromChat}
            swapHistory={swapHistory}
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
        userName={user?.userName}
        statusMessage={statusMessage}
        onAddressCopied={() => setStatusMessage("Address copied.")}
      />
    </div>
  );
}
