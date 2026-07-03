// Central funnel + attribution events. Browser-only (posthog-js), per the
// logging convention: PostHog `capture` for anything that needs measuring,
// console for anything that only needs devtools.
//
// Every event name lives in this union so dashboards never chase typos.
// `track` is a safe no-op until PostHog is initialized (no key in dev).

import posthog from 'posthog-js'

export type AnalyticsEvent =
  // acquisition / identity
  | 'wallet_connected'
  // buy funnel (source of truth for conversion + revenue dashboards)
  | 'buy_started'
  | 'buy_approve_shown'
  | 'buy_confirmed'
  | 'buy_failed'
  // engagement surfaces
  | 'pixel_info_viewed'
  | 'leaderboard_viewed'
  | 'map_switched'
  | 'map_view_toggled'
  | 'intro_completed'

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof window === 'undefined' || !posthog.__loaded) return
  posthog.capture(event, props)
}

// ---------------------------------------------------------------------------
// Acquisition attribution — first-touch `ref` / `utm_*` params, persisted and
// registered as super-properties so a buy days after the click still carries
// its source. First touch wins: a stored attribution is never overwritten.
// ---------------------------------------------------------------------------

const ATTRIBUTION_KEY = 'mondeto-attribution'
const ATTRIBUTION_PARAMS = [
  'ref',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

export function registerAttribution(): void {
  if (typeof window === 'undefined' || !posthog.__loaded) return
  try {
    let stored: Record<string, string> | null = null
    const raw = window.localStorage.getItem(ATTRIBUTION_KEY)
    if (raw) stored = JSON.parse(raw) as Record<string, string>

    if (!stored) {
      const params = new URLSearchParams(window.location.search)
      const found: Record<string, string> = {}
      for (const key of ATTRIBUTION_PARAMS) {
        const value = params.get(key)
        if (value) found[key] = value
      }
      if (Object.keys(found).length > 0) {
        found.landed_at = new Date().toISOString()
        window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(found))
        stored = found
      }
    }

    if (stored) posthog.register(stored)
  } catch (err) {
    console.warn('attribution registration skipped:', err)
  }
}

// First-buy flag for `buy_confirmed { isFirstBuy }` — activation metric.
const HAS_BOUGHT_KEY = 'mondeto-has-bought'

export function hasBoughtBefore(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(HAS_BOUGHT_KEY) === '1'
  } catch {
    return false
  }
}

export function markHasBought(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HAS_BOUGHT_KEY, '1')
  } catch {
    // storage unavailable — flag is best-effort
  }
}
