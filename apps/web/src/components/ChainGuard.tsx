"use client";

import { useEffect, useRef } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { celoSepolia } from "viem/chains";

// Test build: the contract v2 test deployment lives on Celo Sepolia.
// Swap this back to `celo` once the v2 contract is redeployed on
// Celo mainnet (and update the address in `lib/maps/contracts.ts`).
const TARGET_CHAIN = celoSepolia;

/**
 * Forces every connected wallet onto Celo mainnet.
 *
 * When a wallet connects on any other chain (including celoSepolia), call
 * wagmi's `switchChain` to prompt the wallet. If the chain isn't already
 * known to the wallet, the underlying `wallet_switchEthereumChain` will
 * fall through to `wallet_addEthereumChain` using the metadata in viem's
 * `celo` definition — so the user gets one "add Celo" prompt and the
 * switch happens in the same flow.
 *
 * The effect only re-fires when the active chain id actually changes,
 * so a user who rejects the prompt isn't spammed.
 */
export function ChainGuard() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const lastPromptedChain = useRef<number | null>(null);

  useEffect(() => {
    if (!isConnected || chainId === undefined) return;
    if (chainId === TARGET_CHAIN.id) {
      lastPromptedChain.current = null;
      return;
    }
    if (isPending) return;
    if (lastPromptedChain.current === chainId) return;

    lastPromptedChain.current = chainId;
    switchChain({ chainId: TARGET_CHAIN.id });
  }, [isConnected, chainId, isPending, switchChain]);

  return null;
}
