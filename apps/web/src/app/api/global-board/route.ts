import { NextResponse } from 'next/server'
import { fallbackReadClient } from '@/lib/chain'
import { fetchGlobalSnapshots } from '@/lib/maps/snapshots'
import {
  allGlobalLeaderboards,
  compareLeaderEntries,
  leaderboardMostPixels,
  rankGap,
  type RankGap,
} from '@/lib/maps/leaderboards'
import {
  fetchAreaLeaderboard,
  fetchPixelTimestamps,
  subgraphConfigured,
} from '@/lib/subgraph'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { getMapsForChain } from '@/lib/maps/contracts'
import { readRevealedMapIdsServer } from '@/lib/maps/reveals'
import { MONDETO_ABI } from '@/lib/contract'
import { decodeBytes } from '@/lib/decodeBytes'
import { uint24ToHex } from '@/lib/colorUtils'
import { celo } from 'viem/chains'
import type { MapContract } from '@/lib/maps/contracts'
import type { Address, LeaderEntry, MapId, MapSnapshot } from '@/lib/maps/types'
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
// Profile reads are batched so a map with hundreds of owners doesn't fan out
// into hundreds of simultaneous RPC calls.
const PROFILE_BATCH = 20

interface FullBoards {
  area: LeaderEntry[]
  empire: LeaderEntry[]
  tycoons: LeaderEntry[]
}

interface OwnerProfile {
  label: string
  url: string
  color: string
}

interface BoardPayload {
  area: LeaderEntry[]
  empire: LeaderEntry[]
  tycoons: LeaderEntry[]
  rulers: Record<MapId, string | null>
  /**
   * On-chain profile data keyed by lowercased address, for the addresses that
   * appear in the trimmed top-N boards (plus the requested viewer). Resolved
   * server-side because reading many `profiles()` from a phone on MiniPay's RPC
   * is unreliable — the same reason the board itself is computed here.
   */
  profiles: Record<string, OwnerProfile>
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
// per-address `you` lookup never triggers a re-read. `maps` (the revealed
// contracts) rides along so a warm-cache request can still resolve a viewer's
// name on demand when they sit below the pre-resolved top-N.
let cache: {
  ts: number
  payload: BoardPayload
  full: FullBoards
  maps: MapContract[]
} | null = null

/**
 * Enrich each map's snapshot pixels with their owner-acquisition time (subgraph
 * `Pixel.lastSoldAt`, keyed by pixel id) so every board breaks value ties by who
 * reached their standing first. Mutates in place — the snapshots are freshly
 * built per request. No-op on any map whose timestamp read fails.
 */
async function enrichSnapshotsWithTimestamps(
  snapshots: MapSnapshot[],
): Promise<void> {
  const tsMaps = await Promise.all(
    snapshots.map((s) => fetchPixelTimestamps(s.meta.id)),
  )
  snapshots.forEach((snap, i) => {
    const ts = tsMaps[i]
    for (const p of snap.pixels) {
      const t = ts.get(p.id)
      if (t != null) p.acquiredAt = t
    }
  })
}

/**
 * Cross-map AREA board from the subgraph's `OwnerMapStat`: sum each wallet's
 * per-map pixelCount across the revealed maps, tie-broken by `lastGainAt` (the
 * latest across their maps — reached-first). Sourced from the subgraph (not the
 * snapshot) so AREA matches the payout snapshot exactly (celo-org/mondeto-admin#48).
 */
async function subgraphGlobalArea(mapIds: MapId[]): Promise<LeaderEntry[]> {
  const boards = await Promise.all(mapIds.map((id) => fetchAreaLeaderboard(id)))
  const value = new Map<Address, number>()
  const reachedAt = new Map<Address, number>()
  for (const board of boards) {
    for (const e of board) {
      value.set(e.address, (value.get(e.address) ?? 0) + e.value)
      const t = e.tiebreak ?? 0
      reachedAt.set(e.address, Math.max(reachedAt.get(e.address) ?? 0, t))
    }
  }
  return [...value.entries()]
    .map(([address, v]) => ({ address, value: v, tiebreak: reachedAt.get(address) }))
    .sort(compareLeaderEntries)
}

function locateViewer(full: FullBoards, address: string): YouPayload {
  return {
    area: rankGap(full.area, address),
    empire: rankGap(full.empire, address),
    tycoons: rankGap(full.tycoons, address),
  }
}

/**
 * Read `profiles(addr)` for a set of owners from one map contract, batched to
 * bound RPC fan-out. Returns a map keyed by lowercased address; addresses whose
 * read fails are simply omitted (they fall back to a generated name client-side).
 */
async function readProfiles(
  contract: `0x${string}`,
  owners: string[],
): Promise<Record<string, OwnerProfile>> {
  const out: Record<string, OwnerProfile> = {}
  for (let i = 0; i < owners.length; i += PROFILE_BATCH) {
    const batch = owners.slice(i, i + PROFILE_BATCH)
    const results = await Promise.allSettled(
      batch.map((addr) =>
        fallbackReadClient.readContract({
          address: contract,
          abi: MONDETO_ABI,
          functionName: 'profiles',
          args: [addr as `0x${string}`],
        }),
      ),
    )
    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      if (r.status !== 'fulfilled' || !r.value) continue
      const [color, labelBytes, urlBytes] = r.value as unknown as [
        number,
        unknown,
        unknown,
      ]
      out[batch[j].toLowerCase()] = {
        label: decodeBytes(labelBytes),
        url: decodeBytes(urlBytes),
        color: color ? uint24ToHex(color) : '',
      }
    }
  }
  return out
}

/**
 * Resolve on-chain profiles for the addresses in `needed`. Profiles live on the
 * map contract where a wallet transacted, so each address is read from the
 * map(s) where it owns pixels; when a wallet has names on more than one map the
 * first non-empty label wins.
 */
async function resolveProfiles(
  snapshots: MapSnapshot[],
  maps: MapContract[],
  needed: Set<string>,
): Promise<Record<string, OwnerProfile>> {
  const addrByMap = new Map<MapId, `0x${string}`>()
  for (const m of maps) addrByMap.set(m.id, m.address)

  const merged: Record<string, OwnerProfile> = {}
  for (const snap of snapshots) {
    const contract = addrByMap.get(snap.meta.id)
    if (!contract) continue
    const owners = new Set<string>()
    for (const px of snap.pixels) {
      if (!px.owner) continue
      const lower = px.owner.toLowerCase()
      if (needed.has(lower)) owners.add(lower)
    }
    if (owners.size === 0) continue
    const resolved = await readProfiles(contract, [...owners])
    for (const [addr, profile] of Object.entries(resolved)) {
      const existing = merged[addr]
      // First non-empty label wins across maps; otherwise keep the first hit so
      // an on-chain color still lands even when no label is set.
      if (!existing || (!existing.label && profile.label)) merged[addr] = profile
    }
  }
  return merged
}

/**
 * Ensure the requested viewer has a resolved profile. A viewer below the
 * pre-resolved top-N (or one hitting a warm cache built by a different address)
 * won't be in `profiles`; read their name from the revealed maps on demand so
 * their pinned "you" row shows it.
 */
async function withViewerProfile(
  profiles: Record<string, OwnerProfile>,
  maps: MapContract[],
  address: string | null,
): Promise<Record<string, OwnerProfile>> {
  if (!address) return profiles
  const lower = address.toLowerCase()
  if (profiles[lower]?.label) return profiles
  let best: OwnerProfile | undefined = profiles[lower]
  for (const m of maps) {
    const resolved = await readProfiles(m.address, [lower])
    const p = resolved[lower]
    if (p && (!best || (!best.label && p.label))) best = p
    if (best?.label) break
  }
  return best ? { ...profiles, [lower]: best } : profiles
}

/** Addresses appearing in the trimmed top-N across all three boards. */
function topNAddresses(payload: BoardPayload): Set<string> {
  const set = new Set<string>()
  for (const board of [payload.area, payload.empire, payload.tycoons]) {
    for (const e of board) set.add(e.address.toLowerCase())
  }
  return set
}

async function respond(
  payload: BoardPayload,
  full: FullBoards,
  maps: MapContract[],
  address: string | null,
  cacheControl: string,
) {
  const profiles = await withViewerProfile(payload.profiles, maps, address)
  const base = { ...payload, profiles }
  const body = address ? { ...base, you: locateViewer(full, address) } : base
  return NextResponse.json(body, { headers: { 'Cache-Control': cacheControl } })
}

export async function GET(request: Request) {
  const now = Date.now()
  const address = new URL(request.url).searchParams.get('address')

  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return respond(
      cache.payload,
      cache.full,
      cache.maps,
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

    // EMPIRE/TYCOONS break ties by per-pixel acquisition time (exact), so enrich
    // the snapshots first. AREA instead comes from the subgraph's OwnerMapStat
    // (pixelCount + lastGainAt) so it matches the payout snapshot. Both are
    // best-effort: on failure (or subgraph unset) they fall back to the snapshot
    // with the address tie-break.
    if (subgraphConfigured()) {
      try {
        await enrichSnapshotsWithTimestamps(snapshots)
      } catch (err) {
        logger.warn('global-board timestamp enrich failed, using address tie-break', {
          err: String(err),
        })
      }
    }

    // Rank every owner (no limit) so viewer lookups below the top-N work;
    // the response payload trims to TOP_N.
    const { mostPixels, biggestConnectedArea, mostExpensivePixel } =
      allGlobalLeaderboards(snapshots, Number.MAX_SAFE_INTEGER)
    let areaBoard = mostPixels
    if (subgraphConfigured()) {
      try {
        areaBoard = await subgraphGlobalArea(maps.map((m) => m.id))
      } catch (err) {
        logger.warn('global-board AREA subgraph read failed, using snapshot', {
          err: String(err),
        })
      }
    }
    const full: FullBoards = {
      area: areaBoard,
      empire: biggestConnectedArea,
      tycoons: mostExpensivePixel,
    }

    const rulers: Record<MapId, string | null> = {}
    for (const snap of snapshots) {
      const top = leaderboardMostPixels(snap, 1)
      rulers[snap.meta.id] = top.length > 0 ? top[0].address.toLowerCase() : null
    }

    const area = full.area.slice(0, TOP_N)
    const empire = full.empire.slice(0, TOP_N)
    const tycoons = full.tycoons.slice(0, TOP_N)

    // Resolve on-chain names only for the addresses actually shown (top-N of
    // each board, plus the viewer). Bounded to a few hundred reads on Vercel's
    // network — far cheaper and more reliable than doing them on the phone.
    const needed = new Set<string>()
    for (const board of [area, empire, tycoons]) {
      for (const e of board) needed.add(e.address.toLowerCase())
    }
    if (address) needed.add(address.toLowerCase())
    const profiles = await resolveProfiles(snapshots, maps, needed)

    const payload: BoardPayload = {
      area,
      empire,
      tycoons,
      rulers,
      profiles,
      fetchedAt: now,
    }
    cache = { ts: now, payload, full, maps }

    return respond(payload, full, maps, address, 's-maxage=30, stale-while-revalidate=60')
  } catch (err) {
    logger.error('global-board read failed', { err: String(err) })
    // Serve the last good payload if we have one, so a transient blip doesn't
    // blank the board.
    if (cache) {
      return respond(cache.payload, cache.full, cache.maps, address, 'no-store')
    }
    return NextResponse.json(
      { area: [], empire: [], tycoons: [], rulers: {}, profiles: {}, fetchedAt: now, error: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
