"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useConnect, WagmiProvider, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { celo, celoSepolia } from "viem/chains";
import { ChainGuard } from "./ChainGuard";
import { celoTransport, celoSepoliaTransport } from "@/lib/chain";

// Architecture — MiniPay first, Privy lazy.
//
// 1. SSR + first client paint always render the vanilla wagmi tree
//    below. No Privy module is imported on this path; child hooks
//    (`useAccount`, `useReadContract`, …) get a stable wagmi context
//    that returns safe defaults. This is what unblocks SSR — Privy's
//    `useWallets` throw cannot fire if the tree above never touches
//    Privy.
//
// 2. After hydration, MiniPay is detected synchronously from
//    `window.ethereum.isMiniPay`. MiniPay users keep the vanilla tree
//    and the injected connector auto-connects. The Privy SDK never
//    loads for them — if Privy is broken, MiniPay still works.
//
// 3. Non-MiniPay clients lazy-load the Privy tree via
//    `next/dynamic({ ssr: false })`. `PrivyProvider` initializes only
//    in the browser where its context value populates correctly, so
//    `@privy-io/wagmi`'s hooks (which transitively call `useWallets`)
//    no longer trip on the server pass.
//
// The previous design rendered `PrivyProvider` during SSR; since Privy
// v1.55.0 `useWallets` throws outside the provider, and every wagmi
// hook under `@privy-io/wagmi` calls it. That crashed every Vercel
// route — `force-dynamic` on the layout just moved the failure from
// build-time prerender to runtime SSR.

// `ssr: true` is wagmi's documented fix for Next.js hydration mismatch:
// without it, wagmi auto-reconnects from localStorage during the first
// client render, so `useAccount` returns a connected address on the
// client while the SSR pass saw `undefined`. The mismatch trips React
// error #418 and the downstream tree is replayed, which in our setup
// then crashes the lazy Privy chunk mid-load.
const wagmiConfig = createConfig({
  chains: [celo, celoSepolia],
  connectors: [injected()],
  ssr: true,
  transports: {
    [celo.id]: celoTransport,
    [celoSepolia.id]: celoSepoliaTransport,
  },
});

const queryClient = new QueryClient();

const PrivyTree = dynamic(
  () => import("./wallet-provider-privy").then((m) => m.PrivyTree),
  { ssr: false, loading: () => null },
);

function detectMiniPaySync(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay;
}

function MiniPayAutoConnect() {
  const { connect, connectors } = useConnect();

  useEffect(() => {
    const injectedConnector = connectors.find((c) => c.id === "injected");
    if (injectedConnector) {
      connect({ connector: injectedConnector });
    }
  }, [connect, connectors]);

  return null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Synchronous on the client (initializer runs once on mount); false
  // on the server. Combined with the `mounted` gate below this avoids
  // hydration mismatch — both SSR and the first client render output
  // the same vanilla tree.
  const [isMiniPay] = useState(detectMiniPaySync);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // SSR + first paint: vanilla wagmi only. Also the branch for MiniPay
  // once mounted — no Privy code path is reachable here.
  if (!mounted || isMiniPay) {
    return (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {mounted && isMiniPay && <MiniPayAutoConnect />}
          <ChainGuard />
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    );
  }

  // Browser, non-MiniPay: bring up the Privy tree. The dynamic import
  // resolves on the client only, so no Privy code ran on the server.
  return <PrivyTree>{children}</PrivyTree>;
}
