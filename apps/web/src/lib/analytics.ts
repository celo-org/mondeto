'use client'

import posthog from 'posthog-js'

/**
 * Thin wrapper around PostHog for the browser.
 *
 * All product analytics go through here so the event schema stays in one
 * place. The event set is deliberately tiny and funnel-tied — volume
 * scales with buyers, not visitors (see posthog-provider.tsx for why).
 *
 * Event schema (this comment is the single source of truth — keep it in
 * sync when adding or changing an event):
 *   app_opened                { isMiniPay }                          once per session (top-of-funnel denominator)
 *   wallet_connected          { isMiniPay, chainId }
 *   referral_landed           { ref, mapId? }
 *   intro_completed           { lastSlideIndex }
 *   map_switched              { fromMapId, toMapId }
 *   map_view_toggled          { view }                               heatmap / myland / deals / normal
 *   leaderboard_viewed        { board, scope, mapId }
 *   pixel_info_viewed         { pixelId, owned }
 *   profile_saved             { hasUrl }                             fires when the updateProfile tx confirms
 *   profile_save_failed       { reason }                             reason is the raw error, truncated to 100 chars
 *   share_clicked             { kind, platform, mapId }               kind: positions|rank|invite|reward; platform: twitter|telegram|whatsapp|clipboard
 *   reward_viewed             { campaignId, amountUsd }               the "you won $X" announcement was shown
 *   support_form_opened       {}
 *   activity_feed_shown       { mapId, batchId }                     a live-purchase toast was surfaced (fires per toast, not per session)
 *   buy_blocked_not_connected { pixelCount }                         selected pixels while signed out
 *   checkout_opened           { mapId, pixelCount, totalPriceUsd }   review drawer opened (buy intent)
 *   checkout_insufficient_funds { mapId, needUsd, balanceUsd, token, pixelCount }  drawer showed "NOT ENOUGH FUNDS"
 *   checkout_split_currency_blocked { mapId, needUsd, balanceUsd, token, pixelCount, totalUsd }  enough across coins, blocked by one-currency-per-buy rule
 *   checkout_dismissed        { reason, mapId, pixelCount, totalPriceUsd, step }  left the drawer without buying (reason: cleared|closed)
 *   topup_clicked             { mapId, shortfallUsd, token }         insufficient-funds wall
 *   pixel_buy_blocked         { mapId, pixelCount, totalPriceUsd, reason, ref? }  stopped by our own guard BEFORE the wallet opened — see below. reason: chain_switch_rejected|chain_switch_failed|no_stablecoin_balance|over_spend_cap
 *   pixel_buy_started         { mapId, pixelCount, totalPriceUsd, token, ref? }
 *   pixel_buy_approve_shown   { mapId, pixelCount, totalPriceUsd, token, ref? }
 *   pixel_buy_gas_fallback    { mapId, pixelCount, totalPriceUsd, token, stage, level, detail, ref? }  stage: approve|buy; level: without_fee_currency|ceiling
 *   pixel_buy_over_cap        { mapId, pixelCount, totalPriceUsd, token, reason, ref? }  live price tipped the buy past the $10 cap after it was picked
 *   pixel_buy_succeeded       { mapId, pixelCount, totalPriceUsd, token, txHash, ref? }
 *   pixel_buy_rejected        { mapId, pixelCount, totalPriceUsd, token, ref? }   user declined the wallet prompt (silent, no error shown)
 *   pixel_buy_failed          { mapId, pixelCount, totalPriceUsd, token, reason, category, detail, ref? }
 *
 * On the buy funnel's arithmetic: `pixel_buy_blocked` fires *before*
 * `pixel_buy_started` and carries no `token`, because one of its reasons is
 * "no stablecoin at all". So a blocked buy is never counted as a started one
 * and never produces a `pixel_buy_failed` — do not add it to a failure rate
 * whose denominator is `pixel_buy_started`; sum it separately. Everything from
 * `pixel_buy_started` onward is a real attempt and nests normally.
 *
 * On `pixel_buy_failed`: `reason` is the player-facing line and changes with
 * copy edits — segment on `category` (see BuyErrorCategory in lib/buyErrors.ts),
 * which is stable by contract. `detail` is the unwrapped raw error truncated to
 * 100 chars, kept so a growing `unknown` category can be read rather than
 * guessed at.
 *
 * `pixel_buy_gas_fallback` is not a failure — the buy usually still goes out.
 * It marks a buy that had to drop to a cruder gas estimate, which is the tell
 * for the MiniPay CIP-64 hazard (a gas-less send makes MiniPay answer
 * "permission denied"). Count `level: 'without_fee_currency'` to size the
 * affected buys: `'ceiling'` is nested inside that retry's catch and is always
 * preceded by one, so it is a strict subset — summing raw events overstates by
 * roughly 2x, and up to 4x across both stages.
 *
 * `utm_*` params from the landing URL, plus `isMiniPay`, are attached to
 * every event as super-properties (via registerCampaignParams() and
 * registerPlatform() below) so any event can be segmented MiniPay vs desktop.
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

// --- Platform attribution -------------------------------------------------

// Register `isMiniPay` as a super-property so every event (checkout_*,
// pixel_buy_*, etc.) can be segmented MiniPay vs desktop. MiniPay injects
// `window.ethereum.isMiniPay` synchronously before the app loads, so this
// is stable to read once at init. Memory-only persistence keeps it within
// the privacy policy's no-tracking-storage promise, same as the utm_* set.
export function registerPlatform(): void {
  if (typeof window === 'undefined') return
  const isMiniPay = !!(window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay
  withPosthog(() => posthog.register({ isMiniPay }))
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

// --- Campaign attribution -------------------------------------------------

// utm_* params from the landing URL, registered as PostHog super-properties
// so every subsequent event (including a later buy) carries them. With
// `persistence: 'memory'` (see posthog-provider.tsx) these live only for the
// current page session — nothing is written to cookies or localStorage, so
// this stays within the privacy policy's §6 "no tracking storage" promise.
const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

export function registerCampaignParams(): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const found: Record<string, string> = {}
  for (const key of UTM_PARAMS) {
    const value = params.get(key)
    if (value) found[key] = value
  }
  if (Object.keys(found).length > 0) {
    withPosthog(() => posthog.register(found))
  }
}
