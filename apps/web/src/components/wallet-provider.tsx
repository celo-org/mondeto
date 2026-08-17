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
// 3. Non-MiniPay clients lazy-load the Privy tree with a plain dynamic
//    `import()` resolved into state — deliberately NOT `next/dynamic`,
//    see the note in WalletProvider for why that caused #221. Either
//    way `PrivyProvider` initializes only in the browser, where its
//    context value populates correctly, so `@privy-io/wagmi`'s hooks
//    (which transitively call `useWallets`) never trip on the server
//    pass.
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

type TreeProps = { children: React.ReactNode };

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

function VanillaTree({ children, autoConnect }: TreeProps & { autoConnect: boolean }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        {autoConnect && <MiniPayAutoConnect />}
        <ChainGuard />
        <WalletAnalytics />
        {children}
      </WagmiProvider>
    </QueryClientProvider>
  );
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Synchronous on the client (initializer runs once on mount); false
  // on the server. Combined with the `mounted` gate below this avoids
  // hydration mismatch — both SSR and the first client render output
  // the same vanilla tree.
  const [isMiniPay] = useState(detectMiniPaySync);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The Privy tree is held in state rather than rendered through
  // `next/dynamic`, and that difference is the fix for #221.
  //
  // `dynamic(..., { loading: () => null })` renders `null` while the chunk
  // downloads — and `{children}` is that component's child, so the ENTIRE app
  // tree unmounted for the duration of a network fetch, then remounted under a
  // different provider stack. Any async work already in flight in a child
  // resolved during that window against refs the unmount had nulled, which is
  // exactly what `Cannot read properties of undefined (reading 'current')` is.
  //
  // Whether it landed depended on how fast the chunk resolved relative to the
  // children's effects — a chunk-splitting property. That is why an unrelated
  // postcss bump in #212 flipped it, why it was deterministic per build, and
  // why no source commit correlated with the outage.
  //
  // Resolving the import into state keeps the vanilla tree mounted until the
  // component is in hand, so the swap is one synchronous transition with no
  // interval where children are unmounted. One remount remains — unavoidable
  // while the two trees own different providers — but it is deterministic
  // rather than a race. Removing the remount itself needs a single provider
  // spine; tracked separately.
  const [PrivyTree, setPrivyTree] = useState<React.ComponentType<TreeProps> | null>(null);

  useEffect(() => {
    if (isMiniPay) return;
    let live = true;
    import("./wallet-provider-privy")
      .then((m) => {
        // Wrapped in a thunk: a bare component would be called as a state
        // updater and the tree would never arrive.
        if (live) setPrivyTree(() => m.PrivyTree);
      })
      .catch(() => {
        // Staying on the vanilla tree means no manual connect button, which is
        // a degraded browser experience rather than a blank page.
      });
    return () => {
      live = false;
    };
  }, [isMiniPay]);

  // SSR, first paint, MiniPay, and every render before the chunk lands all
  // render the same tree — so `{children}` mount once and stay mounted.
  if (!mounted || isMiniPay || !PrivyTree) {
    return <VanillaTree autoConnect={mounted && isMiniPay}>{children}</VanillaTree>;
  }

  // Browser, non-MiniPay, chunk in hand. No Privy code ran on the server.
  return <PrivyTree>{children}</PrivyTree>;
}
