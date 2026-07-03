'use client'

import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import posthog from 'posthog-js'
import { track } from '@/lib/analytics'

/**
 * Ties the PostHog person to the connected wallet. Must render inside
 * WalletProvider (needs wagmi context) — PostHog itself is a module-level
 * singleton, so provider order otherwise doesn't matter.
 *
 * `person_profiles: 'identified_only'` in the provider means this call is
 * what creates the person, so retention/funnel dashboards key on address.
 */
export function AnalyticsIdentify() {
  const { address, isConnected } = useAccount()
  const lastIdentified = useRef<string | null>(null)

  useEffect(() => {
    if (!isConnected || !address || !posthog.__loaded) return
    if (lastIdentified.current === address) return
    lastIdentified.current = address

    posthog.identify(address)
    track('wallet_connected', {
      isMiniPay: Boolean(
        (window as { ethereum?: { isMiniPay?: boolean } }).ethereum?.isMiniPay,
      ),
    })
  }, [address, isConnected])

  return null
}
