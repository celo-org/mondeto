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
  const out: WindowBatch[] = []
  for (let skip = 0; skip <= MAX_SKIP; skip += PAGE) {
    const data = await querySubgraph<{ purchaseBatches: WindowBatch[] }>(
      WINDOW_BATCHES_QUERY,
      { mapId, since: String(sinceTs), first: PAGE, skip },
    )
    const page = data.purchaseBatches ?? []
    out.push(...page)
    if (page.length < PAGE) break
  }
  return out
}
