import { NextResponse } from 'next/server'
import { blockAtTimestamp } from '@/lib/blockAtTimestamp'
import { netGainEntries, ownStanding, type OwnerStatsRow } from '@/lib/campaignBoard'
import { readCampaignForBoard } from '@/lib/campaign'
import { fetchOwnerStatsAtBlock, subgraphConfigured, subgraphHead } from '@/lib/subgraph'
import { logger } from '@/lib/logger'
import type { MapId } from '@/lib/maps/types'

/**
 * The CAMPAIGN board: who grew the most inside the running campaign's window.
 *
 * Server-side because resolving the window costs ~50 sequential RPC round
 * trips — a binary search per boundary — which must not run in a browser, and
 * because both block-pinned subgraph reads page up to the `skip` ceiling.
 *
 * Returns `board: null` rather than an error when no campaign is running. That
 * is the normal state, not a failure: campaigns run on selected days, so the
 * client renders its "no active campaign" state from this.
 */

export const dynamic = 'force-dynamic'
// Two binary searches plus two paged subgraph reads. Comfortably inside this,
// and well past the 10s default.
export const maxDuration = 60

const CACHE_TTL_MS = 30_000

interface BoardPayload {
  campaignId: string
  /** Ranked, `netGain > 0` only. */
  entries: { address: string; value: number; tiebreak?: number }[]
  fromBlock: string
  toBlock: string
  /** Echoed so the client can label the window it is showing. */
  startsAt: string
  endsAt: string
  /** The window has closed; this ranking is what the payout settles against. */
  settled: boolean
}

interface CampaignBoardResponse {
  /** Null when no campaign is running — the expected state most days. */
  board: BoardPayload | null
  /** The caller's own movement, present even when they don't rank. */
  you: { netGain: number; ranks: boolean } | null
  /**
   * The board couldn't be computed, as distinct from nothing running.
   *
   * A cold miss costs ~50 sequential unretried `getBlock` calls plus two paged
   * subgraph reads, so a single hiccup is enough. Collapsing that into the
   * between-campaigns state tells players there is no campaign during one —
   * the same class of wrong as the payout confusion the FAQ rewrite fixed.
   */
  error?: true
}

const EMPTY: CampaignBoardResponse = { board: null, you: null }
const FAILED: CampaignBoardResponse = { board: null, you: null, error: true }

/**
 * Per (campaignId, mapId) warm-instance cache.
 *
 * The two pinned reads are kept next to the board they produced so a viewer's
 * own standing can be derived on a cache hit without re-querying. The board is
 * identical for everyone; only `you` varies, so the viewer is deliberately not
 * part of the key.
 */
const cache = new Map<
  string,
  { ts: number; board: BoardPayload; startRows: OwnerStatsRow[]; endRows: OwnerStatsRow[] }
>()

function respond(
  entry: { board: BoardPayload; startRows: OwnerStatsRow[]; endRows: OwnerStatsRow[] },
  viewer: string,
) {
  const you = /^0x[0-9a-f]{40}$/.test(viewer)
    ? ownStanding(viewer, entry.startRows, entry.endRows)
    : null
  return NextResponse.json(
    { board: entry.board, you } satisfies CampaignBoardResponse,
    { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } },
  )
}

/**
 * An arbitrary window, for exercising the board without scheduling a campaign
 * everyone can see.
 *
 * A real campaign lives in Edge Config and is read by every deployment sharing
 * that config, production included — so "just schedule a short one" is not a
 * test, it is a live campaign. This accepts `from` / `to` instead, and is
 * **ignored entirely on the production deployment**.
 *
 * Same gate as `app/dev/layout.tsx`: `VERCEL_ENV` is `'production'` only on the
 * prod URL, so previews and local keep it. The decision is made server-side, so
 * a client passing these params against production simply has them dropped.
 */
function windowOverride(url: URL): { startsAt: string; endsAt: string } | null {
  if (process.env.VERCEL_ENV === 'production') return null
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (!from || !to) return null
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return null
  return { startsAt: from, endsAt: to }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const mapId = (Number(url.searchParams.get('mapId') ?? '0') || 0) as MapId
  const viewer = (url.searchParams.get('address') ?? '').toLowerCase()

  if (!subgraphConfigured()) return NextResponse.json(EMPTY)

  const override = windowOverride(url)
  // A campaign missing either boundary cannot define a window, so it cannot be
  // ranked. `readCampaignForBoard` also keeps a just-finished campaign visible
  // for a grace period — the settled board is what the payout is computed
  // from, and hiding it at the buzzer means winners never see it.
  const resolved = override
    ? {
        campaign: { id: `preview-${override.startsAt}-${override.endsAt}`, mapId: undefined, ...override },
        settled: false,
      }
    : await readCampaignForBoard()
  if (!resolved) return NextResponse.json(EMPTY)
  const campaign = resolved.campaign
  if (!campaign.startsAt || !campaign.endsAt) return NextResponse.json(EMPTY)

  // A campaign targets one map. Without this a map-3 campaign lights a CAMPAIGN
  // board on all eight, ranking growth nobody is being paid for.
  if (campaign.mapId != null && campaign.mapId !== mapId) return NextResponse.json(EMPTY)

  const key = `${campaign.id}:${mapId}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return respond(hit, viewer)

  try {
    const startSec = BigInt(Math.floor(new Date(campaign.startsAt).getTime() / 1000))
    const endSec = BigInt(Math.floor(new Date(campaign.endsAt).getTime() / 1000))
    if (!(startSec < endSec)) {
      logger.warn('campaign window is empty or inverted', {
        campaignId: campaign.id,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
      })
      return NextResponse.json(EMPTY)
    }

    // No offset on either boundary. The admin's `resolveBlockNumber` returns
    // `blockAtTimestamp(t)` unmodified, and admin#51 defines the window as the
    // campaign's own start and end — so any offset here, however well meant,
    // ranks a different window than the payout pays. That is #48 reintroduced
    // one layer below the comparator.
    //
    // The earlier version subtracted ten blocks from both ends in the name of
    // reorg safety. On the start block that isn't reorg safety at all — a
    // running campaign's start is hours old and unreorganisable — it just let
    // ~10s of pre-campaign buys count as in-window gain. On the end it dropped
    // the final ~10s of the window, which is exactly where buzzer-beater
    // sniping lands and exactly the rows that flip a rank.
    //
    // Clamping the end to the subgraph's indexed head gives both guarantees at
    // once: never ahead of what the subgraph can answer, and never inside the
    // reorg-prone zone, since indexing necessarily trails chain head.
    const [fromBlock, endBlock, head] = await Promise.all([
      blockAtTimestamp(startSec),
      blockAtTimestamp(endSec),
      subgraphHead(),
    ])
    const toBlock = endBlock < head ? endBlock : head
    if (toBlock <= fromBlock) return NextResponse.json(EMPTY)

    const [startRows, endRows] = await Promise.all([
      fetchOwnerStatsAtBlock(mapId, Number(fromBlock)),
      fetchOwnerStatsAtBlock(mapId, Number(toBlock)),
    ])

    const entry = {
      ts: Date.now(),
      board: {
        campaignId: campaign.id,
        entries: netGainEntries(startRows, endRows),
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        settled: resolved.settled,
      },
      startRows,
      endRows,
    }
    cache.set(key, entry)
    return respond(entry, viewer)
  } catch (err) {
    logger.error('failed to compute campaign board', {
      err: String(err),
      mapId,
      campaignId: campaign.id,
    })
    // Stale beats empty: a board that is 30s old still ranks correctly.
    if (hit) return respond(hit, viewer)
    return NextResponse.json(FAILED)
  }
}
