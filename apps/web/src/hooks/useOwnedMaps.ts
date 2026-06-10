'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { getMapsForChain, type ChainId } from '@/lib/maps/contracts'
import { getMaskData } from '@/lib/maps/masks'
import { READ_CHAIN_ID, fallbackReadClient } from '@/lib/chain'
import type { MapId } from '@/lib/maps/types'

const CACHE_KEY_PREFIX = 'mondeto-owned-maps'
const CACHE_TTL_MS = 60_000

export interface OwnedMapsResult {
  loading: boolean
  /** Number of pixels the connected wallet owns on each registered map. */
  counts: Record<MapId, number>
  /**
   * Map id where the wallet owns the most pixels — lowest id wins ties.
   * `null` when the wallet owns nothing on any registered map.
   */
  ownedMapId: MapId | null
}

function pickOwned(counts: Record<MapId, number>): MapId | null {
  const entries = Object.entries(counts)
    .map(([id, c]) => ({ id: Number(id) as MapId, c }))
    .filter((e) => e.c > 0)
  if (entries.length === 0) return null
  entries.sort((a, b) => b.c - a.c || a.id - b.id)
  return entries[0].id
}

interface CachedShape {
  ts: number
  counts: Record<MapId, number>
}

function readCache(key: string): CachedShape | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedShape
    if (typeof parsed.ts !== 'number') return null
    if (Date.now() - parsed.ts >= CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(key: string, counts: Record<MapId, number>): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ ts: Date.now(), counts } satisfies CachedShape),
    )
  } catch {
    // sessionStorage may be unavailable (private mode, embedded webview).
    // Silently skip — the count just gets recomputed on next call.
  }
}

/**
 * Per-map pixel ownership count for the connected wallet.
 *
 * Scans every registered map on the primary read chain (`READ_CHAIN_ID` —
 * Celo mainnet), counting
 * pixels owned by the wallet. Used by `useMaps` to drop returning players
 * back on the map where they own the most pixels — the "1 user -> 1 map"
 * UX without a server-side index.
 *
 * Uses the module-level `fallbackReadClient` directly (no wagmi hooks)
 * instead of `useReadClient` / `usePublicClient`. Those route through
 * Privy's WagmiProvider context at render time, which crashes static
 * prerender for every page that mounts `ConnectButton` via `TopBar`
 * with "useWallets was called outside the PrivyProvider component".
 *
 * Cached in `sessionStorage` per (chain, address) for 60 s so navigating
 * across pages doesn't trigger three full-map reads each time.
 */
export function useOwnedMaps(): OwnedMapsResult {
  const { address } = useAccount()
  const [state, setState] = useState<OwnedMapsResult>({
    loading: true,
    counts: {},
    ownedMapId: null,
  })

  useEffect(() => {
    if (!address) {
      setState({ loading: false, counts: {}, ownedMapId: null })
      return
    }

    const cacheKey = `${CACHE_KEY_PREFIX}:${READ_CHAIN_ID}:${address.toLowerCase()}`
    const cached = readCache(cacheKey)
    if (cached) {
      setState({
        loading: false,
        counts: cached.counts,
        ownedMapId: pickOwned(cached.counts),
      })
      return
    }

    let cancelled = false
    setState((p) => ({ ...p, loading: true }))

    async function run() {
      const maps = getMapsForChain(READ_CHAIN_ID as ChainId)
      if (maps.length === 0) {
        if (!cancelled) {
          setState({ loading: false, counts: {}, ownedMapId: null })
        }
        return
      }

      const read = fallbackReadClient.readContract.bind(
        fallbackReadClient,
      ) as Parameters<typeof fetchAllPixelsFromContract>[0]
      const addrLower = address!.toLowerCase()
      const counts: Record<MapId, number> = {}

      await Promise.all(
        maps.map(async (m) => {
          try {
            const { mask } = getMaskData(m.slug)
            const pixels = await fetchAllPixelsFromContract(
              read,
              m.address,
              m.width,
              m.height,
              mask,
            )
            let owned = 0
            for (const px of pixels) {
              if (px.owner.toLowerCase() === addrLower) owned++
            }
            counts[m.id] = owned
          } catch (e) {
            console.warn(`useOwnedMaps: failed to scan map ${m.id}`, e)
            counts[m.id] = 0
          }
        }),
      )

      writeCache(cacheKey, counts)
      if (cancelled) return
      setState({
        loading: false,
        counts,
        ownedMapId: pickOwned(counts),
      })
    }

    run()
    return () => {
      cancelled = true
    }
  }, [address])

  return state
}
