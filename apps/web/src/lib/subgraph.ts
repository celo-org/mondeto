/**
 * Goldsky subgraph client + typed queries.
 *
 * The subgraph (apps/subgraph) is the durable source for earn/spend, the AREA
 * leaderboard (with the "who reached the count first" tie-break), and per-map
 * analytics. Everything here is gated on NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL being
 * set: when it isn't (e.g. a preview build before the subgraph is deployed),
 * callers fall back to the existing live-read path, so behaviour is unchanged
 * until the URL is configured.
 *
 * NEXT_PUBLIC_* is inlined at build time, so setting/changing the URL in Vercel
 * needs a redeploy. The endpoint is public/read-only — no API key here.
 *
 * Money fields come back as 6-decimal "microcent" decimal strings (the unit
 * `formatUSDT` renders), matching the old /api/pnl + /api/analytics output.
 */
import type { Address, LeaderEntry, MapId } from '@/lib/maps/types'
import { compareLeaderEntries } from '@/lib/maps/leaderboards'

const ENDPOINT = process.env.NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL

/** True when the subgraph URL is configured; callers fall back otherwise. */
export function subgraphConfigured(): boolean {
  return typeof ENDPOINT === 'string' && ENDPOINT.length > 0
}

/** Low-level GraphQL POST. Throws on transport/HTTP/GraphQL errors. */
export async function querySubgraph<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  if (!ENDPOINT) throw new Error('NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL is not set')
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`subgraph HTTP ${res.status}`)
  const json = (await res.json()) as { data?: T; errors?: unknown }
  if (json.errors) throw new Error(`subgraph error: ${JSON.stringify(json.errors)}`)
  if (!json.data) throw new Error('subgraph returned no data')
  return json.data
}

/* ------------------------------------------------------------------ *
 * Earn / spend (P&L)
 * ------------------------------------------------------------------ */

export interface OwnerPnl {
  /** Gross spend on this map, 6-dec microcents. */
  spent: string
  /** Earnings on this map, 6-dec microcents. */
  earned: string
}

// `ownerMapStat` (singular, by id) — the plural query is `ownerMapStats`.
const PNL_QUERY = `
  query Pnl($id: ID!) {
    ownerMapStat(id: $id) {
      totalSpent
      totalEarned
    }
  }
`

/** Earn/spend for one wallet on one map. Zeroes when the wallet has no row. */
export async function fetchOwnerMapPnl(
  mapId: MapId,
  address: string,
): Promise<OwnerPnl> {
  const id = `${mapId}-${address.toLowerCase()}`
  const data = await querySubgraph<{
    ownerMapStat: { totalSpent: string; totalEarned: string } | null
  }>(PNL_QUERY, { id })
  const row = data.ownerMapStat
  return {
    spent: row?.totalSpent ?? '0',
    earned: row?.totalEarned ?? '0',
  }
}

// Global Owner (across all maps) — the wallet's lifetime spend/earn.
const OWNER_PNL_QUERY = `
  query OwnerPnl($id: ID!) {
    owner(id: $id) {
      totalSpent
      totalEarned
    }
  }
`

/**
 * Lifetime earn/spend for a wallet across EVERY map (the global Owner entity).
 * This is the "all lifetime since launch" figure the profile shows.
 */
export async function fetchOwnerPnl(address: string): Promise<OwnerPnl> {
  const data = await querySubgraph<{
    owner: { totalSpent: string; totalEarned: string } | null
  }>(OWNER_PNL_QUERY, { id: address.toLowerCase() })
  const row = data.owner
  return {
    spent: row?.totalSpent ?? '0',
    earned: row?.totalEarned ?? '0',
  }
}

/* ------------------------------------------------------------------ *
 * AREA leaderboard (pixel count, tie-broken by who reached it first)
 * ------------------------------------------------------------------ */

// The Graph caps `skip` at 5000; page in 1000s up to that. Owners-with-pixels
// per map is well under this in practice, so this covers the full board.
const PAGE = 1000
const MAX_SKIP = 5000

interface AreaRow {
  address: string
  pixelCount: number
  lastGainAt: string
}

function toEntries(rows: AreaRow[]): LeaderEntry[] {
  return rows.map((r) => ({
    address: r.address.toLowerCase() as Address,
    value: r.pixelCount,
    // Earlier lastGainAt ranks higher on a value tie (reached the count first).
    tiebreak: Number(r.lastGainAt),
  }))
}

const LOCAL_AREA_QUERY = `
  query AreaLocal($mapId: Int!, $first: Int!, $skip: Int!) {
    ownerMapStats(
      where: { mapId: $mapId, pixelCount_gt: 0 }
      orderBy: pixelCount
      orderDirection: desc
      first: $first
      skip: $skip
    ) {
      address
      pixelCount
      lastGainAt
    }
  }
`

const GLOBAL_AREA_QUERY = `
  query AreaGlobal($first: Int!, $skip: Int!) {
    owners(
      where: { pixelCount_gt: 0 }
      orderBy: pixelCount
      orderDirection: desc
      first: $first
      skip: $skip
    ) {
      address
      pixelCount
      lastGainAt
    }
  }
`

/**
 * The per-map AREA leaderboard, fully ranked with the time tie-break applied.
 * `mapId` for a single map, or `'global'` for the cross-map total (Owner).
 */
export async function fetchAreaLeaderboard(
  scope: MapId | 'global',
): Promise<LeaderEntry[]> {
  const rows: AreaRow[] = []
  for (let skip = 0; skip <= MAX_SKIP; skip += PAGE) {
    const vars =
      scope === 'global'
        ? { first: PAGE, skip }
        : { mapId: scope, first: PAGE, skip }
    const data = await querySubgraph<{ ownerMapStats?: AreaRow[]; owners?: AreaRow[] }>(
      scope === 'global' ? GLOBAL_AREA_QUERY : LOCAL_AREA_QUERY,
      vars,
    )
    const page = (scope === 'global' ? data.owners : data.ownerMapStats) ?? []
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return toEntries(rows).sort(compareLeaderEntries)
}

/* ------------------------------------------------------------------ *
 * Per-pixel acquisition times (exact "reached it first" tie-break)
 * ------------------------------------------------------------------ */

const PIXEL_TS_QUERY = `
  query PixelTimestamps($mapId: Int!, $first: Int!, $skip: Int!) {
    pixels(where: { mapId: $mapId }, first: $first, skip: $skip) {
      pixelId
      lastSoldAt
    }
  }
`

/**
 * Map of pixelId → owner-acquisition time (unix seconds) for one map, so the
 * leaderboard can break EMPIRE/TYCOONS/AREA ties by who reached their standing
 * first. Keyed by the contract pixel id (y*width + x), which matches
 * `PixelState.id`. Paged (parallel) — bounded by the map's pixel count.
 */
export async function fetchPixelTimestamps(
  mapId: MapId,
): Promise<Map<number, number>> {
  const rows: Array<{ pixelId: string; lastSoldAt: string }> = []
  const first = await querySubgraph<{
    pixels: Array<{ pixelId: string; lastSoldAt: string }>
  }>(PIXEL_TS_QUERY, { mapId, first: PAGE, skip: 0 })
  rows.push(...(first.pixels ?? []))
  if ((first.pixels?.length ?? 0) === PAGE) {
    const skips: number[] = []
    for (let skip = PAGE; skip <= MAX_SKIP; skip += PAGE) skips.push(skip)
    const pages = await Promise.all(
      skips.map((skip) =>
        querySubgraph<{ pixels: Array<{ pixelId: string; lastSoldAt: string }> }>(
          PIXEL_TS_QUERY,
          { mapId, first: PAGE, skip },
        ).then((d) => d.pixels ?? []),
      ),
    )
    for (const page of pages) rows.push(...page)
  }
  const out = new Map<number, number>()
  for (const r of rows) out.set(Number(r.pixelId), Number(r.lastSoldAt))
  return out
}

/* ------------------------------------------------------------------ *
 * Owned pixels (for the profile's cross-map PIXELS + LAND VALUE)
 * ------------------------------------------------------------------ */

const OWNED_PIXELS_QUERY = `
  query OwnedPixels($mapId: Int!, $owner: Bytes!, $first: Int!, $skip: Int!) {
    pixels(where: { mapId: $mapId, owner: $owner }, first: $first, skip: $skip) {
      pixelId
    }
  }
`

/**
 * The pixel ids a wallet currently holds on one map (contract ids = y*width+x).
 *
 * Sourced from the subgraph so the profile never has to decode the whole
 * on-chain pixel batch (a heavy `getPixelBatch` read that fails on throttled
 * RPCs). The caller prices these with a small `selectionPrice(ids)` contract
 * call. Paged; bounded by the wallet's holdings on the map.
 */
export async function fetchOwnedPixelIds(
  mapId: MapId,
  address: string,
): Promise<number[]> {
  const owner = address.toLowerCase()
  const ids: number[] = []
  for (let skip = 0; skip <= MAX_SKIP; skip += PAGE) {
    const data = await querySubgraph<{ pixels: Array<{ pixelId: string }> }>(
      OWNED_PIXELS_QUERY,
      { mapId, owner, first: PAGE, skip },
    )
    const page = data.pixels ?? []
    for (const p of page) ids.push(Number(p.pixelId))
    if (page.length < PAGE) break
  }
  return ids
}

/* ------------------------------------------------------------------ *
 * Analytics
 * ------------------------------------------------------------------ */

export interface MapStatsRow {
  volumeAllTime: string
  txCountAllTime: number
  uniqueBuyers: number
  primaryProceeds: string
  resaleVolume: string
  feeRateBps: number
}

// `mapStat` (singular, by id) — the plural query is `mapStats`.
const MAP_STATS_QUERY = `
  query MapStatById($id: ID!) {
    mapStat(id: $id) {
      volumeAllTime
      txCountAllTime
      uniqueBuyers
      primaryProceeds
      resaleVolume
      feeRateBps
    }
  }
`

/** Per-map all-time analytics totals. Null when the map has no purchases yet. */
export async function fetchMapStats(mapId: MapId): Promise<MapStatsRow | null> {
  const data = await querySubgraph<{ mapStat: MapStatsRow | null }>(MAP_STATS_QUERY, {
    id: `${mapId}`,
  })
  return data.mapStat
}

export interface WindowBatch {
  buyer: string
  totalCost: string
  timestamp: string
}

const WINDOW_BATCHES_QUERY = `
  query WindowBatches($mapId: Int!, $since: BigInt!, $first: Int!, $skip: Int!) {
    purchaseBatches(
      where: { mapId: $mapId, timestamp_gte: $since }
      orderBy: timestamp
      orderDirection: desc
      first: $first
      skip: $skip
    ) {
      buyer
      totalCost
      timestamp
    }
  }
`

/**
 * All purchase batches on a map with timestamp >= `sinceTs` (unix seconds).
 * Paged; the route aggregates volume / tx count / distinct buyers for the
 * rolling 24h and 7d windows. Bounded and indexed — unlike the old log scan.
 */
export async function fetchBatchesSince(
  mapId: MapId,
  sinceTs: number,
): Promise<WindowBatch[]> {
  // Fetch the first page to learn whether we even need to paginate; if it's
  // full, fire the remaining pages in parallel (skip is capped at MAX_SKIP) so
  // a busy 7-day window (thousands of batches) is a few concurrent requests
  // rather than a slow sequential walk.
  const first = await querySubgraph<{ purchaseBatches: WindowBatch[] }>(
    WINDOW_BATCHES_QUERY,
    { mapId, since: String(sinceTs), first: PAGE, skip: 0 },
  )
  const out = [...(first.purchaseBatches ?? [])]
  if (out.length < PAGE) return out

  const skips: number[] = []
  for (let skip = PAGE; skip <= MAX_SKIP; skip += PAGE) skips.push(skip)
  const pages = await Promise.all(
    skips.map((skip) =>
      querySubgraph<{ purchaseBatches: WindowBatch[] }>(WINDOW_BATCHES_QUERY, {
        mapId,
        since: String(sinceTs),
        first: PAGE,
        skip,
      }).then((d) => d.purchaseBatches ?? []),
    ),
  )
  for (const page of pages) out.push(...page)
  return out
}

/* ------------------------------------------------------------------ *
 * Live activity feed (recent purchases)
 * ------------------------------------------------------------------ */

/** One recent purchase batch for the on-map activity toast. */
export interface ActivityBatchRow {
  /** `${txHash}-${logIndex}` — stable de-dupe key. */
  id: string
  /** Lowercase buyer address. */
  buyer: string
  pixelCountInBatch: number
  /** Batch total, 6-dec microcents (formatUSDT-ready). */
  totalCost: string
  /** Unix seconds. */
  timestamp: string
  txHash: string
}

const RECENT_BATCHES_QUERY = `
  query RecentBatches($mapId: Int!, $first: Int!) {
    purchaseBatches(
      where: { mapId: $mapId }
      orderBy: timestamp
      orderDirection: desc
      first: $first
    ) {
      id
      buyer
      pixelCountInBatch
      totalCost
      timestamp
      txHash
    }
  }
`

/** The most recent purchase batches on a map, newest first. */
export async function fetchRecentBatches(
  mapId: MapId,
  first: number,
): Promise<ActivityBatchRow[]> {
  const data = await querySubgraph<{ purchaseBatches: ActivityBatchRow[] }>(
    RECENT_BATCHES_QUERY,
    { mapId, first },
  )
  return data.purchaseBatches ?? []
}

/** A profile row for feed enrichment. `label` is raw bytes (decode with `decodeBytes`). */
export interface ActivityProfileRow {
  address: string
  label: string
  color: number
}

const ACTIVITY_PROFILES_QUERY = `
  query ActivityProfiles($mapId: Int!, $addrs: [Bytes!]!) {
    ownerProfiles(where: { mapId: $mapId, address_in: $addrs }) {
      address
      label
      color
    }
  }
`

/** On-chain profiles for the given buyers on a map (for name + color). */
export async function fetchProfilesFor(
  mapId: MapId,
  addrs: string[],
): Promise<ActivityProfileRow[]> {
  if (addrs.length === 0) return []
  const data = await querySubgraph<{ ownerProfiles: ActivityProfileRow[] }>(
    ACTIVITY_PROFILES_QUERY,
    { mapId, addrs },
  )
  return data.ownerProfiles ?? []
}
