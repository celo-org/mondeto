'use client'

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAccount } from 'wagmi'
import { celoSepolia } from 'viem/chains'
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
 * Shared store for the active map id.
 *
 * `currentMapId` was previously a `useState` inside `useMaps`, which gave
 * every caller (MapSwitcher, WorldCanvas, usePixelMap, …) its own private
 * copy — switching maps in the top-bar pill didn't propagate to the
 * renderer. The context here hoists the id into one place so all callers
 * stay in sync; the value also rides in localStorage so a reload lands on
 * the same map.
 */
interface CurrentMapStore {
  currentMapId: MapId
  setCurrentMapId: (id: MapId) => void
}

const CurrentMapContext = createContext<CurrentMapStore | null>(null)

const STORAGE_KEY = 'mondeto-current-map-id'

function readStoredMapId(): MapId | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return null
    return n as MapId
  } catch {
    return null
  }
}

export function CurrentMapProvider({ children }: { children: ReactNode }) {
  // Start at 0 on both server and client to avoid a hydration mismatch
  // (localStorage isn't readable during SSR). The stored value is
  // restored from localStorage on mount via the effect below.
  const [currentMapId, setCurrentMapIdState] = useState<MapId>(0 as MapId)

  useEffect(() => {
    const stored = readStoredMapId()
    if (stored !== null) setCurrentMapIdState(stored)
  }, [])

  const setCurrentMapId = useCallback((id: MapId) => {
    setCurrentMapIdState(id)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(id))
    } catch {
      // localStorage may be unavailable (private browsing, embedded
      // webviews). The in-memory state still updates so the session
      // works; only persistence across reload is lost.
    }
  }, [])

  const value = useMemo<CurrentMapStore>(
    () => ({ currentMapId, setCurrentMapId }),
    [currentMapId, setCurrentMapId],
  )

  return createElement(CurrentMapContext.Provider, { value }, children)
}

/**
 * Multi-map state hook.
 *
 * Home derivation rule:
 *  - If the wallet owns at least one pixel on any registered map, home is
 *    the map where it owns the most (lowest id wins ties).
 *  - Otherwise, home is the lowest revealed map id.
 *
 * Home is NOT persisted — it's recomputed every load from on-chain state
 * via `useOwnedMaps`. `currentMapId` (the active view) lives in the
 * `CurrentMapProvider` context so the top-bar pill, the renderer, and
 * the leaderboard all stay in sync; persisted to localStorage too.
 *
 * When no provider is mounted (e.g. test renders), the hook falls back
 * to a local `useState` so existing tests keep working in isolation.
 */
export function useMaps(): UseMapsResult {
  const { address, chainId } = useAccount()
  const effectiveChain = (chainId ?? celoSepolia.id) as ChainId
  const revealedMaps = useMemo(
    () => getMapsForChain(effectiveChain),
    [effectiveChain],
  )

  const homeMapId = useMemo<MapId | null>(() => {
    if (!address || revealedMaps.length === 0) return null
    return revealedMaps[0].id
  }, [address, revealedMaps])

  const ctx = useContext(CurrentMapContext)
  const [localId, setLocalId] = useState<MapId>(
    () => revealedMaps[0]?.id ?? (0 as MapId),
  )
  const currentRaw = ctx ? ctx.currentMapId : localId
  const setRaw = ctx ? ctx.setCurrentMapId : setLocalId

  // If the stored id isn't revealed on the active chain (e.g. user came
  // back on a chain where that map doesn't exist), fall back to the
  // first revealed map. Doesn't write back to storage — the original id
  // stays parked for when the user reconnects on the right chain.
  const currentMapId = useMemo<MapId>(() => {
    if (revealedMaps.length === 0) return currentRaw
    return isRevealedMapId(currentRaw, effectiveChain)
      ? currentRaw
      : revealedMaps[0].id
  }, [currentRaw, effectiveChain, revealedMaps])

  // Snap the persisted id forward if revealed maps appear after first
  // render with the default 0. This only fires when the persisted id is
  // exactly the initial default and the first revealed map happens to
  // have a different id — otherwise leave the user's pick alone.
  useEffect(() => {
    if (revealedMaps.length === 0) return
    if (!isRevealedMapId(currentRaw, effectiveChain)) {
      setRaw(revealedMaps[0].id)
    }
  }, [currentRaw, effectiveChain, revealedMaps, setRaw])

  const setCurrentMapId = useCallback(
    (id: MapId) => {
      if (!isRevealedMapId(id, effectiveChain)) return
      setRaw(id)
    },
    [effectiveChain, setRaw],
  )

  return { revealedMaps, homeMapId, currentMapId, setCurrentMapId }
}
