/**
 * Per-map contract registry.
 *
 * Launch plan is six identical map contracts; only one is deployed today.
 * This module is the single source of truth for "which maps are revealed
 * right now" so callers (leaderboards, navigation, assignment) don't each
 * hardcode the current count.
 *
 * NOTE: this is a lightweight, self-contained version intended to merge
 * cleanly with the richer registry from the multi-map onboarding PR.
 * The exported surface (`MAP_CONTRACTS`, `getRevealedMaps`) is what other
 * modules depend on; the internals can be swapped without callsite churn.
 */

import { MONDETO_ADDRESS } from '@/lib/contract'
import type { MapId } from './types'

export interface MapContract {
  id: MapId
  address: `0x${string}`
  /** Whether the map is currently visible / queryable in the UI. */
  revealed: boolean
  /** Whether the map is accepting new home-map assignments. */
  open: boolean
}

/**
 * Map registry. Index === MapId.
 *
 * Only map 0 is live today. Additional entries will be flipped to
 * `revealed: true` as each new map opens; until then they stay hidden so
 * the leaderboard scope toggle and navigation don't surface empty boards.
 */
export const MAP_CONTRACTS: MapContract[] = [
  {
    id: 0,
    address: MONDETO_ADDRESS,
    revealed: true,
    open: true,
  },
]

/** All maps the UI should currently show — used by global leaderboard. */
export function getRevealedMaps(): MapContract[] {
  return MAP_CONTRACTS.filter((m) => m.revealed)
}
