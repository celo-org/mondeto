"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import {
  WagmiProvider as PrivyWagmiProvider,
  createConfig as createPrivyWagmiConfig,
} from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  http,
  useConnect,
  WagmiProvider,
  createConfig,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { celo, celoSepolia } from "viem/chains";
import { ChainGuard } from "./ChainGuard";

// Two wagmi configs.
//
// MiniPay users never log in through Privy — they arrive with a working
// injected provider (`window.ethereum.isMiniPay === true`). `@privy-io/wagmi`'s
// WagmiProvider gates wagmi state on Privy's auth state, so a MiniPay-only
// connection never surfaces through `useAccount()`. We render the vanilla
// wagmi tree for MiniPay and the Privy-wrapped tree for everyone else.

const minipayWagmiConfig = createConfig({
  chains: [celo, celoSepolia],
  connectors: [injected()],
  transports: {
    [celo.id]: http(),
    [celoSepolia.id]: http(),
  },
});

const privyWagmiConfig = createPrivyWagmiConfig({
  chains: [celo, celoSepolia],
  connectors: [injected()],
  transports: {
    [celo.id]: http(),
    [celoSepolia.id]: http(),
  },
});

const queryClient = new QueryClient();

function MiniPayAutoConnect({ children }: { children: React.ReactNode }) {
  const { connect, connectors } = useConnect();

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum?.isMiniPay) {
      const injectedConnector = connectors.find((c) => c.id === "injected");
      if (injectedConnector) {
        connect({ connector: injectedConnector });
      }
    }
  }, [connect, connectors]);

  return <>{children}</>;
}

function useIsMiniPay(): boolean | null {
  // null while we're still on the server / haven't checked window yet.
  // Returning a tri-state lets the caller pick a stable initial render
  // (we default to "browser / Privy" before the check finishes).
  const [state, setState] = useState<boolean | null>(null);
  useEffect(() => {
    setState(typeof window !== "undefined" && !!window.ethereum?.isMiniPay);
  }, []);
  return state;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const isMiniPay = useIsMiniPay();

  // Before the client-side check resolves, render the Privy tree —
  // this matches SSR output (window.ethereum is unavailable on the
  // server) and avoids hydration mismatch. On MiniPay the tree swaps
  // on first effect and the auto-connect fires.
  if (isMiniPay) {
    return (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={minipayWagmiConfig}>
          <MiniPayAutoConnect>
            <ChainGuard />
            {children}
          </MiniPayAutoConnect>
        </WagmiProvider>
      </QueryClientProvider>
    );
  }

  return (
    <PrivyProvider
      appId="cmmxiatqc01fa0cjv4eg3b9kp"
      config={{
        // Pinned to celoSepolia to work around a latent SSR crash:
        // `ConnectButton` calls Privy's `useConnectWallet()` during the
        // server render, which trips `useWallets was called outside the
        // PrivyProvider component`. The crash only surfaces when
        // `defaultChain: celo`; with celoSepolia the same code path
        // returns gracefully. Flip back to `celo` once the SSR gating
        // is added to ConnectButton / WalletProvider.
        defaultChain: celoSepolia,
        supportedChains: [celo, celoSepolia],
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
          <ChainGuard />
          {children}
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
