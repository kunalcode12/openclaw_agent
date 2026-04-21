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
  const [isSolSendDisabled, setIsSolSendDisabled] = useState(false);
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

    setStatusMessage("Creating Solana wallet…");
    try {
      await createWallet({
        walletName: "Elyra Solana Wallet",
        accounts: ["ADDRESS_FORMAT_SOLANA"],
      });
      setStatusMessage("Solana wallet created. You can deposit when the address appears.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error("Turnkey createWallet failed:", error);
      setStatusMessage(
        `Could not create wallet: ${message}. Confirm Turnkey org ID, auth proxy, and that wallet creation is allowed for this user.`,
      );
    }
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
          signWith: activeAddress,
          caip2: SOLANA_MAINNET_CAIP2,
          recentBlockhash: blockhash,
        },
      });

      setStatusMessage(
        `${activeAction} transaction submitted on Solana mainnet.`,
      );
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
      <div className="grid h-full min-h-0 flex-1 place-items-center bg-black text-white">
        <p className="text-sm text-white/80">Initializing Turnkey client...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-black text-white">
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

      <main className="mx-auto flex w-full max-w-[1800px] flex-1 min-h-0 flex-col gap-0 overflow-hidden xl:grid xl:grid-cols-10 xl:grid-rows-[minmax(0,1fr)] xl:items-stretch">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-black max-xl:min-h-[min(360px,55dvh)] xl:col-span-7 xl:h-full xl:max-h-full xl:min-h-0 xl:rounded-l-xl xl:rounded-r-none">
          <TradingTerminal tokenInfo={liveTokenInfo} />
        </section>

        <aside className="flex min-h-0 flex-1 flex-col overflow-hidden border border-white/10 bg-black max-xl:min-h-[min(280px,45dvh)] xl:col-span-3 xl:h-full xl:max-h-full xl:min-h-0 xl:border-l-0 xl:rounded-r-xl xl:rounded-l-none">
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
        userName={user?.userName}
        statusMessage={statusMessage}
        onAddressCopied={() => setStatusMessage("Address copied.")}
      />
    </div>
  );
}
