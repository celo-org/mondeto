'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'
import { useEffect } from 'react'

/**
 * Manually capture pageviews for the App Router. PostHog's default
 * autocapture pageview hook is tied to history events and misses
 * App Router transitions; this component fires on every path /
 * query-string change.
 */
export function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = usePostHog()

  useEffect(() => {
    if (!pathname || !posthog) return
    let url = window.origin + pathname
    const qs = searchParams?.toString()
    if (qs) url += '?' + qs
    posthog.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams, posthog])

  return null
}
