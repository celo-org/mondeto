import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLeaderboard } from '@/hooks/useLeaderboard'
import type { PixelView } from '@/lib/mock'
import { ZERO_ADDRESS } from '@/constants/map'
import { getMaskData } from '@/lib/maps/masks'

const WORLD = getMaskData('world')
const TOTAL_PIXELS = WORLD.width * WORLD.height

// usePublicClient is only consumed by the global path; for local-scope tests
// it can return undefined safely.
vi.mock('wagmi', () => ({
  usePublicClient: () => undefined,
}))

function makePx(overrides: Partial<PixelView> = {}): PixelView {
  return {
    owner: ZERO_ADDRESS,
    saleCount: 0,
    currentPrice: 10000n,
    color: '',
    label: '',
    url: '',
    ...overrides,
  }
}

function emptyGrid(): PixelView[] {
  return Array.from({ length: TOTAL_PIXELS }, () => makePx())
}

// Known-land IDs on the 170x100 grid (row 0 has land at x=42..64).
// Using these keeps the test deterministic against the static land mask.
const ROW0_LAND_IDS = [42, 43, 44, 45]
// Row 1 land starts at x=38, so 170+38=208 is land too.
const ROW1_LAND_ID = 208

describe('useLeaderboard (local scope)', () => {
  it('AREA: ranks by total land pixel count', () => {
    const data = emptyGrid()
    data[ROW0_LAND_IDS[0]] = makePx({ owner: '0xAlice' })
    data[ROW0_LAND_IDS[1]] = makePx({ owner: '0xAlice' })
    data[ROW0_LAND_IDS[2]] = makePx({ owner: '0xAlice' })
    data[ROW0_LAND_IDS[3]] = makePx({ owner: '0xBob' })

    const { result } = renderHook(() => useLeaderboard(data))
    const { area } = result.current

    expect(area).toHaveLength(2)
    expect(area[0].owner.toLowerCase()).toBe('0xalice')
    expect(area[0].value).toBe('3')
    expect(area[0].unit).toBe('px')
    expect(area[0].rank).toBe(1)
    expect(area[1].owner.toLowerCase()).toBe('0xbob')
    expect(area[1].rank).toBe(2)
  })

  it('EMPIRE: ranks by largest contiguous land region', () => {
    const data = emptyGrid()
    // Alice owns 3 contiguous land pixels in row 0.
    data[ROW0_LAND_IDS[0]] = makePx({ owner: '0xAlice' })
    data[ROW0_LAND_IDS[1]] = makePx({ owner: '0xAlice' })
    data[ROW0_LAND_IDS[2]] = makePx({ owner: '0xAlice' })
    // Bob owns a single, isolated land pixel one row down.
    data[ROW1_LAND_ID] = makePx({ owner: '0xBob' })

    const { result } = renderHook(() => useLeaderboard(data))
    const { empire } = result.current

    expect(empire).toHaveLength(2)
    expect(empire[0].owner.toLowerCase()).toBe('0xalice')
    expect(empire[0].value).toBe('3')
    expect(empire[1].owner.toLowerCase()).toBe('0xbob')
    expect(empire[1].value).toBe('1')
  })

  it('TYCOONS: ranks by highest single pixel price per owner', () => {
    const data = emptyGrid()
    data[ROW0_LAND_IDS[0]] = makePx({ owner: '0xAlice', currentPrice: 50_000_000n }) // 50 USDT
    data[ROW0_LAND_IDS[1]] = makePx({ owner: '0xAlice', currentPrice: 100_000_000n }) // 100 USDT
    data[ROW0_LAND_IDS[2]] = makePx({ owner: '0xBob', currentPrice: 80_000_000n })

    const { result } = renderHook(() => useLeaderboard(data))
    const { tycoons } = result.current

    expect(tycoons).toHaveLength(2)
    expect(tycoons[0].owner.toLowerCase()).toBe('0xalice')
    expect(tycoons[0].unit).toBe('USDT')
    expect(tycoons[1].owner.toLowerCase()).toBe('0xbob')
  })

  it('excludes unowned (ZERO_ADDRESS) pixels', () => {
    const data = emptyGrid()
    data[ROW0_LAND_IDS[0]] = makePx({ owner: '0xAlice' })
    // every other pixel is still ZERO_ADDRESS

    const { result } = renderHook(() => useLeaderboard(data))
    expect(result.current.area).toHaveLength(1)
  })

  it('excludes water pixels even when they have an owner', () => {
    const data = emptyGrid()
    // ID 0 is water (top-left of world) — ownership here must not count.
    data[0] = makePx({ owner: '0xAlice' })
    data[ROW0_LAND_IDS[0]] = makePx({ owner: '0xBob' })

    const { result } = renderHook(() => useLeaderboard(data))
    expect(result.current.area).toHaveLength(1)
    expect(result.current.area[0].owner.toLowerCase()).toBe('0xbob')
  })
})

describe('useLeaderboard viewer standing (you)', () => {
  it('returns the viewer standing with the gap to the rank above', () => {
    const data = emptyGrid()
    data[ROW0_LAND_IDS[0]] = makePx({ owner: '0xAlice' })
    data[ROW0_LAND_IDS[1]] = makePx({ owner: '0xAlice' })
    data[ROW0_LAND_IDS[2]] = makePx({ owner: '0xAlice' })
    data[ROW0_LAND_IDS[3]] = makePx({ owner: '0xBob' })

    const { result } = renderHook(() =>
      useLeaderboard(data, undefined, { viewer: '0xBob' }),
    )
    const you = result.current.you.area
    expect(you).not.toBeNull()
    expect(you!.entry.rank).toBe(2)
    expect(you!.entry.value).toBe('1')
    expect(you!.gap).toBe(2)
    expect(you!.gapValue).toBe('2')
  })

  it('gives rank 1 a null gap (nothing above to chase)', () => {
    const data = emptyGrid()
    data[ROW0_LAND_IDS[0]] = makePx({ owner: '0xAlice' })

    const { result } = renderHook(() =>
      useLeaderboard(data, undefined, { viewer: '0xAlice' }),
    )
    const you = result.current.you.area
    expect(you!.entry.rank).toBe(1)
    expect(you!.gap).toBeNull()
    expect(you!.gapValue).toBeNull()
  })

  it('matches the viewer address case-insensitively', () => {
    const data = emptyGrid()
    data[ROW0_LAND_IDS[0]] = makePx({ owner: '0xAlice' })
    data[ROW0_LAND_IDS[1]] = makePx({ owner: '0xBob' })

    const { result } = renderHook(() =>
      useLeaderboard(data, undefined, { viewer: '0xALICE' }),
    )
    expect(result.current.you.area!.entry.rank).toBe(1)
  })

  it('returns null per board when the viewer owns nothing', () => {
    const data = emptyGrid()
    data[ROW0_LAND_IDS[0]] = makePx({ owner: '0xAlice' })

    const { result } = renderHook(() =>
      useLeaderboard(data, undefined, { viewer: '0xNobody' }),
    )
    expect(result.current.you.area).toBeNull()
    expect(result.current.you.empire).toBeNull()
    expect(result.current.you.tycoons).toBeNull()
  })

  it('returns all-null standings when no viewer is passed', () => {
    const data = emptyGrid()
    data[ROW0_LAND_IDS[0]] = makePx({ owner: '0xAlice' })

    const { result } = renderHook(() => useLeaderboard(data))
    expect(result.current.you).toEqual({ area: null, empire: null, tycoons: null })
  })
})
