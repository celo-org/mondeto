/**
 * In-memory AssignmentStore.
 *
 * Placeholder for the launch Postgres-backed store. The map module's pure
 * logic is unchanged — the partner team wires the Postgres adapter behind
 * this same interface later. For now, "home map" is recomputed client-side
 * from a deterministic hash, so a missing record never blocks a user.
 */

import type { Address, AssignmentStore, MapId } from './types'

const memory = new Map<string, MapId>()

export const memoryAssignmentStore: AssignmentStore = {
  get(address: Address): MapId | null {
    const key = address.toLowerCase()
    return memory.has(key) ? (memory.get(key) as MapId) : null
  },
  set(address: Address, mapId: MapId): void {
    memory.set(address.toLowerCase(), mapId)
  },
}
