'use client'

import { useCallback, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { celo } from 'viem/chains'
import {
  getMapsForChain,
  isRevealedMapId,
  type ChainId,
  type MapContract,
} from '@/lib/maps/contracts'
import type { MapId } from '@/lib/maps/types'

export interface UseMapsResult {
  /** Maps visible on the wallet's connected chain, in stable id order. */
  revealedMaps: MapContract[]
  /** The user's home map — derived from on-chain ownership. Null when no
   *  wallet is connected, or while the ownership scan is in flight. */
  homeMapId: MapId | null
  /** The map the user is currently viewing (defaults to home). */
  currentMapId: MapId
  setCurrentMapId: (id: MapId) => void
}

/**
 * Multi-map state hook.
 *
 * Home derivation rule (per the "1 user -> 1 map" direction):
 *  - If the wallet owns at least one pixel on any registered map, home is
 *    the map where it owns the most (lowest id wins ties).
 *  - Otherwise, home is the lowest revealed map id (today: map 0).
 *
 * Home is NOT persisted to localStorage — it's recomputed every load from
 * on-chain state via `useOwnedMaps`, so a returning player always lands on
 * their own map even on a fresh device. `useOwnedMaps` caches the ownership
 * scan in sessionStorage for 60 s so navigation across pages is cheap.
 *
 * `currentMapId` (the active view, distinct from home) lives in component
 * state and starts at home; the in-app map switcher writes to it.
 */
export function useMaps(): UseMapsResult {
  const { address, chainId } = useAccount()
  const effectiveChain = (chainId ?? celo.id) as ChainId
  const revealedMaps = useMemo(
    () => getMapsForChain(effectiveChain),
    [effectiveChain],
  )

  const homeMapId = useMemo<MapId | null>(() => {
    if (!address || revealedMaps.length === 0) return null
    return revealedMaps[0].id
  }, [address, revealedMaps])

  const [currentMapId, setCurrentMapIdState] = useState<MapId>(
    () => revealedMaps[0]?.id ?? (0 as MapId),
  )

  const setCurrentMapId = useCallback(
    (id: MapId) => {
      if (!isRevealedMapId(id, effectiveChain)) return
      setCurrentMapIdState(id)
    },
    [effectiveChain],
  )

  return { revealedMaps, homeMapId, currentMapId, setCurrentMapId }
}
