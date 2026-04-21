"use client";

import {
  TurnkeyProvider,
  type TurnkeyProviderConfig,
} from "@turnkey/react-wallet-kit";

const turnkeyConfig: TurnkeyProviderConfig = {
  organizationId: process.env.NEXT_PUBLIC_ORGANIZATION_ID ?? "",
  authProxyConfigId: process.env.NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID ?? "",
  auth: {
    oauthConfig: {
      openOauthInPage: true,
      oauthRedirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI ?? "",
      googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    },
  },
  walletConfig: {
    chains: {
      solana: {
        native: true,
        walletConnectNamespaces: [],
      },
      ethereum: {
        native: false,
        walletConnectNamespaces: [],
      },
    },
    features: {
      auth: true,
    },
  },
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TurnkeyProvider
      config={turnkeyConfig}
      callbacks={{
        onError: (error) => {
          console.error("Turnkey error:", error);
        },
      }}
    >
      {children}
    </TurnkeyProvider>
  );
}
