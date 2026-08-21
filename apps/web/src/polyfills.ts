/**
 * Runtime polyfills for the browser support floor (#225).
 *
 * Syntax is only the first wall. Chrome 80 also lacks `Promise.any` (85),
 * `String.prototype.replaceAll` (85), `Array.prototype.at` (92),
 * `Object.hasOwn` (93), `Error` `cause` (93), `Array.prototype.findLast` (97),
 * `structuredClone` (98) and more, all in ordinary use across the viem /
 * wagmi / noble surface.
 *
 * This single import is the documented core-js entry point. It is NOT what
 * ships: `next.config.mjs` runs SWC's preset-env in `entry` mode over this
 * file, which replaces the line with exactly the `core-js/modules/*` the
 * browserslist target lacks. Raise or lower the floor and the set follows;
 * nobody maintains a list. Imported from `instrumentation-client.ts`, which
 * Next evaluates before any application or dependency code.
 *
 * Next's own `polyfill-module` (Array.prototype.at, Object.hasOwn,
 * URL.canParse, …) runs later and is guarded, so the overlap costs nothing
 * at runtime. Two APIs from the #225 list are outside core-js entirely:
 * `crypto.randomUUID` (92) and `AbortSignal.timeout` (103). They are not
 * polyfilled here; see apps/web/CLAUDE.md, "Browser support floor".
 */
import 'core-js/stable'
