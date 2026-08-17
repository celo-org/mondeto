"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useConnect, WagmiProvider, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { celo, celoSepolia } from "viem/chains";
import { ChainGuard } from "./ChainGuard";
import { WalletAnalytics } from "./wallet-analytics";
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
// 3. Non-MiniPay clients load the Privy tree with a dynamic `import()`
//    started from an effect, and swap to it only once the chunk has
//    resolved — children stay mounted in the vanilla tree the whole
//    time, so there is exactly one provider swap and no window where
//    the app tree is unmounted. `PrivyProvider` still initializes only
//    in the browser, so `@privy-io/wagmi`'s hooks (which transitively
//    call `useWallets`) never trip on the server pass.
//
//    Do not reintroduce `next/dynamic({ loading: () => null })` here:
//    with `{children}` as the dynamic component's child, the `null`
//    loading state unmounts the entire app and remounts it when the
//    chunk arrives. Whether an in-flight async callback then hits a
//    ref that unmount already nulled is a chunk-timing race — that is
//    how an unrelated dependency bump took every non-MiniPay browser
//    down for days (#221) while no source diff explained it.
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

type PrivyTreeComponent = React.ComponentType<{ children: React.ReactNode }>;

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
  const [Privy, setPrivy] = useState<PrivyTreeComponent | null>(null);
  useEffect(() => setMounted(true), []);

  // Start the Privy chunk load; the vanilla tree below keeps rendering
  // until it resolves. This must stay a dynamic `import()` — a static
  // import would put Privy (and its `x402` / `@solana/kit` subtree) in
  // the shared chunk MiniPay clients download, undoing the isolation
  // asserted in minipay-privy-isolation.test.ts.
  useEffect(() => {
    if (isMiniPay) return;
    let live = true;
    import("./wallet-provider-privy")
      .then((m) => {
        if (live) setPrivy(() => m.PrivyTree);
      })
      .catch((err) => {
        // Degraded, not down: without the chunk the Privy connect flow
        // is unavailable, but the vanilla tree keeps the app rendering.
        console.error("wallet-provider: Privy chunk failed to load", err);
      });
    return () => {
      live = false;
    };
  }, [isMiniPay]);

  // SSR + first paint: vanilla wagmi only. Also the branch for MiniPay
  // once mounted — no Privy code path is reachable here — and for
  // browsers while the Privy chunk is still in flight.
  if (!mounted || isMiniPay || !Privy) {
    return (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {mounted && isMiniPay && <MiniPayAutoConnect />}
          <ChainGuard />
          <WalletAnalytics />
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    );
  }

  // Browser, non-MiniPay, chunk resolved: one deterministic swap into
  // the Privy tree. No Privy code ran on the server.
  return <Privy>{children}</Privy>;
}
