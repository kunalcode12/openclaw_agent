"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthState, ClientState, useTurnkey } from "@turnkey/react-wallet-kit";
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

type TokenBalance = {
  symbol: string;
  amount: number;
};

const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const RPC_FALLBACK_URLS = ["https://api.mainnet-beta.solana.com", "https://rpc.ankr.com/solana"];

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
  const [statusMessage, setStatusMessage] = useState("");
  const [hideBalances, setHideBalances] = useState(false);
  const [activeRpcUrl, setActiveRpcUrl] = useState(rpcUrl);
  const [lastBalanceFetchAt, setLastBalanceFetchAt] = useState<number>(0);

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

  const refreshBalances = useCallback(async () => {
    if (!solAddress) {
      return;
    }

    setIsFetchingBalances(true);
    setStatusMessage("");

    try {
      const owner = new PublicKey(solAddress);
      const rpcCandidates = Array.from(new Set([rpcUrl, ...RPC_FALLBACK_URLS]));
      let lastError: unknown;
      let sawForbiddenError = false;

      for (const candidate of rpcCandidates) {
        try {
          const connection = new Connection(candidate, "confirmed");
          const lamports = await connection.getBalance(owner);
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
            programId: TOKEN_PROGRAM_ID,
          });

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
          }
          lastError = error;
        }
      }

      if (sawForbiddenError) {
        setStatusMessage(
          "Primary RPC access is forbidden (403). Switched to fallback RPCs where possible.",
        );
      }
      throw lastError;
    } catch (error) {
      console.error("Failed to fetch balances:", error);
      const errorText = String(error);
      if (errorText.includes("403")) {
        setStatusMessage(
          "RPC key is blocked/invalid (403). Update NEXT_PUBLIC_SOLANA_RPC_URL or use a valid mainnet key.",
        );
      } else {
        setStatusMessage(
          "Balance fetch is rate-limited (429). Try refresh shortly or switch RPC endpoint.",
        );
      }
    } finally {
      setIsFetchingBalances(false);
    }
  }, [rpcUrl, solAddress]);

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
  }, [walletMenuOpen, isAuthenticated, solAddress, lastBalanceFetchAt, refreshBalances]);

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
          signWith: solAddress,
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
    <div className="min-h-screen bg-[#05070f] text-white">
      <nav className="border-b border-white/10 px-5 py-4">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Elyra logo" width={42} height={42} priority />
            <span className="text-lg font-semibold tracking-wide">ELYRA</span>
          </div>

          <div className="flex items-center gap-3">
            {!isAuthenticated ? (
              <button
                onClick={() => {
                  void handleLogin();
                }}
                className="rounded-lg border border-indigo-400/60 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/10"
              >
                Login with Turnkey (Google enabled)
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
                    <div className="absolute right-0 mt-2 w-80 rounded-xl border border-white/10 bg-[#0b1020] p-4 shadow-xl">
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
                    <div className="absolute right-0 mt-2 w-80 rounded-xl border border-white/10 bg-[#0b1020] p-4 shadow-xl">
                      <p className="text-xs text-white/60">Profile</p>
                      <p className="mt-2 text-sm text-white/80">{user?.userName ?? "Turnkey user"}</p>
                      <p className="mt-3 text-xs text-white/60">Solana address</p>
                      <p className="mt-1 rounded-lg border border-white/10 bg-black/20 p-2 text-xs break-all">
                        {solAddress ?? "No Solana wallet account"}
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
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={16}
            />
            Deploy Now
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/8 px-5 transition-colors hover:border-transparent hover:bg-black/4 dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
      </nav>

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

            {!solAddress ? (
              <button
                onClick={handleCreateSolWallet}
                className="rounded-lg border border-emerald-400/60 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/10"
              >
                Create Solana Wallet Account
              </button>
            ) : activeAction === "deposit" ? (
              <div className="space-y-3">
                <p className="text-sm text-white/70">Send only Solana assets to this address:</p>
                <p className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs break-all">
                  {solAddress}
                </p>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(solAddress);
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
                  disabled={isSubmittingTx}
                  className="rounded-lg border border-indigo-400/70 bg-indigo-500/20 px-3 py-2 text-sm"
                >
                  {isSubmittingTx ? "Submitting..." : `Confirm ${activeAction}`}
                </button>
              </form>
            )}

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-white/60">{user?.userName ?? "Turnkey user"}</p>
            </div>
            {statusMessage ? <p className="mt-3 text-xs text-white/70">{statusMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
