"use client";

import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import {
  WagmiProvider as PrivyWagmiProvider,
  createConfig as createPrivyWagmiConfig,
} from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "wagmi/connectors";
import { celo, celoSepolia } from "viem/chains";
import { ChainGuard } from "./ChainGuard";
import { WalletAnalytics } from "./wallet-analytics";
import { PrivyReadyContext } from "./privy-ready-context";
import { celoTransport, celoSepoliaTransport } from "@/lib/chain";

// Privy-only tree, isolated from the MiniPay path. Lazy-loaded by
// WalletProvider via next/dynamic({ ssr: false }) so this module never
// executes in the server bundle. That isolation is load-bearing —
// `@privy-io/wagmi`'s wagmi hooks internally call `useWallets`, which
// since Privy v1.55.0 throws when read outside `PrivyProvider`. Letting
// the SSR pass touch this tree would crash every route.
//
// Privy docs require importing `createConfig` + `WagmiProvider` from
// `@privy-io/wagmi`, not from `wagmi` directly. See
// https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi
const privyWagmiConfig = createPrivyWagmiConfig({
  chains: [celo, celoSepolia],
  connectors: [injected()],
  ssr: true,
  transports: {
    [celo.id]: celoTransport,
    [celoSepolia.id]: celoSepoliaTransport,
  },
});

const queryClient = new QueryClient();

// `PrivyReadyContext` lives in its own module (`privy-ready-context.ts`) so
// consumers can read it without importing this file — importing it here
// would drag `@privy-io/*` and its `x402` / `@solana/kit` subtree into their
// chunk. See the note in that module.

// The context must observe `usePrivy().ready`, not assert it: `ready` is
// false for a moment after `PrivyProvider` mounts, and consumers gated on
// this context (`ConnectButtonInteractive` is its own dynamic chunk) can
// resolve inside that window and call Privy hooks too early. A hardcoded
// `true` here was one source of the `useWallets was called outside the
// PrivyProvider component` warnings in #221.
function PrivyReadyBridge({ children }: { children: React.ReactNode }) {
  const { ready } = usePrivy();
  return (
    <PrivyReadyContext.Provider value={ready}>
      {children}
    </PrivyReadyContext.Provider>
  );
}

export function PrivyTree({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "cmmxiatqc01fa0cjv4eg3b9kp"}
      config={{
        defaultChain: celo,
        supportedChains: [celo, celoSepolia],
        // Needed for the wallet_connect entry in walletList below — the
        // desktop QR-code flow. MiniPay users never reach this tree.
        walletConnectCloudProjectId:
          process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
        loginMethods: ["wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
        appearance: {
          theme: "dark",
          accentColor: "#00ff41",
          walletList: ["metamask", "wallet_connect"],
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={privyWagmiConfig}>
          <PrivyReadyBridge>
            <ChainGuard />
            <WalletAnalytics />
            {children}
          </PrivyReadyBridge>
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
