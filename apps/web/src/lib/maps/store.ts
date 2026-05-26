/**
 * AssignmentStore — wallet → home-map id.
 *
 * Persisted to `localStorage` under `mondeto-home:<lowercased-addr>` so a
 * wallet's home stays put across refreshes and across the active-pointer
 * moving forward. When localStorage is unavailable (SSR, private mode,
 * embedded webviews) we fall back to an in-memory Map; the worst case is
 * a recompute on next visit, which the active-pointer model handles.
 */

import type { Address, AssignmentStore, MapId } from './types'

const STORAGE_PREFIX = 'mondeto-home:'

function storageKey(address: Address): string {
  return `${STORAGE_PREFIX}${address.toLowerCase()}`
}

const memory = new Map<string, MapId>()

function readLocal(address: Address): MapId | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey(address))
    if (raw === null) return null
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) ? (n as MapId) : null
  } catch {
    return null
  }
}

function writeLocal(address: Address, mapId: MapId): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(address), String(mapId))
  } catch {
    // localStorage unavailable; in-memory Map below still keeps it stable
    // within the current session.
  }
}

export const memoryAssignmentStore: AssignmentStore = {
  get(address: Address): MapId | null {
    const key = address.toLowerCase()
    const local = readLocal(address)
    if (local !== null) {
      memory.set(key, local)
      return local
    }
    return memory.has(key) ? (memory.get(key) as MapId) : null
  },
  set(address: Address, mapId: MapId): void {
    const key = address.toLowerCase()
    memory.set(key, mapId)
    writeLocal(address, mapId)
  },
}
