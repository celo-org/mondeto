"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import {
  WagmiProvider as PrivyWagmiProvider,
  createConfig as createPrivyWagmiConfig,
} from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext } from "react";
import { injected } from "wagmi/connectors";
import { celo, celoSepolia } from "viem/chains";
import { ChainGuard } from "./ChainGuard";
import { WalletAnalytics } from "./wallet-analytics";
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

// Children read this to decide whether it's safe to call Privy hooks.
// The default (false) is what they see under the vanilla wagmi tree on
// SSR / first paint / MiniPay; PrivyTree below provides `true`.
export const PrivyReadyContext = createContext(false);

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
          <PrivyReadyContext.Provider value={true}>
            <ChainGuard />
            <WalletAnalytics />
            {children}
          </PrivyReadyContext.Provider>
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
