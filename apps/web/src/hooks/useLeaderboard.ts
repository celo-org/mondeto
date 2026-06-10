'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PixelView } from '@/lib/mock'
import { useReadClient } from '@/hooks/useReadClient'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { allGlobalLeaderboards, allLeaderboards } from '@/lib/maps/leaderboards'
import { pixelViewToMapSnapshot } from '@/lib/maps/adapter'
import { getMapContractById } from '@/lib/maps/contracts'
import { getMaskData } from '@/lib/maps/masks'
import { fetchGlobalSnapshots } from '@/lib/maps/snapshots'
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

function formatUSDTFromNumber(value: number): string {
  if (value === 0) return '0.00'
  if (value >= 1) return value.toFixed(2)
  // Show enough precision to be meaningful for sub-USDT values.
  const str = value.toFixed(6)
  const trimmed = str.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed.length === 0 ? '0.00' : trimmed
}

/**
 * Global AREA values are a sum of per-map ownership fractions (0..N for N
 * maps). Render as a percentage so "owns 22% of total territory" reads
 * naturally; can exceed 100% for a wallet dominating several maps. One
 * decimal under 10% so small-but-real holdings aren't shown as "0%".
 */
function formatPercent(value: number): string {
  const pct = value * 100
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`
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
  // Guaranteed-defined read client. The global board must populate for
  // anonymous visitors and right after the app wakes — wagmi's
  // usePublicClient is undefined in those windows, which previously left the
  // GLOBAL board stuck on "no claims yet".
  const publicClient = useReadClient()

  const localSnapshot = useMemo(() => {
    const home = getMapContractById(homeMapId)
    const { mask } = getMaskData(home.slug)
    return pixelViewToMapSnapshot(pixelData, homeMapId, true, home.width, mask)
  }, [pixelData, homeMapId])

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

    setGlobalLoading(true)
    const read = publicClient.readContract.bind(
      publicClient,
    ) as Parameters<typeof fetchAllPixelsFromContract>[0]

    fetchGlobalSnapshots(read)
      .then((snapshots) => {
        if (cancelled) return
        setGlobalSnapshots(snapshots)
        setGlobalLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setGlobalLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [scope, publicClient])

  const globalBoards = useMemo<BoardSet>(() => {
    const snapshots = globalSnapshots ?? []
    if (snapshots.length === 0) {
      return { area: [], empire: [], tycoons: [], loading: globalLoading }
    }
    const { mostPixels, biggestConnectedArea, mostExpensivePixel } =
      allGlobalLeaderboards(snapshots, Number.MAX_SAFE_INTEGER)
    return {
      // Global AREA is the normalized territory-share board, so its value is
      // a fraction rendered as a percentage (not a raw pixel count).
      area: decorate(mostPixels, '', formatPercent, profilesMap),
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
