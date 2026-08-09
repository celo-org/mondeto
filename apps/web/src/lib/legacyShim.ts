/**
 * Inline shim for JS built-ins that our dependency tree calls but that
 * pre-2021 Chromium does not have.
 *
 * Why this exists: MiniPay renders every miniapp with the *device's*
 * Android System WebView, which is a system component the user neither
 * updates nor knows about. On a Huawei Mate 20 Lite with Play Store and
 * full Google services installed, that engine is still the factory
 * 80.0.3987.99 (Chrome 80, Feb 2020) while the Chrome app on the same
 * phone is 150 — so Mondeto loads in Chrome and shows a bare blue ocean
 * in MiniPay. `Object.hasOwn` (Chrome 93+) throws there, which is enough
 * to stop `fetchAllPixelsFromContract` from ever resolving, so
 * `usePixelMap` never leaves 'loading' and `PixelLayer` never draws.
 *
 * This runs as a blocking inline script in <head> (see `app/layout.tsx`)
 * so it is installed before any Next chunk evaluates. It must therefore
 * stay ES5 — no arrow functions, no const/let, no template literals —
 * and small enough that inlining it costs less than a round trip.
 *
 * Each patch is feature-detected, so modern engines pay nothing but the
 * two `if` checks.
 *
 * The source lives here as a string rather than a module because an
 * inline <script> cannot import. `__tests__/lib/legacyShim.test.ts`
 * evaluates this exact string with the natives deleted and asserts the
 * replacements behave, which is what keeps the escaping honest.
 */
export const LEGACY_SHIM = [
  '(function(){',
  // Object.hasOwn — Chrome 93. Called ~10x across our chunks, including
  // the deep-equality walk that runs on every wagmi/react-query read.
  'if(!Object.hasOwn){Object.defineProperty(Object,"hasOwn",{',
  'value:function(o,k){return Object.prototype.hasOwnProperty.call(Object(o),k)},',
  'configurable:true,writable:true})}',
  // String.prototype.replaceAll — Chrome 85.
  'if(!String.prototype.replaceAll){Object.defineProperty(String.prototype,"replaceAll",{',
  'value:function(search,replacement){',
  'var s=String(this);',
  'if(search!=null&&Object.prototype.toString.call(search)==="[object RegExp]"){',
  'if(!search.global){throw new TypeError("replaceAll must be called with a global RegExp")}',
  'return s.replace(search,replacement)}',
  // Escape the needle and delegate to replace(/…/g) so `$&`-style
  // substitution patterns and function replacers keep native semantics
  // instead of being silently dropped by a split/join shortcut.
  'var n=String(search).replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&");',
  'return s.replace(new RegExp(n,"g"),replacement)},',
  'configurable:true,writable:true})}',
  '})();',
].join('')
