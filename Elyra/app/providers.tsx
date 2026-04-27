"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_CLIENT_ID = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;
const INVITE_UNLOCK_KEY = "elyra_invite_unlocked";

function InviteRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    const syncUnlockState = () => {
      if (typeof window === "undefined") return;
      setIsUnlocked(window.localStorage.getItem(INVITE_UNLOCK_KEY) === "true");
      setIsReady(true);
    };

    syncUnlockState();
    window.addEventListener("storage", syncUnlockState);
    window.addEventListener("focus", syncUnlockState);

    return () => {
      window.removeEventListener("storage", syncUnlockState);
      window.removeEventListener("focus", syncUnlockState);
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const unlockedNow =
      typeof window !== "undefined" &&
      window.localStorage.getItem(INVITE_UNLOCK_KEY) === "true";

    if (unlockedNow !== isUnlocked) {
      setIsUnlocked(unlockedNow);
    }

    if (!unlockedNow && pathname !== "/invite") {
      router.replace("/invite");
      return;
    }

    if (unlockedNow && pathname === "/invite") {
      router.replace("/");
    }
  }, [isReady, isUnlocked, pathname, router]);

  if (
    !isReady ||
    (!isUnlocked && pathname !== "/invite") ||
    (isUnlocked && pathname === "/invite")
  ) {
    return null;
  }

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID || !PRIVY_CLIENT_ID) {
    throw new Error(
      "Missing Privy config. Set NEXT_PUBLIC_PRIVY_APP_ID and NEXT_PUBLIC_PRIVY_CLIENT_ID in .env.local",
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID}
      config={{
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <InviteRouteGuard>{children}</InviteRouteGuard>
      </div>
    </PrivyProvider>
  );
}
