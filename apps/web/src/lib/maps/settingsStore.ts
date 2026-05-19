/**
 * Operator-controlled settings, persisted to Postgres.
 *
 * Day-one launch has no admin UI — the operator edits the single row of
 * the `settings` table directly from the Vercel dashboard data editor.
 * See `POSTGRES_SETUP.md` for the click-path.
 *
 * Schema is one row keyed by id = 1 holding a JSON blob, so adding new
 * settings later is a non-migrating change.
 */

import { sql } from '@vercel/postgres'

export interface MapSettings {
  /** Operator threshold (USD) for the "open next map" advisory. */
  thresholdUsd: number
  /** Which map ids the operator has flipped on. */
  revealedMapIds: number[]
}

export const DEFAULT_SETTINGS: MapSettings = {
  thresholdUsd: 2,
  revealedMapIds: [0],
}

const SETTINGS_ID = 1

interface SettingsRow {
  data: MapSettings
}

function normalize(raw: unknown): MapSettings {
  // Defensive: pg may return JSON as an object or a string depending on
  // driver/version. Either way we coerce to MapSettings with defaults.
  let parsed: Partial<MapSettings> = {}
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as Partial<MapSettings>
    } catch {
      parsed = {}
    }
  } else if (raw && typeof raw === 'object') {
    parsed = raw as Partial<MapSettings>
  }

  const thresholdUsd =
    typeof parsed.thresholdUsd === 'number' && Number.isFinite(parsed.thresholdUsd)
      ? parsed.thresholdUsd
      : DEFAULT_SETTINGS.thresholdUsd

  const revealedMapIds = Array.isArray(parsed.revealedMapIds)
    ? parsed.revealedMapIds.filter((n): n is number => typeof n === 'number')
    : DEFAULT_SETTINGS.revealedMapIds

  return { thresholdUsd, revealedMapIds }
}

export async function getSettings(): Promise<MapSettings> {
  const { rows } = await sql<SettingsRow>`
    select data
    from settings
    where id = ${SETTINGS_ID}
    limit 1
  `
  if (rows.length === 0) return DEFAULT_SETTINGS
  return normalize(rows[0].data)
}

export async function setSettings(s: MapSettings): Promise<void> {
  const json = JSON.stringify(s)
  await sql`
    insert into settings (id, data)
    values (${SETTINGS_ID}, ${json}::jsonb)
    on conflict (id) do update set data = excluded.data
  `
}
