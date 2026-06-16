'use client'

import { useEffect, useState } from 'react'
import type { Address, MapId } from '@/lib/maps/types'

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
 * Reads from the server-side cross-map endpoint (`/api/global-board`), which
 * already computes per-map rulers — reliable even on MiniPay, where reading
 * every map from the device was failing.
 */
export function useMapRulers(): MapRulersResult {
  const [rulers, setRulers] = useState<Record<MapId, Address | null>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetch('/api/global-board')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setRulers((d.rulers ?? {}) as Record<MapId, Address | null>)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { rulers, loading }
}
