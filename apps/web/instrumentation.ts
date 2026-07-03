/**
 * Next.js instrumentation hook — runs once when the server boots.
 *
 * Sets up an OpenTelemetry logger that ships server-side logs to PostHog
 * via OTLP HTTP. PostHog's logs endpoint accepts the standard OTel logs
 * payload, so the same wire format that any OTel collector understands
 * works here. Server-only — the runtime gate keeps the OTel SDK out of
 * the edge bundle and the browser.
 *
 * Env vars (see .env.template):
 *   NEXT_PUBLIC_POSTHOG_KEY     — same key the browser SDK uses. PostHog
 *                                  project keys are public by design (they
 *                                  already ship inside the client bundle),
 *                                  so there's no security benefit to a
 *                                  separate server-only copy.
 *   POSTHOG_OTEL_LOGS_ENDPOINT — full URL, defaults to the US cloud
 *                                  (`https://us.i.posthog.com/i/v0/otel/v1/logs`).
 *
 * If the key is missing we fall back to no-op so local dev without
 * secrets isn't broken.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!apiKey) {
    console.warn('[otel] NEXT_PUBLIC_POSTHOG_KEY not set — server logs will not ship to PostHog')
    return
  }

  const endpoint =
    process.env.POSTHOG_OTEL_LOGS_ENDPOINT ??
    'https://us.i.posthog.com/i/v0/otel/v1/logs'

  const { logs } = await import('@opentelemetry/api-logs')
  const { LoggerProvider, BatchLogRecordProcessor } = await import(
    '@opentelemetry/sdk-logs'
  )
  const { OTLPLogExporter } = await import(
    '@opentelemetry/exporter-logs-otlp-http'
  )
  const { resourceFromAttributes } = await import('@opentelemetry/resources')

  const resource = resourceFromAttributes({
    'service.name': 'mondeto-web',
    'service.namespace': 'mondeto',
    'deployment.environment':
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  })

  const exporter = new OTLPLogExporter({
    url: endpoint,
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  const provider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(exporter)],
  })

  logs.setGlobalLoggerProvider(provider)

  console.log(`[otel] PostHog log exporter wired to ${endpoint}`)
}
