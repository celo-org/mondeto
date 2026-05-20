'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePublicClient } from 'wagmi'
import type { PixelView } from '@/lib/mock'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { allGlobalLeaderboards, allLeaderboards } from '@/lib/maps/leaderboards'
import { pixelViewToMapSnapshot } from '@/lib/maps/adapter'
import { getRevealedMaps } from '@/lib/maps/contracts'
import type { LeaderEntry, MapId, MapSnapshot } from '@/lib/maps/types'
import { generateUsername } from '@/lib/username'

export type LeaderboardTab = 'AREA' | 'EMPIRE' | 'TYCOONS'
export type LeaderboardScope = 'local' | 'global'

export interface LeaderboardEntry {
  rank: number
  owner: string
  label: string
  url: string
  color: string
  value: string
  unit: string
}

export interface OwnerProfileData {
  label: string
  url: string
  color: string
}

interface UseLeaderboardOptions {
  scope?: LeaderboardScope
  /** Map id whose pixel data `pixelData` represents (for local scope). */
  homeMapId?: MapId
}

interface BoardSet {
  area: LeaderboardEntry[]
  empire: LeaderboardEntry[]
  tycoons: LeaderboardEntry[]
  /** True while global snapshots are being fetched. */
  loading: boolean
}

// 30s TTL avoids hammering Forno when the user flips local/global tabs.
const GLOBAL_CACHE_TTL_MS = 30_000
const GLOBAL_CACHE_KEY = 'mondeto:global-snapshots:v1'

interface CachedSnapshot {
  mapId: MapId
  open: boolean
  // Each pixel encoded as a tuple to keep storage tight.
  // [id, x, y, owner|null, currentPrice, isLand(0|1)]
  pixels: Array<[number, number, number, string | null, number, 0 | 1]>
}

interface CacheEntry {
  storedAt: number
  snapshots: CachedSnapshot[]
}

function readGlobalCache(): MapSnapshot[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(GLOBAL_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (Date.now() - parsed.storedAt > GLOBAL_CACHE_TTL_MS) return null
    return parsed.snapshots.map((s) => ({
      meta: { id: s.mapId, open: s.open },
      pixels: s.pixels.map(([id, x, y, owner, currentPrice, isLand]) => ({
        id,
        x,
        y,
        owner,
        currentPrice,
        isLand: isLand === 1,
      })),
    }))
  } catch {
    return null
  }
}

function writeGlobalCache(snapshots: MapSnapshot[]): void {
  if (typeof window === 'undefined') return
  try {
    const entry: CacheEntry = {
      storedAt: Date.now(),
      snapshots: snapshots.map((s) => ({
        mapId: s.meta.id,
        open: s.meta.open,
        pixels: s.pixels.map((p) => [
          p.id,
          p.x,
          p.y,
          p.owner,
          p.currentPrice,
          p.isLand ? 1 : 0,
        ]),
      })),
    }
    window.sessionStorage.setItem(GLOBAL_CACHE_KEY, JSON.stringify(entry))
  } catch {
    // sessionStorage may be full or unavailable; not fatal.
  }
}

function formatUSDTFromNumber(value: number): string {
  if (value === 0) return '0.00'
  if (value >= 1) return value.toFixed(2)
  // Show enough precision to be meaningful for sub-USDT values.
  const str = value.toFixed(6)
  const trimmed = str.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed.length === 0 ? '0.00' : trimmed
}

function decorate(
  entries: LeaderEntry[],
  unit: string,
  formatValue: (v: number) => string,
  profilesMap?: Map<string, OwnerProfileData>,
): LeaderboardEntry[] {
  return entries.map((e, i) => {
    const profile = profilesMap?.get(e.address.toLowerCase())
    return {
      rank: i + 1,
      owner: e.address,
      label: profile?.label || generateUsername(e.address),
      url: profile?.url ?? '',
      color: profile?.color ?? '',
      value: formatValue(e.value),
      unit,
    }
  })
}

/**
 * Leaderboard hook.
 *
 * - `local` scope: builds three boards from `pixelData` (the player's home map).
 * - `global` scope: fetches every revealed map in parallel and runs the
 *   cross-map aggregations from `lib/maps/leaderboards`.
 *
 * Global snapshots are cached in sessionStorage for 30s so flipping the
 * LOCAL/GLOBAL toggle doesn't refetch on every click.
 */
export function useLeaderboard(
  pixelData: PixelView[],
  profilesMap?: Map<string, OwnerProfileData>,
  options: UseLeaderboardOptions = {},
): BoardSet {
  const scope = options.scope ?? 'local'
  const homeMapId = options.homeMapId ?? 0
  const publicClient = usePublicClient()

  const localSnapshot = useMemo(
    () => pixelViewToMapSnapshot(pixelData, homeMapId, true),
    [pixelData, homeMapId],
  )

  const localBoards = useMemo<BoardSet>(() => {
    const { mostPixels, biggestConnectedArea, mostExpensivePixel } =
      allLeaderboards(localSnapshot, Number.MAX_SAFE_INTEGER)
    return {
      area: decorate(mostPixels, 'px', (v) => String(v), profilesMap),
      empire: decorate(biggestConnectedArea, 'px', (v) => String(v), profilesMap),
      tycoons: decorate(
        mostExpensivePixel,
        'USDT',
        formatUSDTFromNumber,
        profilesMap,
      ),
      loading: false,
    }
  }, [localSnapshot, profilesMap])

  // --- Global path -------------------------------------------------------
  const [globalSnapshots, setGlobalSnapshots] = useState<MapSnapshot[] | null>(
    null,
  )
  const [globalLoading, setGlobalLoading] = useState(false)

  useEffect(() => {
    if (scope !== 'global') return
    let cancelled = false

    const revealed = getRevealedMaps()
    // If only one map is revealed there's nothing extra to fetch — the local
    // snapshot IS the global snapshot. Caller is expected to hide the toggle
    // in that case, but we stay correct either way.
    if (revealed.length <= 1) {
      setGlobalSnapshots([localSnapshot])
      setGlobalLoading(false)
      return
    }

    const cached = readGlobalCache()
    if (cached && cached.length === revealed.length) {
      setGlobalSnapshots(cached)
      setGlobalLoading(false)
      return
    }

    if (!publicClient) return
    setGlobalLoading(true)
    const read = publicClient.readContract.bind(
      publicClient,
    ) as Parameters<typeof fetchAllPixelsFromContract>[0]

    Promise.all(
      revealed.map(async (m) => {
        try {
          // NOTE: today every revealed map points at the same address. When
          // each map gets its own contract, `fetchAllPixelsFromContract`
          // will need to accept the per-map address. The shape returned
          // here doesn't change.
          const data = await fetchAllPixelsFromContract(read)
          return pixelViewToMapSnapshot(data, m.id, m.revealed)
        } catch (e) {
          console.warn(`Failed to load map ${m.id} for global board:`, e)
          // Empty snapshot so one bad map doesn't kill the whole board.
          return pixelViewToMapSnapshot([], m.id, m.revealed)
        }
      }),
    ).then((snapshots) => {
      if (cancelled) return
      writeGlobalCache(snapshots)
      setGlobalSnapshots(snapshots)
      setGlobalLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [scope, publicClient, localSnapshot])

  const globalBoards = useMemo<BoardSet>(() => {
    const snapshots = globalSnapshots ?? []
    if (snapshots.length === 0) {
      return { area: [], empire: [], tycoons: [], loading: globalLoading }
    }
    const { mostPixels, biggestConnectedArea, mostExpensivePixel } =
      allGlobalLeaderboards(snapshots, Number.MAX_SAFE_INTEGER)
    return {
      area: decorate(mostPixels, 'px', (v) => String(v), profilesMap),
      empire: decorate(biggestConnectedArea, 'px', (v) => String(v), profilesMap),
      tycoons: decorate(
        mostExpensivePixel,
        'USDT',
        formatUSDTFromNumber,
        profilesMap,
      ),
      loading: globalLoading,
    }
  }, [globalSnapshots, globalLoading, profilesMap])

  return scope === 'global' ? globalBoards : localBoards
}
