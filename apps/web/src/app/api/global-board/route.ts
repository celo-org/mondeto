import { NextResponse } from 'next/server'
import { fallbackReadClient } from '@/lib/chain'
import { fetchGlobalSnapshots } from '@/lib/maps/snapshots'
import {
  allGlobalLeaderboards,
  leaderboardMostPixels,
  rankGap,
  type RankGap,
} from '@/lib/maps/leaderboards'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { getMapsForChain } from '@/lib/maps/contracts'
import { readRevealedMapIdsServer } from '@/lib/maps/reveals'
import { celo } from 'viem/chains'
import type { LeaderEntry, MapId } from '@/lib/maps/types'
import { logger } from '@/lib/logger'

/**
 * Server-side cross-map leaderboard.
 *
 * The global board has to read every map's full pixel state. Doing that on
 * the client meant ~8 heavy `getPixelBatch` reads from the phone, which on a
 * constrained RPC (MiniPay's injected provider) routinely failed and left the
 * board empty. Here the reads run on Vercel's network — fast, reliable — and
 * the phone fetches a small JSON of ranked entries instead.
 *
 * This is the lightweight stand-in for a full indexer: it still reads live
 * state per request (cached briefly in-memory), with no persistence or
 * historical queries. The Envio indexer remains the durable answer when we
 * need seasons / history / many maps.
 *
 * `?address=0x…` additionally returns `you` — the caller's rank + gap to the
 * rank above per board, located against the UNTRUNCATED ranking so a player
 * below the top-N still gets their standing. The full boards stay in the
 * warm-instance cache; the response ships only the top-N plus that one row.
 */

export const dynamic = 'force-dynamic'

const TOP_N = 100
const CACHE_TTL_MS = 30_000

interface FullBoards {
  area: LeaderEntry[]
  empire: LeaderEntry[]
  tycoons: LeaderEntry[]
}

interface BoardPayload {
  area: LeaderEntry[]
  empire: LeaderEntry[]
  tycoons: LeaderEntry[]
  rulers: Record<MapId, string | null>
  fetchedAt: number
}

interface YouPayload {
  area: RankGap | null
  empire: RankGap | null
  tycoons: RankGap | null
}

// Warm-instance cache so repeat requests within the TTL don't re-read every
// map. Vercel may run several instances, each with its own cache — fine.
// The full (untruncated) boards are kept alongside the trimmed payload so a
// per-address `you` lookup never triggers a re-read.
let cache: { ts: number; payload: BoardPayload; full: FullBoards } | null = null

function locateViewer(full: FullBoards, address: string): YouPayload {
  return {
    area: rankGap(full.area, address),
    empire: rankGap(full.empire, address),
    tycoons: rankGap(full.tycoons, address),
  }
}

function respond(
  payload: BoardPayload,
  full: FullBoards,
  address: string | null,
  cacheControl: string,
) {
  const body = address
    ? { ...payload, you: locateViewer(full, address) }
    : payload
  return NextResponse.json(body, { headers: { 'Cache-Control': cacheControl } })
}

export async function GET(request: Request) {
  const now = Date.now()
  const address = new URL(request.url).searchParams.get('address')

  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return respond(
      cache.payload,
      cache.full,
      address,
      's-maxage=30, stale-while-revalidate=60',
    )
  }

  try {
    const read = fallbackReadClient.readContract.bind(
      fallbackReadClient,
    ) as Parameters<typeof fetchAllPixelsFromContract>[0]

    // Aggregate only the currently-revealed maps (Edge Config / env / WORLD).
    const revealedIds = await readRevealedMapIdsServer()
    const maps = getMapsForChain(celo.id, revealedIds)
    const snapshots = await fetchGlobalSnapshots(read, maps)

    // Rank every owner (no limit) so viewer lookups below the top-N work;
    // the response payload trims to TOP_N.
    const { mostPixels, biggestConnectedArea, mostExpensivePixel } =
      allGlobalLeaderboards(snapshots, Number.MAX_SAFE_INTEGER)
    const full: FullBoards = {
      area: mostPixels,
      empire: biggestConnectedArea,
      tycoons: mostExpensivePixel,
    }

    const rulers: Record<MapId, string | null> = {}
    for (const snap of snapshots) {
      const top = leaderboardMostPixels(snap, 1)
      rulers[snap.meta.id] = top.length > 0 ? top[0].address.toLowerCase() : null
    }

    const payload: BoardPayload = {
      area: full.area.slice(0, TOP_N),
      empire: full.empire.slice(0, TOP_N),
      tycoons: full.tycoons.slice(0, TOP_N),
      rulers,
      fetchedAt: now,
    }
    cache = { ts: now, payload, full }

    return respond(payload, full, address, 's-maxage=30, stale-while-revalidate=60')
  } catch (err) {
    logger.error('global-board read failed', { err: String(err) })
    // Serve the last good payload if we have one, so a transient blip doesn't
    // blank the board.
    if (cache) {
      return respond(cache.payload, cache.full, address, 'no-store')
    }
    return NextResponse.json(
      { area: [], empire: [], tycoons: [], rulers: {}, fetchedAt: now, error: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
