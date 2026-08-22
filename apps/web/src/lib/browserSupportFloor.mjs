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

/**
 * Targets for the SWC pass over dependency code and for the core-js polyfill
 * set: Chrome only. Measured on #253: adding Safari 13.1 / Firefox 74 here
 * grows the shared chunk by ~19 kB gz of conformance polyfills that Chrome 80
 * does not need — paid by every MiniPay device for desktop visitors who are
 * not the product.
 */
export const SUPPORT_TARGETS = { chrome: String(SUPPORT_FLOOR_CHROME_MAJOR) }

/**
 * What `package.json` `browserslist` must equal (a test pins the copy). This
 * drives how Next compiles OUR OWN source. Safari 13.1 and Firefox 74 are
 * desktop insurance at the syntax level only — the oldest releases that parse
 * `?.` / `??` — so our source never ships syntax a desktop visitor cannot
 * parse, while the polyfill set above stays Chrome-sized.
 */
export const BROWSERSLIST = [`chrome >= ${SUPPORT_FLOOR_CHROME_MAJOR}`, 'safari >= 13.1', 'firefox >= 74']
