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
import { memoryAssignmentStore } from '@/lib/maps/store'
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
 * - `homeMapId` is the user's permanent home, persisted via
 *   `memoryAssignmentStore` (localStorage). On a first-ever visit a wallet
 *   gets placed on the lowest-id revealed map (or the `?ref=<id>` map if
 *   that query param is present and valid). Once stored, it never moves.
 * - `currentMapId` (the view, distinct from home) persists in localStorage
 *   so a browse-anywhere user returns to their last view.
 *
 * Note: the price-threshold "active pointer" logic lives in
 * `lib/maps/assignment.ts::activeMapId` and `useShouldOpenNextMap`. It is
 * intentionally NOT wired up here yet — those hooks call into wagmi/Privy
 * during render, which breaks static prerender for every page that mounts
 * `ConnectButton` via `TopBar`. Bring it back when multi-map testing /
 * sequential rollover lands and gate it behind a route that's already
 * dynamic (e.g. /analytics).
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

    // First visit: drop new wallets on the lowest revealed map id.
    const pick = revealedMaps[0].id
    memoryAssignmentStore.set(address, pick)
    return pick
  }, [address, revealedMaps, effectiveChain])

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
