'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { celo } from 'viem/chains'
import {
  getMapsForChain,
  isRevealedMapId,
  type ChainId,
  type MapContract,
} from '@/lib/maps/contracts'
import { activeMapId } from '@/lib/maps/assignment'
import { memoryAssignmentStore } from '@/lib/maps/store'
import { useShouldOpenNextMap } from '@/hooks/useShouldOpenNextMap'
import type { MapId } from '@/lib/maps/types'

const STORAGE_KEY = 'mondeto-current-map-id'
const REF_PARAM = 'ref'

function readStoredMapId(): MapId | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) ? (n as MapId) : null
  } catch {
    return null
  }
}

function writeStoredMapId(id: MapId): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // localStorage may be unavailable (private mode, embedded webview).
    // Falling through is safe — current map just won't persist this session.
  }
}

function readReferredMapId(): MapId | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const sp = new URLSearchParams(window.location.search)
    const raw = sp.get(REF_PARAM)
    if (raw === null) return undefined
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) ? (n as MapId) : undefined
  } catch {
    return undefined
  }
}

export interface UseMapsResult {
  /** Maps visible on the wallet's connected chain, in stable id order. */
  revealedMaps: MapContract[]
  /** The user's sticky home map. Null when not connected. */
  homeMapId: MapId | null
  /** The map the user is currently viewing (defaults to home). */
  currentMapId: MapId
  setCurrentMapId: (id: MapId) => void
}

/**
 * Multi-map state hook.
 *
 * - `homeMapId` is the user's permanent home. Read from localStorage first.
 *   On a first-ever visit it's computed via the active-pointer mechanism
 *   (`activeMapId(perMapPrices, threshold)`) so new wallets all land on the
 *   current frontier map. Once stored, it never moves on its own.
 * - `?ref=<map-id>` overrides on first visit (referral placement).
 * - `currentMapId` (the view, distinct from home) persists in localStorage so
 *   a browse-anywhere user returns to their last view.
 */
export function useMaps(): UseMapsResult {
  const { address, chainId } = useAccount()
  const effectiveChain = (chainId ?? celo.id) as ChainId
  const revealedMaps = useMemo(
    () => getMapsForChain(effectiveChain),
    [effectiveChain],
  )

  // Per-map prices drive the active pointer for first-visit assignment.
  const { perMap, thresholdUsd } = useShouldOpenNextMap()

  const homeMapId = useMemo<MapId | null>(() => {
    if (!address || revealedMaps.length === 0) return null

    // Honor a referral only on the very first visit (no stored home).
    const referredMapId = readReferredMapId()
    const existing = memoryAssignmentStore.get(address)
    if (
      existing === null &&
      referredMapId !== undefined &&
      isRevealedMapId(referredMapId, effectiveChain)
    ) {
      memoryAssignmentStore.set(address, referredMapId)
      return referredMapId
    }

    if (existing !== null && isRevealedMapId(existing, effectiveChain)) {
      return existing
    }

    // First visit: pick the active-pointer map. Fall back to the lowest id
    // if per-map prices haven't loaded yet (avoids a flash of null/undefined).
    let pick: MapId
    if (perMap.length > 0) {
      const visibleIds = new Set(revealedMaps.map((m) => m.id))
      const known = perMap.filter((p) => visibleIds.has(p.mapId))
      pick = known.length > 0
        ? activeMapId(
            known.map((p) => ({ id: p.mapId, avgPriceUsd: p.avgPriceUsd })),
            thresholdUsd,
          )
        : revealedMaps[0].id
    } else {
      pick = revealedMaps[0].id
    }

    memoryAssignmentStore.set(address, pick)
    return pick
  }, [address, revealedMaps, perMap, thresholdUsd, effectiveChain])

  const [currentMapId, setCurrentMapIdState] = useState<MapId>(() => {
    const stored = readStoredMapId()
    if (stored !== null && isRevealedMapId(stored, effectiveChain)) return stored
    return revealedMaps[0]?.id ?? (0 as MapId)
  })

  // Once we know the home (i.e. wallet is connected) and the user has no
  // explicit stored view, promote home to the current view.
  useEffect(() => {
    if (homeMapId === null) return
    const stored = readStoredMapId()
    if (stored === null) {
      setCurrentMapIdState(homeMapId)
    }
  }, [homeMapId])

  const setCurrentMapId = useCallback(
    (id: MapId) => {
      if (!isRevealedMapId(id, effectiveChain)) return
      setCurrentMapIdState(id)
      writeStoredMapId(id)
    },
    [effectiveChain],
  )

  return { revealedMaps, homeMapId, currentMapId, setCurrentMapId }
}
