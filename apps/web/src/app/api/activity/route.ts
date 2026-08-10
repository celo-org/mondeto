import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import {
  subgraphConfigured,
  fetchRecentBatches,
  fetchProfilesFor,
} from '@/lib/subgraph'
import { decodeBytes } from '@/lib/decodeBytes'
import type { MapId } from '@/lib/maps/types'

/**
 * Recent-purchase feed for one map — the data behind the on-map activity toast.
 *
 * Thin cached proxy over the Goldsky subgraph (`apps/subgraph`), reusing the
 * shared client in `lib/subgraph.ts`. Like `/api/pnl` and `/api/analytics`, it
 * is gated on `subgraphConfigured()`: when `NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL`
 * is unset the route returns an empty feed, so the toast layer simply stays
 * quiet until the subgraph URL is configured — no separate env var.
 *
 * Returns raw, presentation-free rows (mirrors the other data routes). The
 * client (`useActivityFeed`) turns `buyer` + `label`/`color` into a display
 * name and hue and formats `totalCost` (already 6-dec microcents).
 */

export const dynamic = 'force-dynamic'

const CACHE_TTL_MS = 8_000
const BATCH_LIMIT = 15

interface ActivityBatch {
  id: string
  buyer: string
  pixelCount: number
  /** Batch total in 6-dec microcents, as a string (formatUSDT-ready). */
  totalCost: string
  timestamp: string
  txHash: string
  /** Decoded on-chain profile label for this map; null when unset. */
  label: string | null
  /** uint24 RGB profile color; 0 when unset (client falls back to a hue). */
  color: number
}

interface ActivityPayload {
  batches: ActivityBatch[]
  fetchedAt: number
}

// Warm-instance cache, keyed by map. Vercel may run several instances, each
// with its own copy — acceptable for a low-stakes activity feed.
const cache = new Map<number, { ts: number; payload: ActivityPayload }>()

const EMPTY: ActivityPayload = { batches: [], fetchedAt: 0 }

async function loadActivity(mapId: MapId): Promise<ActivityPayload> {
  const rows = await fetchRecentBatches(mapId, BATCH_LIMIT)

  const addrs = Array.from(new Set(rows.map((r) => r.buyer.toLowerCase())))
  const profiles = await fetchProfilesFor(mapId, addrs)
  const profileByAddr = new Map(profiles.map((p) => [p.address.toLowerCase(), p]))

  const batches: ActivityBatch[] = rows.map((r) => {
    const profile = profileByAddr.get(r.buyer.toLowerCase())
    const decoded = profile ? decodeBytes(profile.label).trim() : ''
    return {
      id: r.id,
      buyer: r.buyer.toLowerCase(),
      pixelCount: r.pixelCountInBatch,
      totalCost: r.totalCost,
      timestamp: r.timestamp,
      txHash: r.txHash,
      label: decoded.length > 0 ? decoded : null,
      color: profile?.color ?? 0,
    }
  })

  return { batches, fetchedAt: Date.now() }
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('mapId')
  const mapId = Number(raw)
  if (!Number.isInteger(mapId) || mapId < 0) {
    return NextResponse.json({ error: 'bad mapId' }, { status: 400 })
  }

  // Subgraph not configured — quietly serve an empty feed (fallback pattern).
  if (!subgraphConfigured()) {
    return NextResponse.json(
      { ...EMPTY, fetchedAt: Date.now() },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const now = Date.now()
  const hit = cache.get(mapId)
  if (hit && now - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json(hit.payload, {
      headers: { 'Cache-Control': 's-maxage=8, stale-while-revalidate=30' },
    })
  }

  try {
    const payload = await loadActivity(mapId as MapId)
    cache.set(mapId, { ts: now, payload })
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 's-maxage=8, stale-while-revalidate=30' },
    })
  } catch (err) {
    logger.error('activity feed read failed', { mapId, err: String(err) })
    // Serve last-good so a transient blip doesn't stall the feed.
    if (hit) {
      return NextResponse.json(hit.payload, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json(
      { ...EMPTY, fetchedAt: now },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
