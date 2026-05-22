/**
 * Server-side logger that ships to PostHog via OpenTelemetry.
 *
 * Usage (server components, route handlers, middleware, server actions):
 *
 *   import { logger } from '@/lib/logger'
 *   logger.info('pixel purchase confirmed', { tx, buyer, totalCost })
 *   logger.error('forno call failed', { err: String(err) })
 *
 * Records are batched via `BatchLogRecordProcessor` (configured in
 * `instrumentation.ts`) and pushed to PostHog asynchronously. Each call
 * is also mirrored to stdout via `console.*` so local dev and Vercel's
 * runtime log stream still surface the same line.
 *
 * Browser code should NOT import this — the OTel SDK is server-only and
 * the project key lives in a server env var. Use PostHog's browser SDK
 * (`posthog.capture`) for client-side events.
 */

import { logs, SeverityNumber } from '@opentelemetry/api-logs'

type Attributes = Record<string, string | number | boolean | undefined | null>

const LOGGER_NAME = 'mondeto-web'

function emit(
  severityNumber: SeverityNumber,
  severityText: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
  body: string,
  attributes?: Attributes,
) {
  // Mirror to stdout so Vercel's log stream + local dev surface the same line.
  const consoleFn =
    severityText === 'ERROR'
      ? console.error
      : severityText === 'WARN'
        ? console.warn
        : console.log
  consoleFn(`[${severityText}] ${body}`, attributes ?? '')

  try {
    const otelLogger = logs.getLogger(LOGGER_NAME)
    otelLogger.emit({
      severityNumber,
      severityText,
      body,
      attributes: attributes as Record<string, string | number | boolean> | undefined,
    })
  } catch {
    // No-op — if the OTel SDK isn't wired (missing env, edge runtime,
    // browser bundle accidentally importing this), don't crash callers.
  }
}

export const logger = {
  debug(body: string, attributes?: Attributes) {
    emit(SeverityNumber.DEBUG, 'DEBUG', body, attributes)
  },
  info(body: string, attributes?: Attributes) {
    emit(SeverityNumber.INFO, 'INFO', body, attributes)
  },
  warn(body: string, attributes?: Attributes) {
    emit(SeverityNumber.WARN, 'WARN', body, attributes)
  },
  error(body: string, attributes?: Attributes) {
    emit(SeverityNumber.ERROR, 'ERROR', body, attributes)
  },
}
