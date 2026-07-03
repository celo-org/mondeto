'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { Suspense, useEffect } from 'react'
import { PostHogPageView } from './posthog-pageview'
import { registerAttribution } from '@/lib/analytics'

/**
 * PostHog client provider for the Next.js App Router.
 *
 * Configures product analytics, autocaptured pageviews, session replay,
 * client-side error tracking, and feature flags in one place. If the
 * env vars are missing (e.g. local dev without a key set), init is a
 * no-op and the app still renders normally.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return

    posthog.init(key, {
      // Reverse-proxied through our own origin (see next.config.js rewrites)
      // so adblockers and privacy extensions don't drop the requests.
      api_host: '/ingest',
      // The real PostHog host — used for "View on PostHog" links from the
      // toolbar, asset CDN hints, and the recording-replay viewer.
      ui_host: 'https://eu.posthog.com',
      // Only create a person profile once we identify() — keeps the free tier
      // event volume sane and respects users we never identify.
      person_profiles: 'identified_only',
      // App Router needs manual pageview capture (see PostHogPageView).
      capture_pageview: false,
      capture_pageleave: true,
      // PostHog's built-in unhandled error / promise rejection capture.
      capture_exceptions: true,
    })

    // First-touch ref/utm super-properties, so every later event (including
    // a buy days after the click) stays attributed to its source.
    registerAttribution()
  }, [])

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  )
}
