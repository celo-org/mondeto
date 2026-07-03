import { NextResponse } from 'next/server'
import { fallbackReadClient } from '@/lib/chain'
import { fetchGlobalSnapshots } from '@/lib/maps/snapshots'
import {
  allGlobalLeaderboards,
  leaderboardMostPixels,
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
 * need seasons / history / many maps (see docs/leaderboard-rewards-roadmap).
 */

export const dynamic = 'force-dynamic'

const TOP_N = 100
const CACHE_TTL_MS = 30_000

interface BoardPayload {
  area: LeaderEntry[]
  empire: LeaderEntry[]
  tycoons: LeaderEntry[]
  rulers: Record<MapId, string | null>
  fetchedAt: number
}

// Warm-instance cache so repeat requests within the TTL don't re-read every
// map. Vercel may run several instances, each with its own cache — fine.
let cache: { ts: number; payload: BoardPayload } | null = null

export async function GET() {
  const now = Date.now()
  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.payload, {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
    })
  }

  try {
    const read = fallbackReadClient.readContract.bind(
      fallbackReadClient,
    ) as Parameters<typeof fetchAllPixelsFromContract>[0]

    // Aggregate only the currently-revealed maps (Edge Config / env / WORLD).
    const revealedIds = await readRevealedMapIdsServer()
    const maps = getMapsForChain(celo.id, revealedIds)
    const snapshots = await fetchGlobalSnapshots(read, maps)

    const { mostPixels, biggestConnectedArea, mostExpensivePixel } =
      allGlobalLeaderboards(snapshots, TOP_N)

    const rulers: Record<MapId, string | null> = {}
    for (const snap of snapshots) {
      const top = leaderboardMostPixels(snap, 1)
      rulers[snap.meta.id] = top.length > 0 ? top[0].address.toLowerCase() : null
    }

    const payload: BoardPayload = {
      area: mostPixels,
      empire: biggestConnectedArea,
      tycoons: mostExpensivePixel,
      rulers,
      fetchedAt: now,
    }
    cache = { ts: now, payload }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
    })
  } catch (err) {
    logger.error('global-board read failed', { err: String(err) })
    // Serve the last good payload if we have one, so a transient blip doesn't
    // blank the board.
    if (cache) {
      return NextResponse.json(cache.payload, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    return NextResponse.json(
      { area: [], empire: [], tycoons: [], rulers: {}, fetchedAt: now, error: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
