import { describe, it, expect } from 'vitest'
import { pixelViewToMapSnapshot } from '@/lib/maps/adapter'
import { ZERO_ADDRESS } from '@/constants/map'
import { isLand } from '@/lib/landMask'
import { getMaskData } from '@/lib/maps/masks'
import type { PixelView } from '@/lib/mock'

const WORLD = getMaskData('world')
const TOTAL_PIXELS = WORLD.width * WORLD.height

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

// Pick a known land id and a known water id from the real world mask. ID 0
// is water; ID 42 sits in row 0's land band.
const WATER_ID = 0
const LAND_ID = 42

describe('pixelViewToMapSnapshot', () => {
  it('produces a snapshot whose pixel count matches the input', () => {
    const data = emptyGrid()
    const snap = pixelViewToMapSnapshot(data, 0, true, WORLD.width, WORLD.mask)
    expect(snap.pixels).toHaveLength(TOTAL_PIXELS)
    expect(snap.meta).toEqual({ id: 0, open: true })
  })

  it('derives x and y from pixel id (row-major, per-map width)', () => {
    const data = emptyGrid()
    const snap = pixelViewToMapSnapshot(data, 0, true, WORLD.width, WORLD.mask)
    expect(snap.pixels[0]).toMatchObject({ id: 0, x: 0, y: 0 })
    expect(snap.pixels[WORLD.width - 1]).toMatchObject({ id: WORLD.width - 1, x: WORLD.width - 1, y: 0 })
    expect(snap.pixels[WORLD.width]).toMatchObject({ id: WORLD.width, x: 0, y: 1 })
    expect(snap.pixels[WORLD.width + 5]).toMatchObject({ id: WORLD.width + 5, x: 5, y: 1 })
    const last = TOTAL_PIXELS - 1
    expect(snap.pixels[last]).toMatchObject({
      id: last,
      x: WORLD.width - 1,
      y: WORLD.height - 1,
    })
  })

  it('marks water pixels as isLand: false and land pixels as isLand: true', () => {
    const data = emptyGrid()
    const snap = pixelViewToMapSnapshot(data, 0, true, WORLD.width, WORLD.mask)
    expect(snap.pixels[WATER_ID].isLand).toBe(isLand(WATER_ID, WORLD.mask))
    expect(snap.pixels[LAND_ID].isLand).toBe(isLand(LAND_ID, WORLD.mask))
    expect(snap.pixels[WATER_ID].isLand).toBe(false)
    expect(snap.pixels[LAND_ID].isLand).toBe(true)
  })

  it('maps ZERO_ADDRESS owner to null', () => {
    const data = emptyGrid()
    const snap = pixelViewToMapSnapshot(data, 0, true, WORLD.width, WORLD.mask)
    expect(snap.pixels[LAND_ID].owner).toBeNull()
    expect(snap.pixels[WATER_ID].owner).toBeNull()
  })

  it('lowercases owned addresses', () => {
    const data = emptyGrid()
    data[LAND_ID] = makePx({ owner: '0xAbCDEF0123456789aBcDeF0123456789AbCdEf01' })
    const snap = pixelViewToMapSnapshot(data, 0, true, WORLD.width, WORLD.mask)
    expect(snap.pixels[LAND_ID].owner).toBe(
      '0xabcdef0123456789abcdef0123456789abcdef01',
    )
  })

  it('converts USDT 6-decimal bigint price to a plain number', () => {
    const data = emptyGrid()
    data[LAND_ID] = makePx({ owner: '0xabc', currentPrice: 1_234_567n })
    const snap = pixelViewToMapSnapshot(data, 0, true, WORLD.width, WORLD.mask)
    expect(snap.pixels[LAND_ID].currentPrice).toBeCloseTo(1.234567, 5)
  })

  it('passes meta through (mapId + open flag)', () => {
    const data = emptyGrid()
    const openSnap = pixelViewToMapSnapshot(data, 3, true, WORLD.width, WORLD.mask)
    const closedSnap = pixelViewToMapSnapshot(data, 5, false, WORLD.width, WORLD.mask)
    expect(openSnap.meta).toEqual({ id: 3, open: true })
    expect(closedSnap.meta).toEqual({ id: 5, open: false })
  })

  it('handles an empty input array (returns empty pixels)', () => {
    const snap = pixelViewToMapSnapshot([], 0, true, WORLD.width, WORLD.mask)
    expect(snap.pixels).toEqual([])
    expect(snap.meta).toEqual({ id: 0, open: true })
  })

  it('uses the per-map width when slicing x/y (e.g. africa 127 wide)', () => {
    const AFRICA = getMaskData('africa')
    const pixels: PixelView[] = Array.from({ length: AFRICA.width * AFRICA.height }, () => makePx())
    const snap = pixelViewToMapSnapshot(pixels, 1, true, AFRICA.width, AFRICA.mask)
    expect(snap.pixels[AFRICA.width]).toMatchObject({ x: 0, y: 1 })
    expect(snap.pixels[AFRICA.width + 3]).toMatchObject({ x: 3, y: 1 })
  })
})
