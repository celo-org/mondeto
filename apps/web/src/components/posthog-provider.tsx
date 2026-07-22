'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'
import { registerCampaignParams, registerPlatform, track } from '@/lib/analytics'

// Fire `app_opened` at most once per browser session (not per route change)
// so it works as a top-of-funnel denominator without inflating with every
// client-side navigation. sessionStorage is cleared when the tab closes.
const SESSION_OPEN_KEY = 'mondeto-session-open'

function trackSessionOpen() {
  try {
    if (sessionStorage.getItem(SESSION_OPEN_KEY)) return
    sessionStorage.setItem(SESSION_OPEN_KEY, '1')
  } catch {
    // sessionStorage unavailable (private mode) — fall through and fire once
    // per mount rather than dropping the signal entirely.
  }
  const isMiniPay = !!(window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay
  track('app_opened', { isMiniPay })
}

/**
 * PostHog client provider for the Next.js App Router.
 *
 * Tuned for a cost-controlled launch: we capture pageviews (for Web
 * analytics) plus the custom funnel events we emit ourselves
 * (wallet_connected, pixel_buy_*, …). The genuinely volume-multiplying
 * defaults — autocapture (an event per click/input), session replay,
 * heatmaps, dead/rage clicks, web vitals — stay OFF. Autocapture on the
 * map UI is what drove event costs up, so it is the one that must not
 * come back; pageviews fire ~once per navigation and are cheap.
 *
 * If the env var is missing (e.g. local dev without a key set), init is
 * a no-op and the app still renders normally.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return

    posthog.init(key, {
      // Reverse-proxied through our own origin (see next.config.js rewrites)
      // so adblockers and privacy extensions don't drop the requests.
      api_host: '/ingest',
      // The real PostHog host (US cloud — company org) — used for
      // "View on PostHog" links from the toolbar and asset CDN hints.
      ui_host: 'https://us.posthog.com',
      // Only create a person profile once we identify() — profiles exist
      // for connected wallets only, never for anonymous visitors.
      person_profiles: 'identified_only',
      // The privacy policy states we don't use cookies or localStorage
      // for tracking — memory persistence keeps that true. Anonymous
      // visitors get a fresh id per visit (we don't care); identified
      // users are keyed by wallet address, which is stable by itself.
      persistence: 'memory',
      // Pageviews power PostHog Web analytics (visitors, sessions, entry/exit
      // pages, referrers). 'history_change' captures the initial load AND
      // client-side App Router navigations — plain `true` would miss SPA soft
      // navigations. Low volume: one event per navigation, not per click.
      capture_pageview: 'history_change',
      // Pageleave enables bounce rate + session duration in Web analytics.
      capture_pageleave: true,
      // Autocapture would emit an event per click/input — the map UI
      // generates thousands per session and is what spiked our bill. Our
      // custom funnel events + pageviews cover what we need; keep it OFF.
      autocapture: false,
      disable_session_recording: true,
      capture_dead_clicks: false,
      rageclick: false,
      enable_heatmaps: false,
      capture_performance: false,
      // Keep unhandled error / promise rejection capture — low volume,
      // high signal.
      capture_exceptions: true,
    })

    // Attach utm_* from the landing URL to every event as memory-only
    // super-properties (cleared on reload — no cookies/localStorage).
    registerCampaignParams()

    // Attach isMiniPay to every event so the funnel can be segmented
    // MiniPay vs desktop (the same 104-person top-of-funnel otherwise mixes
    // both surfaces).
    registerPlatform()

    // Deduped top-of-funnel signal: one event per session (pageviews fire
    // per navigation) gives a stable DAU/MAU denominator for buy-conversion.
    trackSessionOpen()
  }, [])

  return <PHProvider client={posthog}>{children}</PHProvider>
}
