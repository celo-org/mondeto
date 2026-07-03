'use client'

import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { identifyWallet, track } from '@/lib/analytics'

/**
 * Identifies the PostHog person and emits `wallet_connected` once per
 * connected address. Mounted in both wallet trees (vanilla/MiniPay and
 * Privy) next to ChainGuard, so every connect path is covered.
 */
export function WalletAnalytics() {
  const { address, isConnected, chainId } = useAccount()
  const lastIdentified = useRef<string | null>(null)

  useEffect(() => {
    if (!isConnected || !address) return
    const addr = address.toLowerCase()
    if (lastIdentified.current === addr) return
    lastIdentified.current = addr

    identifyWallet(addr)
    track('wallet_connected', {
      isMiniPay: !!(window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay,
      chainId,
    })
  }, [isConnected, address, chainId])

  return null
}
