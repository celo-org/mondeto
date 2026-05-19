'use client'

/**
 * Map navigation state.
 *
 * Surfaces:
 *   - revealedMaps  — which maps the UI should show right now
 *   - homeMapId     — the player's sticky default map (auto-assigned upstream)
 *   - currentMapId  — the map currently being viewed
 *
 * This is a lightweight, self-contained version intended to merge cleanly
 * with the richer hook from the multi-map onboarding PR. Until that lands,
 * every player's home is map 0 and current === home.
 */

import { useMemo } from 'react'
import { getRevealedMaps, type MapContract } from '@/lib/maps/contracts'
import type { MapId } from '@/lib/maps/types'

export interface UseMapsResult {
  revealedMaps: MapContract[]
  homeMapId: MapId
  currentMapId: MapId
}

export function useMaps(): UseMapsResult {
  const revealedMaps = useMemo(() => getRevealedMaps(), [])
  const homeMapId: MapId = revealedMaps[0]?.id ?? 0
  const currentMapId = homeMapId
  return { revealedMaps, homeMapId, currentMapId }
}
