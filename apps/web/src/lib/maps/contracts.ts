/**
 * Multi-map contract registry.
 *
 * Mondeto launches with one live map (id 0). The other slots are pre-deployed
 * but hidden until ops flips `revealed` (eventually via the Vercel dashboard
 * data editor — see ADR-2). Until then, only revealed maps surface in the UI.
 *
 * The single-map flow is preserved: when only one map is revealed, the UI
 * shell hides the map switcher entirely and behaves exactly as before.
 */

import type { MapId } from './types'

export interface MapContract {
  id: MapId
  address: `0x${string}`
  /** When false, this map is hidden from the UI even if pre-deployed. */
  revealed: boolean
}

/**
 * Source of truth for which map id maps to which deployed contract.
 *
 * Add new entries here as the smart-contract developer deploys more maps;
 * flip `revealed` to true when ops opens them to players. Map ids must be
 * dense (0, 1, 2, ...) so hash-balanced assignment lands on a valid slot.
 */
export const MAP_CONTRACTS: readonly MapContract[] = [
  { id: 0, address: '0x7e68c4c7458895ec8ded5a44299e05d0a6d54780', revealed: true },
  // { id: 1, address: '0x...', revealed: false },
  // { id: 2, address: '0x...', revealed: false },
  // { id: 3, address: '0x...', revealed: false },
  // { id: 4, address: '0x...', revealed: false },
  // { id: 5, address: '0x...', revealed: false },
] as const

/** Currently revealed maps, in stable id order. */
export function getRevealedMaps(): MapContract[] {
  return MAP_CONTRACTS.filter((m) => m.revealed).sort((a, b) => a.id - b.id)
}

/**
 * Resolve a map id to its deployed contract address.
 *
 * Falls back to map 0 if the id is unknown or unrevealed — the single-map
 * flow then keeps working and we never accidentally send reads/writes to a
 * map players cannot see.
 */
export function getContractByMapId(id: MapId): `0x${string}` {
  const entry = MAP_CONTRACTS.find((m) => m.id === id && m.revealed)
  if (entry) return entry.address
  const fallback = MAP_CONTRACTS.find((m) => m.revealed)
  if (!fallback) {
    throw new Error('getContractByMapId: no revealed maps configured')
  }
  return fallback.address
}

/** Is this map id one of the currently revealed maps? */
export function isRevealedMapId(id: MapId): boolean {
  return MAP_CONTRACTS.some((m) => m.id === id && m.revealed)
}
