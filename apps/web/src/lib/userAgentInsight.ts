/**
 * Parse the bits of a User-Agent that decide whether our bundle can run.
 *
 * #196: MiniPay renders miniapps in the device's Android System WebView,
 * which the user neither updates nor knows about. On a phone whose WebView
 * is still Chrome 80, our chunks fail to *parse* — dependencies ship `||=`
 * and `??=` (Chrome 85+) — so the map never draws.
 *
 * That failure mode is invisible to client analytics by construction: a
 * bundle that dies at parse time never initialises PostHog, so the users
 * who are worst affected are exactly the ones missing from the numbers.
 * The document request, though, happens before any of our JavaScript runs.
 * Reading it server-side is the only way to size the affected population.
 *
 * Pure and dependency-free so it can be unit-tested against real UA strings.
 */

/**
 * Lowest Chromium major our bundle can currently be *parsed* by, set by the
 * syntax our dependencies publish rather than by any product decision —
 * `||=` and `??=` are Chrome 85.
 */
export const KNOWN_PARSEABLE_CHROME_MAJOR = 85

/**
 * Lowest Chromium major we have *decided* to support, settled at Chrome 80
 * in #196.
 *
 * Deliberately a second constant. 85 is what the bundle parses today, 80 is
 * what we intend to serve, and the range between them — engines we promised
 * to support and currently break on — is the remaining work. Collapsing the
 * two into one number would hide exactly the population that matters.
 */
export const SUPPORT_FLOOR_CHROME_MAJOR = 80

export type UserAgentInsight = {
  /** Chromium major version, or null when the UA doesn't advertise one. */
  chromeMajor: number | null
  /** Android WebView embedded in a host app (the `; wv)` token). */
  isAndroidWebView: boolean
  /** Engine too old to parse our current bundle. Null major → unknown, not old. */
  belowKnownFloor: boolean
  /**
   * Engine below the support floor we committed to. Together with
   * `belowKnownFloor` this splits the census three ways: below 80 is out of
   * scope by decision, 80–84 is in scope and broken (the bug), 85+ is fine.
   */
  belowSupportFloor: boolean
}

export function inspectUserAgent(userAgent: string | null | undefined): UserAgentInsight {
  const ua = userAgent ?? ''

  // Chrome/<major> covers Chrome, Android WebView and Chromium-based hosts.
  // Deliberately not matching Edg/ or OPR/, which carry their own numbering
  // on top of a Chromium that the Chrome/ token already reports.
  const match = /Chrome\/(\d+)/.exec(ua)
  const chromeMajor = match ? Number(match[1]) : null

  return {
    chromeMajor,
    isAndroidWebView: /;\s*wv\)/.test(ua),
    belowKnownFloor: chromeMajor !== null && chromeMajor < KNOWN_PARSEABLE_CHROME_MAJOR,
    belowSupportFloor: chromeMajor !== null && chromeMajor < SUPPORT_FLOOR_CHROME_MAJOR,
  }
}

/**
 * What kind of request this is, which decides whether it can stand for a
 * person.
 *
 * This is the difference between counting requests and counting users, and
 * the bias runs the wrong way without it. A client whose bundle dies at parse
 * makes exactly one document request and can never navigate client-side — no
 * hydration, no router, no prefetch. A healthy client hydrates and then issues
 * RSC and prefetch requests on top, and comes back besides. Counting all
 * requests alike therefore *understates* the share of broken engines, which is
 * the one number this census exists to produce.
 *
 * Emitting the kind rather than filtering keeps both readings available: the
 * document-only slice is the per-visit denominator, and the ratio of RSC to
 * document requests is itself a decent proxy for whether clients survive
 * hydration.
 */
export type RequestKind = 'document' | 'rsc' | 'prefetch'

export function classifyRequestKind(
  rscHeader: string | null | undefined,
  prefetchHeader: string | null | undefined,
): RequestKind {
  // A prefetch is also an RSC request, so it has to be tested first.
  if (prefetchHeader) return 'prefetch'
  if (rscHeader) return 'rsc'
  return 'document'
}
