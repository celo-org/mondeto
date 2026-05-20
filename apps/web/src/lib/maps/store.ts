/**
 * In-memory AssignmentStore — this is the launch store. "Home map" is
 * recomputed client-side from a deterministic hash, so a missing record
 * never blocks a user and we ship no backend at launch.
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
