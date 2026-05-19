/**
 * AssignmentStore implementations.
 *
 * - `memoryAssignmentStore` is the test/dev fallback: per-process map.
 * - `getStore()` returns the Postgres-backed store when `POSTGRES_URL` is
 *   present in the environment, otherwise the in-memory store. The rest of
 *   the app should depend on `getStore()`, not on a specific implementation.
 *
 * Both stores are async (see types.ts). The in-memory variant wraps its
 * reads/writes in resolved Promises so callers can `await` either one.
 */

import type { Address, AssignmentStore, MapId } from './types'

const memory = new Map<string, MapId>()

export const memoryAssignmentStore: AssignmentStore = {
  async get(address: Address): Promise<MapId | null> {
    const key = address.toLowerCase()
    return memory.has(key) ? (memory.get(key) as MapId) : null
  },
  async set(address: Address, mapId: MapId): Promise<void> {
    // The in-memory store keeps overwrite semantics so that `migrateUser`
    // (an explicit operator-triggered relocation) works in dev/test. The
    // Postgres store enforces sticky at the SQL layer for day-one launch,
    // where migrate is not exercised. If we want to enable migrate against
    // Postgres, that becomes an explicit UPDATE path on the adapter.
    memory.set(address.toLowerCase(), mapId)
  },
}

/**
 * Test-only escape hatch. Lets the unit tests reset the in-memory store
 * between cases without exposing the underlying Map.
 */
export function __resetMemoryStoreForTests(): void {
  memory.clear()
}

let cachedStore: AssignmentStore | null = null

/**
 * Production factory: Postgres when configured, in-memory otherwise.
 *
 * The Postgres module is imported lazily so test environments that never
 * touch this factory don't have to install `@vercel/postgres` resolution
 * for the in-memory path. The instance is cached per process.
 */
export function getStore(): AssignmentStore {
  if (cachedStore) return cachedStore
  if (typeof process !== 'undefined' && process.env?.POSTGRES_URL) {
    // Lazy require keeps the in-memory path free of Postgres imports.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./postgresStore') as typeof import('./postgresStore')
    cachedStore = mod.postgresAssignmentStore
    return cachedStore
  }
  cachedStore = memoryAssignmentStore
  return cachedStore
}

/** Test-only: forget the cached store so `getStore()` re-decides next call. */
export function __resetStoreCacheForTests(): void {
  cachedStore = null
}
