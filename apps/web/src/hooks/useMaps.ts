'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { getRevealedMaps, isRevealedMapId, type MapContract } from '@/lib/maps/contracts'
import { hashAddress, assignUserToMap } from '@/lib/maps/assignment'
import { getStore } from '@/lib/maps/store'
import type { MapId, MapSnapshot } from '@/lib/maps/types'

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

/**
 * Build the minimum MapSnapshot list the pure assignment module needs.
 *
 * The launch single-map app does not yet have per-map snapshots in scope
 * (Agent A wires that with the Postgres adapter); for now every revealed
 * map is treated as fresh/empty so referral placement works correctly.
 */
function toSnapshots(revealed: MapContract[]): MapSnapshot[] {
  return revealed.map((m) => ({
    meta: { id: m.id, open: true },
    pixels: [],
  }))
}

export interface UseMapsResult {
  /** Maps the operator has flipped on, in stable id order. */
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
 * - `homeMapId` is derived from `hashAddress(address) % revealedMaps.length`
 *   so a launch crowd spreads evenly across whatever is revealed.
 * - On first visit, a `?ref=<map-id>` parameter is honored via
 *   `assignUserToMap` (referral placement). Subsequent visits ignore it.
 * - `currentMapId` persists to localStorage so a browse-anywhere user
 *   returns to their last view on the next visit.
 *
 * If only one map is revealed (the launch state), this hook stays inert:
 * `homeMapId === currentMapId === 0` and the UI hides the switcher.
 */
export function useMaps(): UseMapsResult {
  const { address } = useAccount()
  const revealedMaps = useMemo(() => getRevealedMaps(), [])

  // Compute home map id from the wallet address. The store is async
  // (Postgres in prod, in-memory in dev), so we kick a resolve effect and
  // also keep a deterministic synchronous fallback (hash-based) so the UI
  // never blocks on a network call.
  const syncHomeMapId = useMemo<MapId | null>(() => {
    if (!address || revealedMaps.length === 0) return null
    const ids = revealedMaps.map((m) => m.id).sort((a, b) => a - b)
    return ids[hashAddress(address) % ids.length]
  }, [address, revealedMaps])

  const [homeMapId, setHomeMapId] = useState<MapId | null>(syncHomeMapId)

  useEffect(() => {
    setHomeMapId(syncHomeMapId)
    if (!address || revealedMaps.length === 0) return
    let cancelled = false
    const store = getStore()
    const ids = revealedMaps.map((m) => m.id).sort((a, b) => a - b)

    const resolve = async (): Promise<MapId | null> => {
      // Honor a referral only on the very first visit. assignUserToMap is
      // sticky so any existing assignment wins.
      const referredMapId = readReferredMapId()
      if (referredMapId !== undefined && isRevealedMapId(referredMapId)) {
        try {
          return await assignUserToMap(
            address,
            toSnapshots(revealedMaps),
            store,
            { referredMapId },
          )
        } catch {
          // No open map — fall through to hash-based default.
        }
      }

      const existing = await store.get(address)
      if (existing !== null && ids.includes(existing)) return existing

      const pick = ids[hashAddress(address) % ids.length]
      await store.set(address, pick)
      return pick
    }

    resolve()
      .then((id) => {
        if (!cancelled && id !== null) setHomeMapId(id)
      })
      .catch(() => {
        // Postgres unreachable / network blip — keep the sync fallback.
      })

    return () => {
      cancelled = true
    }
  }, [address, revealedMaps, syncHomeMapId])

  // Current view defaults to home; localStorage rehydrates browse-anywhere.
  const [currentMapId, setCurrentMapIdState] = useState<MapId>(() => {
    const stored = readStoredMapId()
    if (stored !== null && isRevealedMapId(stored)) return stored
    return revealedMaps[0]?.id ?? (0 as MapId)
  })

  // Once we know the home map (i.e. wallet is connected), promote it over
  // the default-zero state if the user has no stored preference yet.
  useEffect(() => {
    if (homeMapId === null) return
    const stored = readStoredMapId()
    if (stored === null) {
      setCurrentMapIdState(homeMapId)
    }
  }, [homeMapId])

  const setCurrentMapId = useCallback((id: MapId) => {
    if (!isRevealedMapId(id)) return
    setCurrentMapIdState(id)
    writeStoredMapId(id)
  }, [])

  return { revealedMaps, homeMapId, currentMapId, setCurrentMapId }
}
