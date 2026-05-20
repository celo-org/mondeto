// Support-agents event log.
//
// Primary sink: PostHog. Each routed Telegram message becomes one
// `support_message_routed` event keyed by:
//   - distinctId = `tg:<telegram_user_id>`  → groups events per user, so the
//     specialist agent can read recent history with one query.
//   - $insert_id  = `tg-msg-<message_id>`   → PostHog's native idempotency
//     key. Re-processing the same Telegram message won't duplicate the event.
//
// Fallback: if POSTHOG_API_KEY is not set (local dev without keys), the
// entry is appended to a JSONL file on disk. That way the bot still runs
// and you can eyeball routing decisions locally.
//
// Errors go through captureException so they surface in PostHog's error
// tracking dashboard alongside the event stream.

import { appendFile } from 'node:fs/promises'
import { PostHog } from 'posthog-node'

const POSTHOG_KEY = process.env.POSTHOG_API_KEY
const POSTHOG_HOST = process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com'
const LOG_PATH = process.env.LOG_PATH ?? './tickets.jsonl'

const client = POSTHOG_KEY
  ? new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      // Flush every event individually — this is a low-volume bot, and
      // losing routing decisions on an unclean shutdown is worse than
      // the extra HTTP calls.
      flushAt: 1,
      flushInterval: 0,
    })
  : null

if (!client) {
  console.warn(
    `[log] POSTHOG_API_KEY not set — falling back to JSONL at ${LOG_PATH}`,
  )
}

export interface LogEntry {
  ts: string
  telegram_message_id: number
  telegram_user_id: number
  telegram_username?: string
  chat_id: number
  text: string
  category: string
  confidence: number
  reason: string
  draft?: unknown
}

export async function logEntry(entry: Omit<LogEntry, 'ts'>): Promise<void> {
  const full: LogEntry = { ts: new Date().toISOString(), ...entry }

  if (client) {
    client.capture({
      distinctId: `tg:${entry.telegram_user_id}`,
      event: 'support_message_routed',
      properties: {
        $insert_id: `tg-msg-${entry.telegram_message_id}`,
        ...full,
      },
    })
    await client.flush()
    return
  }

  await appendFile(LOG_PATH, JSON.stringify(full) + '\n', 'utf8')
}

export function captureError(
  err: unknown,
  context: { telegram_user_id?: number; telegram_message_id?: number } = {},
): void {
  if (!client) {
    console.error('[log:error]', err, context)
    return
  }
  const distinctId = context.telegram_user_id
    ? `tg:${context.telegram_user_id}`
    : 'support-agents:system'
  client.captureException(err instanceof Error ? err : new Error(String(err)), distinctId, context)
}

export async function shutdown(): Promise<void> {
  await client?.shutdown()
}
