"use client";

import { PrivyProvider } from "@privy-io/react-auth";

const PRIVY_APP_ID = "cmoe9pyaf01390cl5b266f3g5";
const PRIVY_CLIENT_ID = "client-WY6YegrwX6Hzz1GxvbWAFX7mkih5KU7xmkQMCJzp8EgvX";

export function Providers({ children }: { children: React.ReactNode }) {
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
      {children}
    </PrivyProvider>
  );
}
