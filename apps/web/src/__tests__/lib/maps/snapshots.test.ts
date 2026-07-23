import { describe, it, expect, beforeEach } from 'vitest'
import {
  readGlobalSnapshotCache,
  writeGlobalSnapshotCache,
} from '@/lib/maps/snapshots'
import type { MapSnapshot } from '@/lib/maps/types'

const CACHE_KEY = 'mondeto:global-snapshots:v1'

const SNAPSHOTS: MapSnapshot[] = [
  {
    meta: { id: 0, open: true },
    pixels: [
      { id: 0, x: 0, y: 0, owner: '0xabc', currentPrice: 100, isLand: true },
      { id: 1, x: 1, y: 0, owner: null, currentPrice: 0, isLand: false },
    ],
  },
]

describe('global snapshot cache', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('round-trips snapshots through sessionStorage', () => {
    writeGlobalSnapshotCache(SNAPSHOTS)
    expect(readGlobalSnapshotCache()).toEqual(SNAPSHOTS)
  })

  it('returns null when nothing is cached', () => {
    expect(readGlobalSnapshotCache()).toBeNull()
  })

  it('treats an entry older than the 30s TTL as a miss', () => {
    const stale = {
      storedAt: Date.now() - 31_000,
      snapshots: [{ mapId: 0, open: true, pixels: [] }],
    }
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(stale))
    expect(readGlobalSnapshotCache()).toBeNull()
  })

  it('returns null (not a throw) on corrupt cache contents', () => {
    window.sessionStorage.setItem(CACHE_KEY, 'not json{')
    expect(readGlobalSnapshotCache()).toBeNull()
  })
})
