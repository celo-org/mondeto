'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useAccount } from 'wagmi'
import { celo } from 'viem/chains'
import {
  getMapsForChain,
  isRevealedMapId,
  type ChainId,
  type MapContract,
} from '@/lib/maps/contracts'
import { track } from '@/lib/analytics'
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

// The active map is app-global state: the map view, the switcher, the
// leaderboards, and referral deep-links all have to agree on it. It
// lives in a module-level external store (not per-hook useState) so
// every useMaps() caller shares one value — a setCurrentMapId from any
// component re-renders all of them.
let activeMapId: MapId | null = null
const listeners = new Set<() => void>()

function setActiveMapId(id: MapId) {
  if (activeMapId === id) return
  activeMapId = id
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Multi-map state hook.
 *
 * Home derivation rule (per the "1 user -> 1 map" direction):
 *  - If the wallet owns at least one pixel on any registered map, home is
 *    the map where it owns the most (lowest id wins ties).
 *  - Otherwise, home is the lowest revealed map id (today: map 0).
 *
 * TODO: the ownership scan (useOwnedMaps) is not wired in yet — until it
 * is, homeMapId falls back to the lowest revealed map for every wallet.
 *
 * `currentMapId` (the active view, distinct from home) is shared across
 * all callers; the map switcher and referral deep-links write to it.
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

  const fallbackMapId = revealedMaps[0]?.id ?? (0 as MapId)
  const storedMapId = useSyncExternalStore(
    subscribe,
    () => activeMapId,
    () => null,
  )
  const currentMapId = storedMapId ?? fallbackMapId

  const setCurrentMapId = useCallback(
    (id: MapId) => {
      if (!isRevealedMapId(id, effectiveChain)) return
      if (id !== activeMapId) {
        track('map_switched', { fromMapId: activeMapId ?? fallbackMapId, toMapId: id })
      }
      setActiveMapId(id)
    },
    [effectiveChain, fallbackMapId],
  )

  return { revealedMaps, homeMapId, currentMapId, setCurrentMapId }
}
