/**
 * The browser support floor, as a Chromium major version.
 *
 * Decided on #196: MiniPay renders miniapps in the device's Android System
 * WebView, and on the mid/low-end handsets in the markets MiniPay serves that
 * engine is a factory build that never updates. The reproducing device runs
 * Chromium 80 (February 2020). Anything above 80 writes off exactly the
 * population the product exists for.
 *
 * This is a plain ES module rather than TypeScript because three consumers
 * outside the bundle need the number: `next.config.mjs` (the SWC target for
 * dependency code), `scripts/check-syntax-floor.mjs` (the post-build guard)
 * and `src/lib/userAgentInsight.ts` (the server-side census). The production
 * `browserslist` in `package.json` cannot import it, so a test pins that copy
 * to this one.
 *
 * Distinct from `KNOWN_PARSEABLE_CHROME_MAJOR` in `userAgentInsight.ts` on
 * purpose: that is what the bundle happened to parse on before the down-level
 * pass existed; this is what we promise. See the note there.
 */
export const SUPPORT_FLOOR_CHROME_MAJOR = 80
