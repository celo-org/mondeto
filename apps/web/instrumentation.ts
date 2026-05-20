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
 *   POSTHOG_OTEL_LOGS_ENDPOINT — full URL, defaults to the EU cloud
 *                                 (`https://eu.i.posthog.com/i/v0/otel/v1/logs`).
 *   POSTHOG_PROJECT_API_KEY    — same project key as NEXT_PUBLIC_POSTHOG_KEY;
 *                                 kept server-only so the bearer token never
 *                                 ships in the client bundle.
 *
 * If either of those is missing we fall back to no-op (logs still print
 * to stdout via the default console). That way local dev without secrets
 * isn't broken.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const apiKey = process.env.POSTHOG_PROJECT_API_KEY
  if (!apiKey) {
    console.warn('[otel] POSTHOG_PROJECT_API_KEY not set — server logs will not ship to PostHog')
    return
  }

  const endpoint =
    process.env.POSTHOG_OTEL_LOGS_ENDPOINT ??
    'https://eu.i.posthog.com/i/v0/otel/v1/logs'

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
