'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PixelView } from '@/lib/mock'
import {
  allLeaderboards,
  leaderboardMostPixels,
  rankGap,
  type RankGap,
} from '@/lib/maps/leaderboards'
import {
  fetchAreaLeaderboard,
  fetchPixelTimestamps,
  subgraphConfigured,
} from '@/lib/subgraph'
import { pixelViewToMapSnapshot } from '@/lib/maps/adapter'
import { getMapContractById } from '@/lib/maps/contracts'
import { getMaskData } from '@/lib/maps/masks'
import type { LeaderEntry, MapId } from '@/lib/maps/types'
import { generateUsername } from '@/lib/username'

// Canonical definition lives in lib/maps/leaderboards (a pure lib), so server
// components and tests can reach it without pulling in this client module.
export type { LeaderboardTab } from '@/lib/maps/leaderboards'
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
  /**
   * Connected wallet to locate on each board (any casing). When set, the
   * hook also returns the player's standing + gap to the rank above per
   * board — even when the player sits below the truncated global top-N.
   */
  viewer?: string
}

/** The connected player's standing on one board. */
export interface YouStanding {
  /** Decorated row for the player (rank, label, formatted value). */
  entry: LeaderboardEntry
  /** Raw numeric distance to the rank above; null at rank 1. */
  gap: number | null
  /** `gap` formatted with the same formatter as the board's values. */
  gapValue: string | null
}

export interface BoardYou {
  area: YouStanding | null
  empire: YouStanding | null
  tycoons: YouStanding | null
}

interface BoardSet {
  area: LeaderboardEntry[]
  empire: LeaderboardEntry[]
  tycoons: LeaderboardEntry[]
  /** True while global snapshots are being fetched. */
  loading: boolean
  /** Per-board standing for `options.viewer`; every board null when the
   *  viewer is absent or owns nothing on that board. */
  you: BoardYou
}

const NO_YOU: BoardYou = { area: null, empire: null, tycoons: null }

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
 * Build a YouStanding from a located rank gap. When the player's rank is
 * inside the decorated list we reuse that row; below the cutoff (global
 * boards truncate) we synthesize an equivalent row from the raw standing.
 */
function toYou(
  gapInfo: RankGap | null,
  decorated: LeaderboardEntry[],
  unit: string,
  formatValue: (v: number) => string,
  viewer: string,
  profilesMap?: Map<string, OwnerProfileData>,
): YouStanding | null {
  if (!gapInfo) return null
  const inList =
    gapInfo.rank <= decorated.length &&
    decorated[gapInfo.rank - 1].owner.toLowerCase() === viewer.toLowerCase()
  const profile = profilesMap?.get(viewer.toLowerCase())
  const entry: LeaderboardEntry = inList
    ? decorated[gapInfo.rank - 1]
    : {
        rank: gapInfo.rank,
        owner: viewer,
        label: profile?.label || generateUsername(viewer),
        url: profile?.url ?? '',
        color: profile?.color ?? '',
        value: formatValue(gapInfo.value),
        unit,
      }
  return {
    entry,
    gap: gapInfo.gap,
    gapValue: gapInfo.gap === null ? null : formatValue(gapInfo.gap),
  }
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
  const viewer = options.viewer

  const localSnapshot = useMemo(() => {
    const home = getMapContractById(homeMapId)
    const { mask } = getMaskData(home.slug)
    return pixelViewToMapSnapshot(pixelData, homeMapId, true, home.width, mask)
  }, [pixelData, homeMapId])

  // AREA comes from the subgraph's OwnerMapStat (pixelCount + lastGainAt) so the
  // board matches the payout snapshot EXACTLY — same value, same "reached it
  // first" tie-break field (see celo-org/mondeto-admin#48). EMPIRE and TYCOONS
  // still enrich the live snapshot with per-pixel acquisition times (exact), as
  // the subgraph has no aggregate for "biggest block" / "priciest pixel".
  // Without the subgraph configured (or on error) both are null and boards fall
  // back to the snapshot with the deterministic address tie-break.
  const [localArea, setLocalArea] = useState<LeaderEntry[] | null>(null)
  const [tsMap, setTsMap] = useState<Map<number, number> | null>(null)
  const [boardsLoading, setBoardsLoading] = useState(false)

  useEffect(() => {
    if (scope !== 'local') return
    if (!subgraphConfigured()) {
      setLocalArea(null)
      setTsMap(null)
      return
    }
    let cancelled = false
    setBoardsLoading(true)
    Promise.all([fetchAreaLeaderboard(homeMapId), fetchPixelTimestamps(homeMapId)])
      .then(([area, ts]) => {
        if (cancelled) return
        setLocalArea(area)
        setTsMap(ts)
        setBoardsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('leaderboard subgraph read failed, using snapshot/address tie-break', err)
        setLocalArea(null)
        setTsMap(null)
        setBoardsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [scope, homeMapId])

  const enrichedSnapshot = useMemo(() => {
    if (!tsMap) return localSnapshot
    return {
      ...localSnapshot,
      pixels: localSnapshot.pixels.map((p) =>
        tsMap.has(p.id) ? { ...p, acquiredAt: tsMap.get(p.id) } : p,
      ),
    }
  }, [localSnapshot, tsMap])

  const localBoards = useMemo<BoardSet>(() => {
    const { biggestConnectedArea, mostExpensivePixel } = allLeaderboards(
      enrichedSnapshot,
      Number.MAX_SAFE_INTEGER,
    )
    // AREA from the subgraph (payout-consistent); snapshot AREA as a fallback.
    const areaEntries =
      localArea ?? leaderboardMostPixels(enrichedSnapshot, Number.MAX_SAFE_INTEGER)
    const area = decorate(areaEntries, 'px', (v) => String(v), profilesMap)
    const empire = decorate(biggestConnectedArea, 'px', (v) => String(v), profilesMap)
    const tycoons = decorate(
      mostExpensivePixel,
      'USDT',
      formatUSDTFromNumber,
      profilesMap,
    )
    // Local boards are never truncated, so the viewer is locatable at any
    // rank straight from the ranked entries.
    const you: BoardYou = viewer
      ? {
          area: toYou(rankGap(areaEntries, viewer), area, 'px', String, viewer, profilesMap),
          empire: toYou(rankGap(biggestConnectedArea, viewer), empire, 'px', String, viewer, profilesMap),
          tycoons: toYou(rankGap(mostExpensivePixel, viewer), tycoons, 'USDT', formatUSDTFromNumber, viewer, profilesMap),
        }
      : NO_YOU
    return { area, empire, tycoons, loading: boardsLoading, you }
  }, [enrichedSnapshot, localArea, profilesMap, viewer, boardsLoading])

  // --- Global path -------------------------------------------------------
  // The cross-map board is computed server-side (/api/global-board) — reading
  // every map's full pixel state from the phone was unreliable on MiniPay's
  // RPC. The client just fetches the ranked entries and decorates them.
  interface GlobalRaw {
    area: LeaderEntry[]
    empire: LeaderEntry[]
    tycoons: LeaderEntry[]
    /**
     * On-chain profiles keyed by lowercased address, resolved server-side (the
     * global board's addresses span multiple map contracts, so the client can't
     * read them itself the way the local board does).
     */
    profiles?: Record<string, OwnerProfileData>
    /** Server-located standing for `viewer` (works below the top-N cutoff). */
    you?: {
      area: RankGap | null
      empire: RankGap | null
      tycoons: RankGap | null
    }
  }
  const [globalRaw, setGlobalRaw] = useState<GlobalRaw | null>(null)
  const [globalLoading, setGlobalLoading] = useState(false)

  useEffect(() => {
    if (scope !== 'global') return
    let cancelled = false

    setGlobalLoading(true)
    // The endpoint truncates its boards, so the viewer's standing is located
    // server-side (from the untruncated ranking) and returned alongside.
    const url = viewer
      ? `/api/global-board?address=${encodeURIComponent(viewer)}`
      : '/api/global-board'
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setGlobalRaw({
          area: d.area ?? [],
          empire: d.empire ?? [],
          tycoons: d.tycoons ?? [],
          profiles: d.profiles,
          you: d.you,
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
  }, [scope, viewer])

  const globalBoards = useMemo<BoardSet>(() => {
    // Treat "haven't fetched yet" as loading too, so the first fetch reads as
    // loading rather than flashing the empty "no claims yet" state.
    const stillLoading = globalLoading || globalRaw === null
    if (!globalRaw) {
      return { area: [], empire: [], tycoons: [], loading: stillLoading, you: NO_YOU }
    }
    // Global-board names come from the API (the prop `profilesMap` only covers
    // the currently-loaded single map, so it can't name cross-map addresses).
    const globalProfiles = new Map<string, OwnerProfileData>(
      Object.entries(globalRaw.profiles ?? {}),
    )
    // Global AREA is the raw total pixels owned across all maps (px) — matching
    // the local board and EMPIRE, not a territory-share percentage.
    const area = decorate(globalRaw.area, 'px', (v) => String(v), globalProfiles)
    const empire = decorate(globalRaw.empire, 'px', (v) => String(v), globalProfiles)
    const tycoons = decorate(
      globalRaw.tycoons,
      'USDT',
      formatUSDTFromNumber,
      globalProfiles,
    )
    // Prefer the server-located standing (untruncated ranking); fall back to
    // scanning the truncated entries so an older API response still pins the
    // viewer when they happen to sit inside the top-N.
    const you: BoardYou = viewer
      ? {
          area: toYou(
            globalRaw.you?.area ?? rankGap(globalRaw.area, viewer),
            area, 'px', String, viewer, globalProfiles,
          ),
          empire: toYou(
            globalRaw.you?.empire ?? rankGap(globalRaw.empire, viewer),
            empire, 'px', String, viewer, globalProfiles,
          ),
          tycoons: toYou(
            globalRaw.you?.tycoons ?? rankGap(globalRaw.tycoons, viewer),
            tycoons, 'USDT', formatUSDTFromNumber, viewer, globalProfiles,
          ),
        }
      : NO_YOU
    return { area, empire, tycoons, loading: stillLoading, you }
  }, [globalRaw, globalLoading, viewer])

  return scope === 'global' ? globalBoards : localBoards
}
