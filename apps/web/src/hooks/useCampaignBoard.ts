'use client'

import { useEffect, useState } from 'react'
import type { LeaderboardEntry, OwnerProfileData, YouStanding } from '@/hooks/useLeaderboard'
import { generateUsername } from '@/lib/username'
import type { MapId } from '@/lib/maps/types'

/**
 * The CAMPAIGN board.
 *
 * Unlike AREA, EMPIRE and TYCOONS, this one is not derivable from the pixel
 * snapshot the client already holds: it needs two block-pinned subgraph reads
 * and a binary search per window boundary. So it comes from
 * `/api/campaign-board` rather than from `useLeaderboard`, and lives in its own
 * hook instead of being bolted onto that one.
 *
 * `board === null` is the ordinary case, not an error. Campaigns run on
 * selected days (see the FAQ), so most of the time there is nothing running and
 * the tab renders its between-campaigns state from this.
 */

export interface CampaignBoard {
  campaignId: string
  entries: LeaderboardEntry[]
  /** ISO strings for the window being shown. */
  startsAt: string
  endsAt: string
}

export interface CampaignBoardResult {
  board: CampaignBoard | null
  /** The viewer's own movement, present even when they don't rank. */
  you: YouStanding | null
  /**
   * The viewer's net movement, which is negative when they were raided and
   * therefore absent from `board.entries`. Separate from `you` because a
   * non-ranking wallet has no rank to build a standing from.
   */
  yourNetGain: number | null
  loading: boolean
}

const EMPTY: CampaignBoardResult = { board: null, you: null, yourNetGain: null, loading: false }

interface ApiEntry {
  address: string
  value: number
}

interface ApiResponse {
  board: {
    campaignId: string
    entries: ApiEntry[]
    startsAt: string
    endsAt: string
  } | null
  you: { netGain: number; ranks: boolean } | null
}

/** Growth is always whole pixels, so it renders with an explicit sign. */
function formatGain(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

/**
 * An explicit window, forwarded from `?from=`/`?to=` on the page.
 *
 * Passed blindly: the route drops these on the production deployment, so this
 * cannot conjure a campaign for real players. It exists so the board can be
 * exercised on a preview without scheduling one in Edge Config, which every
 * deployment — production included — would then show.
 */
export interface PreviewWindow {
  from: string
  to: string
}

export function useCampaignBoard(
  mapId: MapId,
  viewer?: string,
  profilesMap?: Map<string, OwnerProfileData>,
  previewWindow?: PreviewWindow | null,
): CampaignBoardResult {
  const [result, setResult] = useState<CampaignBoardResult>({ ...EMPTY, loading: true })
  const from = previewWindow?.from
  const to = previewWindow?.to

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ mapId: String(mapId) })
    if (viewer) params.set('address', viewer)
    if (from && to) {
      params.set('from', from)
      params.set('to', to)
    }

    fetch(`/api/campaign-board?${params}`)
      .then((r) => (r.ok ? (r.json() as Promise<ApiResponse>) : Promise.reject(r.status)))
      .then((data) => {
        if (cancelled) return
        if (!data.board) {
          setResult({ ...EMPTY, yourNetGain: data.you?.netGain ?? null })
          return
        }

        const entries: LeaderboardEntry[] = data.board.entries.map((e, i) => {
          const profile = profilesMap?.get(e.address.toLowerCase())
          return {
            rank: i + 1,
            owner: e.address,
            label: profile?.label || generateUsername(e.address),
            url: profile?.url ?? '',
            color: profile?.color ?? '',
            value: formatGain(e.value),
            unit: 'PX',
          }
        })

        // Only a ranking wallet has a row. A raided one is reported through
        // `yourNetGain` instead, so the UI can say why they aren't listed
        // rather than letting them silently vanish.
        const viewerLower = viewer?.toLowerCase()
        const mine = viewerLower
          ? entries.find((e) => e.owner.toLowerCase() === viewerLower)
          : undefined
        const above = mine && mine.rank > 1 ? entries[mine.rank - 2] : undefined
        const gap =
          mine && above ? Number(above.value.replace('+', '')) - Number(mine.value.replace('+', '')) : null

        setResult({
          board: {
            campaignId: data.board.campaignId,
            entries,
            startsAt: data.board.startsAt,
            endsAt: data.board.endsAt,
          },
          you: mine ? { entry: mine, gap, gapValue: gap === null ? null : String(gap) } : null,
          yourNetGain: data.you?.netGain ?? null,
          loading: false,
        })
      })
      .catch(() => {
        // The map is the product; a missing campaign board is not worth an
        // error state. Falls back to the between-campaigns rendering.
        if (!cancelled) setResult(EMPTY)
      })

    return () => {
      cancelled = true
    }
  }, [mapId, viewer, profilesMap, from, to])

  return result
}
