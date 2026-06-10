/**
 * Shared cross-map snapshot fetch + cache.
 *
 * Both the global leaderboard (`useLeaderboard`) and the per-map "ruler"
 * resolver (`useMapRulers`) need the full pixel state of every revealed map.
 * Fetching all maps is a handful of `getPixelBatch` reads, so the result is
 * cached in sessionStorage for 30s and shared between the two — flipping the
 * leaderboard scope or opening the profile reuses one fetch.
 */

import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { pixelViewToMapSnapshot } from '@/lib/maps/adapter'
import { getRevealedMaps } from '@/lib/maps/contracts'
import { getMaskData } from '@/lib/maps/masks'
import type { MapId, MapSnapshot } from '@/lib/maps/types'

const CACHE_TTL_MS = 30_000
const CACHE_KEY = 'mondeto:global-snapshots:v1'

type ReadContractFn = Parameters<typeof fetchAllPixelsFromContract>[0]

interface CachedSnapshot {
  mapId: MapId
  open: boolean
  // [id, x, y, owner|null, currentPrice, isLand(0|1)] — tuples keep storage tight.
  pixels: Array<[number, number, number, string | null, number, 0 | 1]>
}

interface CacheEntry {
  storedAt: number
  snapshots: CachedSnapshot[]
}

export function readGlobalSnapshotCache(): MapSnapshot[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (Date.now() - parsed.storedAt > CACHE_TTL_MS) return null
    return parsed.snapshots.map((s) => ({
      meta: { id: s.mapId, open: s.open },
      pixels: s.pixels.map(([id, x, y, owner, currentPrice, isLand]) => ({
        id,
        x,
        y,
        owner,
        currentPrice,
        isLand: isLand === 1,
      })),
    }))
  } catch {
    return null
  }
}

export function writeGlobalSnapshotCache(snapshots: MapSnapshot[]): void {
  if (typeof window === 'undefined') return
  try {
    const entry: CacheEntry = {
      storedAt: Date.now(),
      snapshots: snapshots.map((s) => ({
        mapId: s.meta.id,
        open: s.meta.open,
        pixels: s.pixels.map((p) => [
          p.id,
          p.x,
          p.y,
          p.owner,
          p.currentPrice,
          p.isLand ? 1 : 0,
        ]),
      })),
    }
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // sessionStorage may be full or unavailable; not fatal.
  }
}

// Read at most this many maps at once. Each getPixelBatch returns every land
// pixel of a ~17k-cell grid, so firing all maps in parallel can overwhelm a
// constrained RPC (notably MiniPay's injected provider) and make them all
// fail. Batching keeps peak pressure bounded.
const READ_CONCURRENCY = 4

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return out
}

/**
 * Fetch every revealed map's snapshot (cache-first). One bad map yields an
 * empty snapshot for that map (so a single failure doesn't blank the whole
 * board), but the result is only cached when ALL maps loaded cleanly — a
 * partial/failed read must not poison the 30s cache and leave the global
 * board empty even after the user's purchases have landed. Returns the
 * snapshots in revealed-map order.
 */
export async function fetchGlobalSnapshots(
  read: ReadContractFn,
): Promise<MapSnapshot[]> {
  const cached = readGlobalSnapshotCache()
  const revealed = getRevealedMaps()
  if (cached && cached.length === revealed.length) return cached

  let anyFailed = false
  const snapshots = await mapWithConcurrency(revealed, READ_CONCURRENCY, async (m) => {
    const { mask } = getMaskData(m.slug)
    try {
      const data = await fetchAllPixelsFromContract(
        read,
        m.address,
        m.width,
        m.height,
        mask,
      )
      return pixelViewToMapSnapshot(data, m.id, m.revealed, m.width, mask)
    } catch (e) {
      anyFailed = true
      console.warn(`Failed to load map ${m.id} for cross-map board:`, e)
      return pixelViewToMapSnapshot([], m.id, m.revealed, m.width, mask)
    }
  })

  // Only cache a complete, clean read. A partial set is shown once but
  // re-fetched on the next attempt instead of being frozen for 30s.
  if (!anyFailed) writeGlobalSnapshotCache(snapshots)
  return snapshots
}
