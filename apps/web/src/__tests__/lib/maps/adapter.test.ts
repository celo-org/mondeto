import { describe, it, expect } from 'vitest'
import { pixelViewToMapSnapshot } from '@/lib/maps/adapter'
import { WIDTH, HEIGHT, TOTAL_PIXELS, ZERO_ADDRESS } from '@/constants/map'
import { isLand } from '@/lib/landMask'
import type { PixelView } from '@/lib/mock'

function makePx(overrides: Partial<PixelView> = {}): PixelView {
  return {
    owner: ZERO_ADDRESS,
    saleCount: 0,
    currentPrice: 0n,
    color: '',
    label: '',
    url: '',
    ...overrides,
  }
}

function emptyGrid(): PixelView[] {
  return Array.from({ length: TOTAL_PIXELS }, () => makePx())
}

// Pick a known land id and a known water id from the real mask so tests
// stay honest against `isLand`. ID 0 (top-left of the world) is water; ID 42
// sits in row 0's land band (x=42..64).
const WATER_ID = 0
const LAND_ID = 42

describe('pixelViewToMapSnapshot', () => {
  it('produces a snapshot whose pixel count matches the input', () => {
    const data = emptyGrid()
    const snap = pixelViewToMapSnapshot(data, 0, true)
    expect(snap.pixels).toHaveLength(TOTAL_PIXELS)
    expect(snap.meta).toEqual({ id: 0, open: true })
  })

  it('derives x and y from pixel id (row-major, WIDTH=170)', () => {
    const data = emptyGrid()
    const snap = pixelViewToMapSnapshot(data, 0, true)
    expect(snap.pixels[0]).toMatchObject({ id: 0, x: 0, y: 0 })
    expect(snap.pixels[WIDTH - 1]).toMatchObject({ id: WIDTH - 1, x: WIDTH - 1, y: 0 })
    expect(snap.pixels[WIDTH]).toMatchObject({ id: WIDTH, x: 0, y: 1 })
    expect(snap.pixels[WIDTH + 5]).toMatchObject({ id: WIDTH + 5, x: 5, y: 1 })
    const last = TOTAL_PIXELS - 1
    expect(snap.pixels[last]).toMatchObject({
      id: last,
      x: WIDTH - 1,
      y: HEIGHT - 1,
    })
  })

  it('marks water pixels as isLand: false and land pixels as isLand: true', () => {
    const data = emptyGrid()
    const snap = pixelViewToMapSnapshot(data, 0, true)
    // Cross-check against the source-of-truth land mask helper so this test
    // can't drift if the mask is regenerated.
    expect(snap.pixels[WATER_ID].isLand).toBe(isLand(WATER_ID))
    expect(snap.pixels[LAND_ID].isLand).toBe(isLand(LAND_ID))
    expect(snap.pixels[WATER_ID].isLand).toBe(false)
    expect(snap.pixels[LAND_ID].isLand).toBe(true)
  })

  it('maps ZERO_ADDRESS owner to null', () => {
    const data = emptyGrid()
    // every pixel is ZERO_ADDRESS by default
    const snap = pixelViewToMapSnapshot(data, 0, true)
    expect(snap.pixels[LAND_ID].owner).toBeNull()
    expect(snap.pixels[WATER_ID].owner).toBeNull()
  })

  it('lowercases owned addresses', () => {
    const data = emptyGrid()
    data[LAND_ID] = makePx({ owner: '0xAbCDEF0123456789aBcDeF0123456789AbCdEf01' })
    const snap = pixelViewToMapSnapshot(data, 0, true)
    expect(snap.pixels[LAND_ID].owner).toBe(
      '0xabcdef0123456789abcdef0123456789abcdef01',
    )
  })

  it('converts USDT 6-decimal bigint price to a plain number', () => {
    const data = emptyGrid()
    // 1.234567 USDT in 6-decimal raw units.
    data[LAND_ID] = makePx({ owner: '0xabc', currentPrice: 1_234_567n })
    const snap = pixelViewToMapSnapshot(data, 0, true)
    // Sanity within float tolerance.
    expect(snap.pixels[LAND_ID].currentPrice).toBeCloseTo(1.234567, 5)
  })

  it('passes meta through (mapId + open flag)', () => {
    const data = emptyGrid()
    const openSnap = pixelViewToMapSnapshot(data, 3, true)
    const closedSnap = pixelViewToMapSnapshot(data, 5, false)
    expect(openSnap.meta).toEqual({ id: 3, open: true })
    expect(closedSnap.meta).toEqual({ id: 5, open: false })
  })

  it('handles an empty input array (returns empty pixels)', () => {
    const snap = pixelViewToMapSnapshot([], 0, true)
    expect(snap.pixels).toEqual([])
    expect(snap.meta).toEqual({ id: 0, open: true })
  })
})
