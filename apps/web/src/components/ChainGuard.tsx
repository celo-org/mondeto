"use client";

import { useEffect, useRef, useState } from "react";
import { useSwitchChain } from "wagmi";
import { celoSepolia } from "viem/chains";

// Test build: the contract v2 test deployment lives on Celo Sepolia.
// Swap this back to `celo` once the v2 contract is redeployed on Celo
// mainnet (and update the address in `lib/maps/contracts.ts`).
const TARGET_CHAIN = celoSepolia;

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
 * Forces every connected wallet onto the target chain.
 *
 * We read the chain id **directly from `window.ethereum`** instead of from
 * `useAccount().chainId`. Privy's wagmi integration reports its own
 * configured chain even when the user's external wallet (MetaMask, Rabby,
 * etc.) is sitting on a different one, which silently masks the mismatch
 * and lets a buyer submit a tx that the wallet then refuses to sign.
 *
 * If the wallet's chain doesn't match the target, we call wagmi's
 * `switchChain` to fire the standard `wallet_switchEthereumChain` /
 * `wallet_addEthereumChain` flow. A ref tracks the last chain we prompted
 * on so a rejected switch doesn't loop. We also listen for the wallet's
 * `chainChanged` event so the guard reacts to manual chain changes too.
 */
export function ChainGuard() {
  const { switchChain, isPending } = useSwitchChain();
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const lastPromptedChain = useRef<number | null>(null);

  // Poll once on mount and subscribe to chainChanged. Polling on mount
  // covers the case where the user is already connected when the page
  // loads (no chainChanged event will fire in that case).
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
    if (walletChainId === TARGET_CHAIN.id) {
      lastPromptedChain.current = null;
      return;
    }
    if (isPending) return;
    if (lastPromptedChain.current === walletChainId) return;

    lastPromptedChain.current = walletChainId;
    switchChain({ chainId: TARGET_CHAIN.id });
  }, [walletChainId, isPending, switchChain]);

  return null;
}
