"use client";

import { useEffect, useRef, useState } from "react";
import { celo } from "viem/chains";

// Force Celo mainnet. The world + continent contracts wired in
// `lib/maps/contracts.ts` are deployed there.
const TARGET_CHAIN = celo;

/** Chains the wallet is allowed to sit on without being prompted. */
function allowedChainIds(): number[] {
  return [celo.id as number];
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

function readEth(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum;
}

async function readWalletChainId(eth: EthereumProvider): Promise<number | null> {
  try {
    const hex = (await eth.request({ method: "eth_chainId" })) as string;
    return parseInt(hex, 16);
  } catch {
    return null;
  }
}

/**
 * Ask the wallet to switch chains. Tries the standard switch first; if the
 * chain isn't known to the wallet (error 4902), falls back to add+switch
 * using viem's chain metadata.
 */
async function requestSwitchChain(eth: EthereumProvider): Promise<void> {
  const hex = `0x${TARGET_CHAIN.id.toString(16)}`;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      const rpcs = TARGET_CHAIN.rpcUrls.default.http;
      const explorerUrl = TARGET_CHAIN.blockExplorers?.default?.url;
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: TARGET_CHAIN.name,
            rpcUrls: rpcs,
            nativeCurrency: TARGET_CHAIN.nativeCurrency,
            blockExplorerUrls: explorerUrl ? [explorerUrl] : [],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

/**
 * Forces every connected wallet onto Celo mainnet.
 *
 * We bypass wagmi's `useSwitchChain` and talk to `window.ethereum`
 * directly. Privy's `WagmiProvider` doesn't reliably propagate
 * switchChain to the external wallet (MetaMask et al.), so the prompt
 * silently never fires and the buyer sits on the wrong chain. Going to
 * the provider directly guarantees `wallet_switchEthereumChain` (with an
 * `addEthereumChain` fallback for code 4902) actually reaches the wallet.
 *
 * The guard polls `eth_chainId` on mount and subscribes to the wallet's
 * `chainChanged` event so it reacts to manual chain changes too. A ref
 * tracks the last chain we prompted on so a rejected switch doesn't loop.
 */
export function ChainGuard() {
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const lastPromptedChain = useRef<number | null>(null);

  useEffect(() => {
    const eth = readEth();
    if (!eth) return;

    let cancelled = false;
    readWalletChainId(eth).then((id) => {
      if (!cancelled) setWalletChainId(id);
    });

    const handler = (chainHex: unknown) => {
      if (typeof chainHex === "string") {
        setWalletChainId(parseInt(chainHex, 16));
      }
    };
    eth.on?.("chainChanged", handler);
    return () => {
      cancelled = true;
      eth.removeListener?.("chainChanged", handler);
    };
  }, []);

  useEffect(() => {
    if (walletChainId === null) return;
    if (allowedChainIds().includes(walletChainId)) {
      lastPromptedChain.current = null;
      return;
    }
    if (isSwitching) return;
    if (lastPromptedChain.current === walletChainId) return;

    const eth = readEth();
    if (!eth) return;

    lastPromptedChain.current = walletChainId;
    setIsSwitching(true);
    requestSwitchChain(eth)
      .catch((err) => {
        console.warn("[chain-guard] switch rejected or failed:", err);
      })
      .finally(() => {
        setIsSwitching(false);
      });
  }, [walletChainId, isSwitching]);

  return null;
}
