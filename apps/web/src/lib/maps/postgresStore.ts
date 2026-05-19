/**
 * Postgres-backed AssignmentStore.
 *
 * Provisioned via the Vercel Marketplace (Neon). The connection is
 * configured by the `POSTGRES_URL` env var that Vercel populates on the
 * project automatically — see `POSTGRES_SETUP.md`.
 *
 * Sticky semantics: once a wallet has been written, the row never gets
 * overwritten by `set()`. The launch model is "one home map per wallet,
 * forever" so we encode that at the SQL layer with INSERT ON CONFLICT
 * DO NOTHING. Re-assigning a player is therefore a deliberate operation
 * (an explicit UPDATE outside this store, e.g. via the Vercel data editor).
 *
 * Address normalization: callers may pass any casing. We lowercase on the
 * way in and on the way out so that the row key matches the rest of the
 * codebase, which lowercases too.
 */

import { sql } from '@vercel/postgres'
import type { Address, AssignmentStore, MapId } from './types'

interface AssignmentRow {
  map_id: number
}

export const postgresAssignmentStore: AssignmentStore = {
  async get(address: Address): Promise<MapId | null> {
    const key = address.toLowerCase()
    const { rows } = await sql<AssignmentRow>`
      select map_id
      from assignments
      where address = ${key}
      limit 1
    `
    if (rows.length === 0) return null
    return rows[0].map_id as MapId
  },

  async set(address: Address, mapId: MapId): Promise<void> {
    const key = address.toLowerCase()
    // Sticky: never overwrite an existing assignment.
    await sql`
      insert into assignments (address, map_id)
      values (${key}, ${mapId})
      on conflict (address) do nothing
    `
  },
}
