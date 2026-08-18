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
 *
 * **How this was derived, so it can be re-derived:** by reading the published
 * source of our dependencies during the #196 investigation and finding the
 * newest syntax they ship. `||=` / `??=` (Chrome 85) was the *lowest* new
 * syntax found — not provably the highest. Class static blocks are Chrome 94,
 * top-level `await` 89, `Object.hasOwn` 93, so a dependency bump can raise the
 * real parse floor above this constant while it stays put, turning
 * `belowKnownFloor: false` into a false negative for exactly the population
 * being measured. Renovate bumps dependencies here continuously, so re-derive
 * this rather than trusting it; a syntax check over the built chunks would
 * turn it from remembered into asserted.
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

/**
 * Non-human clients, which land in *both* halves of the ratio and pull it in
 * opposite directions.
 *
 * Numerator: pinned-old-Chrome UAs are ubiquitous among scrapers and uptime
 * checks — `Chrome/41.0.2228.0` is the classic old-Googlebot spoof and is
 * still shipped by a lot of tooling. In the log it is indistinguishable from
 * a genuinely broken handset.
 *
 * Denominator: the public share route is unfurled by Twitterbot,
 * `facebookexternalhit`, WhatsApp, Slack and Discord on every share. Those
 * render a page, so they log, and mostly carry no `Chrome/` token. Given how
 * much traffic arrives through sharing, the non-human share of the
 * denominator is not marginal.
 *
 * Kept as a field rather than a filter so the denominator stays correctable
 * after the fact.
 */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|facebookexternalhit|whatsapp|telegram|applebot|yandex/i

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
  /** Crawler, unfurler or monitor. See BOT_PATTERN for why this matters. */
  isLikelyBot: boolean
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
    isLikelyBot: BOT_PATTERN.test(ua),
  }
}

/**
 * Whether the raw UA string is worth keeping on this record.
 *
 * The raw string is what lets us re-parse when we find a device shape the
 * parser mishandles, so it earns its place for the population under
 * investigation. For the healthy majority the three parsed fields already say
 * everything, and the string is both bytes we don't need and personal data we
 * don't need to hold.
 */
export function shouldRetainRawUserAgent(insight: UserAgentInsight): boolean {
  return insight.chromeMajor === null || insight.belowKnownFloor || insight.isAndroidWebView
}

/**
 * What kind of request this is.
 *
 * **This is expected to read `document` for essentially every record today,
 * and that is the point.** It is a tripwire, not a correction.
 *
 * The root layout is not re-entered on soft navigations in this app, so
 * healthy clients do not in fact generate extra log lines by moving around:
 * `walkTreeWithFlightRouterState` only calls `createComponentTree` when the
 * client sent no state tree, the segment mismatches, the level is a leaf, or
 * the state is `refetch` — none of which hold at the root during a soft
 * navigation. Prefetches short-circuit earlier still, because there is no
 * `loading.tsx` anywhere in this app and PPR is off. The two remaining ways
 * back into the root layout, `router.refresh()` and server actions, are both
 * absent from `src/`.
 *
 * So it earns its place as insurance rather than as a fix. The moment someone
 * adds a `loading.tsx`, calls `router.refresh()` or turns on PPR, RSC renders
 * start entering the denominator silently — and this field is what makes that
 * visible instead of quietly skewing the census.
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
