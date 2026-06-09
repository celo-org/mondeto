/**
 * Shared cross-map snapshot fetch + cache.
 *
 * Both the global leaderboard (`useLeaderboard`) and the per-map "king"
 * resolver (`useMapKings`) need the full pixel state of every revealed map.
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

/**
 * Fetch every revealed map's snapshot (cache-first). One bad map yields an
 * empty snapshot rather than failing the whole set. Returns the snapshots
 * in revealed-map order.
 */
export async function fetchGlobalSnapshots(
  read: ReadContractFn,
): Promise<MapSnapshot[]> {
  const cached = readGlobalSnapshotCache()
  const revealed = getRevealedMaps()
  if (cached && cached.length === revealed.length) return cached

  const snapshots = await Promise.all(
    revealed.map(async (m) => {
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
        console.warn(`Failed to load map ${m.id} for cross-map board:`, e)
        return pixelViewToMapSnapshot([], m.id, m.revealed, m.width, mask)
      }
    }),
  )
  writeGlobalSnapshotCache(snapshots)
  return snapshots
}
