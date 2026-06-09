'use client'

import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { leaderboardMostPixels } from '@/lib/maps/leaderboards'
import { fetchGlobalSnapshots } from '@/lib/maps/snapshots'
import type { Address, MapId } from '@/lib/maps/types'

type ReadContractFn = Parameters<typeof fetchAllPixelsFromContract>[0]

export interface MapRulersResult {
  /** mapId -> the rank-1 holder of that map's LAND board, lowercased, or
   *  null when the map has no claims yet. */
  rulers: Record<MapId, Address | null>
  loading: boolean
}

/**
 * Resolve the "Ruler of <map>" — the wallet that owns the most land pixels on
 * each map (rank-1 of the LAND board). Gender-neutral by design (a leader may
 * be a king, queen, empress, …). Used for the live crown on the profile and
 * anywhere a map's current leader is shown.
 *
 * Reuses the shared 30s cross-map snapshot cache (`fetchGlobalSnapshots`), so
 * this piggybacks on the global leaderboard's fetch when both are on screen.
 */
export function useMapRulers(): MapRulersResult {
  const publicClient = usePublicClient()
  const [rulers, setRulers] = useState<Record<MapId, Address | null>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!publicClient) return
    let cancelled = false
    setLoading(true)

    const read = publicClient.readContract.bind(
      publicClient,
    ) as ReadContractFn

    fetchGlobalSnapshots(read)
      .then((snapshots) => {
        if (cancelled) return
        const next: Record<MapId, Address | null> = {}
        for (const snap of snapshots) {
          const top = leaderboardMostPixels(snap, 1)
          next[snap.meta.id] = top.length > 0 ? top[0].address.toLowerCase() : null
        }
        setRulers(next)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [publicClient])

  return { rulers, loading }
}
