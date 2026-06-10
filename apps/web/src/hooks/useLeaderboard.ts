'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PixelView } from '@/lib/mock'
import { allLeaderboards } from '@/lib/maps/leaderboards'
import { pixelViewToMapSnapshot } from '@/lib/maps/adapter'
import { getMapContractById } from '@/lib/maps/contracts'
import { getMaskData } from '@/lib/maps/masks'
import type { LeaderEntry, MapId } from '@/lib/maps/types'
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
  // The cross-map board is computed server-side (/api/global-board) — reading
  // every map's full pixel state from the phone was unreliable on MiniPay's
  // RPC. The client just fetches the ranked entries and decorates them.
  interface GlobalRaw {
    area: LeaderEntry[]
    empire: LeaderEntry[]
    tycoons: LeaderEntry[]
  }
  const [globalRaw, setGlobalRaw] = useState<GlobalRaw | null>(null)
  const [globalLoading, setGlobalLoading] = useState(false)

  useEffect(() => {
    if (scope !== 'global') return
    let cancelled = false

    setGlobalLoading(true)
    fetch('/api/global-board')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setGlobalRaw({
          area: d.area ?? [],
          empire: d.empire ?? [],
          tycoons: d.tycoons ?? [],
        })
        setGlobalLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setGlobalLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [scope])

  const globalBoards = useMemo<BoardSet>(() => {
    // Treat "haven't fetched yet" as loading too, so the first fetch reads as
    // loading rather than flashing the empty "no claims yet" state.
    const stillLoading = globalLoading || globalRaw === null
    if (!globalRaw) {
      return { area: [], empire: [], tycoons: [], loading: stillLoading }
    }
    return {
      // Global AREA is the normalized territory-share board, so its value is
      // a fraction rendered as a percentage (not a raw pixel count).
      area: decorate(globalRaw.area, '', formatPercent, profilesMap),
      empire: decorate(globalRaw.empire, 'px', (v) => String(v), profilesMap),
      tycoons: decorate(
        globalRaw.tycoons,
        'USDT',
        formatUSDTFromNumber,
        profilesMap,
      ),
      loading: stillLoading,
    }
  }, [globalRaw, globalLoading, profilesMap])

  return scope === 'global' ? globalBoards : localBoards
}
