'use client'

import { useMemo } from 'react'
import type { PixelView } from '@/lib/mock'
import { pixelViewToMapSnapshot } from '@/lib/maps/adapter'
import {
  allLeaderboards,
  allGlobalLeaderboards,
} from '@/lib/maps/leaderboards'
import type { LeaderEntry, MapId, MapSnapshot } from '@/lib/maps/types'
import { formatUSDT } from '@/lib/colorUtils'

export type LeaderboardTab = 'AREA' | 'EMPIRE' | 'TYCOONS'
export type LeaderboardScope = 'LOCAL' | 'GLOBAL'

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

interface BoardSet {
  area: LeaderboardEntry[]
  empire: LeaderboardEntry[]
  tycoons: LeaderboardEntry[]
}

function decorate(
  entries: LeaderEntry[],
  unit: string,
  format: (value: number) => string,
  profilesMap?: Map<string, OwnerProfileData>,
): LeaderboardEntry[] {
  return entries.map((entry, i) => {
    const prof = profilesMap?.get(entry.address.toLowerCase())
    return {
      rank: i + 1,
      owner: entry.address,
      label: prof?.label ?? '',
      url: prof?.url ?? '',
      color: prof?.color ?? '',
      value: format(entry.value),
      unit,
    }
  })
}

const LIMIT = 1000

function boards(
  snapshots: MapSnapshot[],
  scope: LeaderboardScope,
  profilesMap?: Map<string, OwnerProfileData>,
): BoardSet {
  const fmtCount = (v: number) => String(v)
  // Micro-USDT (6 decimals) → bigint for the shared formatter.
  const fmtPrice = (v: number) => formatUSDT(BigInt(Math.round(v)))

  if (scope === 'GLOBAL') {
    const r = allGlobalLeaderboards(snapshots, LIMIT)
    return {
      area: decorate(r.mostPixels, 'px', fmtCount, profilesMap),
      empire: decorate(r.biggestConnectedArea, 'px', fmtCount, profilesMap),
      tycoons: decorate(r.mostExpensivePixel, 'USDT', fmtPrice, profilesMap),
    }
  }
  // LOCAL: first revealed map, or empty if none.
  const m = snapshots[0]
  if (!m) {
    return { area: [], empire: [], tycoons: [] }
  }
  const r = allLeaderboards(m, LIMIT)
  return {
    area: decorate(r.mostPixels, 'px', fmtCount, profilesMap),
    empire: decorate(r.biggestConnectedArea, 'px', fmtCount, profilesMap),
    tycoons: decorate(r.mostExpensivePixel, 'USDT', fmtPrice, profilesMap),
  }
}

/**
 * Leaderboard hook for a single revealed map.
 *
 * The hook accepts a flat `PixelView[]` for one map plus its `mapId`, converts
 * it to a `MapSnapshot` via the adapter, and runs both per-map (LOCAL) and
 * cross-map (GLOBAL) boards. With only one map revealed at launch, LOCAL and
 * GLOBAL produce the same ordering — kept distinct so the UI scales naturally
 * once additional maps come online.
 */
export function useLeaderboard(
  pixelData: PixelView[],
  mapId: MapId = 0,
  profilesMap?: Map<string, OwnerProfileData>,
) {
  const snapshots = useMemo<MapSnapshot[]>(
    () =>
      pixelData.length > 0
        ? [pixelViewToMapSnapshot(pixelData, mapId, true)]
        : [],
    [pixelData, mapId],
  )

  const local = useMemo(
    () => boards(snapshots, 'LOCAL', profilesMap),
    [snapshots, profilesMap],
  )
  const global = useMemo(
    () => boards(snapshots, 'GLOBAL', profilesMap),
    [snapshots, profilesMap],
  )

  return {
    // Back-compat: existing tests / callers expect these at the top level
    // (they correspond to the LOCAL scope).
    area: local.area,
    empire: local.empire,
    tycoons: local.tycoons,
    local,
    global,
  }
}
