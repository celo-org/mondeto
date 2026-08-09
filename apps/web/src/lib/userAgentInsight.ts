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
 * Lowest Chromium major we are known to run on today, set by the syntax our
 * dependencies publish rather than by a product decision — `||=` and `??=`
 * are Chrome 85. The support floor is still open in #196; when it is
 * settled this constant should follow it, not the other way round.
 */
export const KNOWN_PARSEABLE_CHROME_MAJOR = 85

export type UserAgentInsight = {
  /** Chromium major version, or null when the UA doesn't advertise one. */
  chromeMajor: number | null
  /** Android WebView embedded in a host app (the `; wv)` token). */
  isAndroidWebView: boolean
  /** Engine too old to parse our current bundle. Null major → unknown, not old. */
  belowKnownFloor: boolean
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
  }
}
