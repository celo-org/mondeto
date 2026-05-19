'use client'

import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { createPublicClient, http } from 'viem'
import { celo } from 'viem/chains'
import { MONDETO_ADDRESS } from '@/lib/contract'
import { fetchMapSnapshot } from '@/lib/maps/adapter'
import type { MapSnapshot } from '@/lib/maps/types'

/**
 * Average pixel price at which the operator should reveal another map.
 * In USDT. Sourced from the v2 tokenomics memo (natural demand cap ~$7;
 * the average sale across a cycle is ~$1, so $2 is mid-cycle warning).
 *
 * TODO: read from the Postgres `settings` row once Agent A wires it. For
 * now this is a compile-time constant.
 */
export const OPEN_NEXT_THRESHOLD = 2 // TODO: read from settings table

/**
 * Revealed map registry. Index === contract `MapId`. For launch only map 0
 * is revealed; the other 5 deployed maps stay hidden until the operator
 * flips them in the Vercel data editor.
 *
 * TODO: read from settings table (revealed_map_ids array, addresses keyed
 * by id). For now this is a single-element array pointing at the live
 * Celo mainnet contract.
 */
const REVEALED_MAPS: Array<{ id: number; address: `0x${string}`; revealed: true }> = [
  { id: 0, address: MONDETO_ADDRESS, revealed: true },
  // TODO: read from settings table
]

const fallbackClient = createPublicClient({
  chain: celo,
  transport: http(),
})

export interface UseMapSnapshotsResult {
  snapshots: MapSnapshot[]
  loading: boolean
  error: string | null
}

/**
 * Fetches a `MapSnapshot[]` — one per revealed map. The advisory panel +
 * per-map breakdown table on /analytics consume this. All revealed maps
 * are read in parallel; an error from any one map is surfaced via the
 * `error` field but does not block the others (we still return whatever
 * succeeded so the dashboard degrades gracefully).
 */
export function useMapSnapshots(): UseMapSnapshotsResult {
  const wagmiClient = usePublicClient()
  const [state, setState] = useState<UseMapSnapshotsResult>({
    snapshots: [],
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function run() {
      const client = wagmiClient ?? fallbackClient
      const read = client.readContract.bind(client) as Parameters<
        typeof fetchMapSnapshot
      >[0]

      const results = await Promise.allSettled(
        REVEALED_MAPS.map((m) =>
          fetchMapSnapshot(read, {
            id: m.id,
            address: m.address,
            open: m.revealed,
          })
        )
      )

      if (cancelled) return

      const snapshots: MapSnapshot[] = []
      const errors: string[] = []
      for (const r of results) {
        if (r.status === 'fulfilled') snapshots.push(r.value)
        else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
      }

      setState({
        snapshots,
        loading: false,
        error: errors.length > 0 ? errors.join('; ') : null,
      })
    }

    run().catch((e) => {
      if (cancelled) return
      setState({
        snapshots: [],
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to fetch map snapshots',
      })
    })

    return () => {
      cancelled = true
    }
  }, [wagmiClient])

  return state
}
