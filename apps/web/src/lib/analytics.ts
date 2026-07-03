'use client'

import posthog from 'posthog-js'

/**
 * Thin wrapper around PostHog for the browser.
 *
 * All product analytics go through here so the event schema stays in one
 * place. The event set is deliberately tiny and funnel-tied — volume
 * scales with buyers, not visitors (see posthog-provider.tsx for why).
 *
 * Event schema:
 *   wallet_connected      { isMiniPay, chainId }
 *   pixel_buy_started     { mapId, pixelCount, totalPriceUsd, token, ref? }
 *   pixel_buy_succeeded   { mapId, pixelCount, totalPriceUsd, token, txHash, ref? }
 *   pixel_buy_failed      { mapId, pixelCount, totalPriceUsd, token, reason, ref? }
 *   map_switched          { fromMapId, toMapId }
 *   referral_landed       { ref, mapId? }
 *   invite_shared         { mapId }
 *   support_form_opened   {}
 */

// PostHog init happens in a parent effect, which React runs AFTER child
// effects on first mount — so early calls (e.g. MiniPay auto-connect)
// retry briefly instead of being dropped. If no key is configured init
// never happens and the retries drain silently.
function withPosthog(fn: () => void, attempts = 10): void {
  if (posthog.__loaded) {
    fn()
    return
  }
  if (attempts <= 0) return
  setTimeout(() => withPosthog(fn, attempts - 1), 300)
}

export function track(event: string, properties?: Record<string, unknown>): void {
  withPosthog(() => posthog.capture(event, properties))
}

/** Tie the PostHog person to the connected wallet. With
 *  `person_profiles: 'identified_only'` this is the only path that
 *  creates a person profile — anonymous visitors never get one. */
export function identifyWallet(address: string): void {
  withPosthog(() => posthog.identify(address.toLowerCase()))
}

// --- Referral attribution -------------------------------------------------

// sessionStorage (not localStorage): attribution shouldn't outlive the
// visit — the privacy policy promises no persistent client-side tracking
// state, and session-scoped is enough to attribute a same-visit buy.
const REF_KEY = 'mondeto-ref'

export function storeReferrer(ref: string): void {
  try {
    sessionStorage.setItem(REF_KEY, ref)
  } catch {}
}

export function getReferrer(): string | null {
  try {
    return sessionStorage.getItem(REF_KEY)
  } catch {
    return null
  }
}
