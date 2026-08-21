# Mondeto web app — conventions

## Logging

We use OpenTelemetry → PostHog for server-side logs. The browser ships
metrics + events through PostHog directly. The rule is "no bare debug
logs in committed code."

### Server (route handlers, server components, instrumentation, server actions)

Use `lib/logger.ts`:

```ts
import { logger } from '@/lib/logger'

logger.info('pixel purchase confirmed', { tx, buyer, totalCost })
logger.warn('forno read fell back to cache', { mapId })
logger.error('failed to settle buy', { err: String(err), ids })
```

The logger mirrors to stdout (so Vercel's log stream catches it) and emits
an OTel log record to PostHog asynchronously. Attribute values must be
primitives — stringify objects before passing them.

Do **not** import `lib/logger.ts` from browser code. The OpenTelemetry SDK
isn't bundle-safe and the OTLP endpoint key lives in a server env var.

### Browser (client components, hooks, `'use client'` files)

- `console.error(...)` — actionable failures the user or on-call would
  care about. Include enough context that a Sentry-style grep would find
  the call site.
- `console.warn(...)` — recoverable problems and degraded paths
  (fallback used, retry succeeded, optional data missing).
- **No** `console.log` / `console.debug` in committed code. They're fine
  while developing — strip them before opening a PR.

For things that need to be captured (not just displayed in devtools), use
PostHog's browser SDK:

```ts
import posthog from 'posthog-js'
posthog.capture('pixel_buy_started', { mapId, pixelCount })
```

### Why not a unified browser logger?

OTel's browser bundle adds ~70KB gz and our existing analytics already
ships through PostHog. Splitting "send to analytics" (PostHog `capture`)
from "show in devtools" (`console.warn/error`) is cheaper than
maintaining a custom client logger that has to wrap both.

## Browser support floor

**Chromium 80.** Decided on #196: MiniPay renders miniapps in the device's
Android System WebView, which on the mid/low-end handsets in the markets
MiniPay serves is a factory build that never updates and cannot be updated
by the user. The reproducing device on #196 runs WebView 80 (February
2020). Any engine older than that is out of scope by decision; anything from
80 up must parse and run the bundle.

The floor has zero headroom: optional chaining and `??` are Chrome 80
exactly, logical assignment (`||=`, `??=`) is 85, private methods are 84.
A single occurrence above the floor is a `SyntaxError` that kills the whole
chunk at parse time — nothing inside it runs, including analytics, so the
only signal is a support report (#196, #225).

The number lives in one place, `src/lib/browserSupportFloor.mjs`
(`SUPPORT_FLOOR_CHROME_MAJOR`). Three things are derived from it; a test
(`src/__tests__/scripts/checkSyntaxFloor.test.ts`) pins the copies that
cannot import it:

1. **Dependency syntax** — `next.config.mjs` runs SWC
   (`scripts/downlevel-loader.cjs`) over every `node_modules` script in the
   client bundle with the floor as target. Next down-levels our own source
   but ships dependencies as published, and viem, `@noble/hashes`,
   `@wagmi/connectors` and `@tanstack/query-core` publish syntax above the
   floor. A blanket pass, not `transpilePackages` — that matches only the
   named package, never its dependencies, and the failing code arrives
   transitively. Server bundle untouched.
2. **Runtime APIs** — `src/polyfills.ts` imports `core-js/stable`; SWC's
   preset-env in entry mode replaces it with the core-js modules the
   `browserslist` in `package.json` (`chrome >= 80`) lacks. Loaded from
   `src/instrumentation-client.ts`, which runs before any app code. Not
   covered by core-js, and not polyfilled: `crypto.randomUUID` (92) and
   `AbortSignal.timeout` (103) — grep the built chunks before relying on
   either.
3. **The guard** — `scripts/check-syntax-floor.mjs` parses every emitted
   `.next/static/**/*.js` with acorn and fails `pnpm --filter web build`
   on any syntax above the floor, naming the file, feature and position. A
   parser rather than a grep because minified chunks carry arbitrary text.
   The feature → first-Chrome-major table is in the script; moving the
   floor moves the verdicts.

When the guard goes red after a dependency bump, the dependency shipped
syntax the SWC pass does not cover. Reproduce from a build:

```sh
pnpm --filter web build                              # fails with file:line:col
node apps/web/scripts/check-syntax-floor.mjs apps/web/.next/static
grep -oE '\?\?=|\|\|=|&&=' apps/web/.next/static/chunks/*.js | wc -l   # quick, regex, 0 expected
```

Do not fix a red guard by allow-listing the file or lowering the table —
fix the transform, or raise the floor explicitly in
`browserSupportFloor.mjs` with a product decision behind it. Verification
on a real device at the floor is still the only proof that the map draws;
the guard proves the bundle parses.

## /dev routes

Pages under `src/app/dev/*` are gated by `src/app/dev/layout.tsx`, which
calls `notFound()` when `VERCEL_ENV === 'production'`. Staging and PR
preview deployments still expose them, so design previews and ad-hoc
contract tooling can ship through the normal branch flow without leaking
to the prod URL.
