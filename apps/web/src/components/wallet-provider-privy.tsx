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

/**
 * Publishes Privy's *actual* readiness rather than asserting it.
 *
 * This used to be a hardcoded `value={true}`, which claimed readiness the
 * instant `PrivyProvider` mounted. `usePrivy().ready` is false for a moment
 * after that, and `ConnectButtonInteractive` — gated on this context and itself
 * a second `next/dynamic` boundary — could resolve inside that window and call
 * `useConnectWallet` before Privy had initialised. That is the likely source of
 * the two `useWallets was called outside the PrivyProvider component` warnings
 * that preceded the crash in #221.
 *
 * Observing the real value costs nothing: consumers already treat `false` as
 * "keep the placeholder", which is what the first moments should show anyway.
 */
function PrivyReady({ children }: { children: React.ReactNode }) {
  const { ready } = usePrivy();
  return <PrivyReadyContext.Provider value={ready}>{children}</PrivyReadyContext.Provider>;
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
          <PrivyReady>
            <ChainGuard />
            <WalletAnalytics />
            {children}
          </PrivyReady>
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
