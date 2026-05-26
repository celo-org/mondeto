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

## /dev routes

Pages under `src/app/dev/*` are gated by `src/app/dev/layout.tsx`, which
calls `notFound()` when `VERCEL_ENV === 'production'`. Staging and PR
preview deployments still expose them, so design previews and ad-hoc
contract tooling can ship through the normal branch flow without leaking
to the prod URL.
