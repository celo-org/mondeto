"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { http, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { celo, celoSepolia } from "viem/chains";

const wagmiConfig = createConfig({
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
    if (typeof window !== "undefined" && window.ethereum && (window.ethereum as any).isMiniPay) {
      const injected = connectors.find((c) => c.id === "injected");
      if (injected) {
        connect({ connector: injected });
      }
    }
  }, [connect, connectors]);

  return <>{children}</>;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId="cmmxiatqc01fa0cjv4eg3b9kp"
      config={{
        defaultChain: celo,
        supportedChains: [celo, celoSepolia],
        appearance: {
          theme: "dark",
          accentColor: "#00ff41",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <MiniPayAutoConnect>{children}</MiniPayAutoConnect>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
