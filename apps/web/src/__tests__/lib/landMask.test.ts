import { describe, it, expect } from 'vitest'
import { isLand, isLandXY } from '@/lib/landMask'
import { LAND_MASK, LAND_COUNT } from '@/data/masks/world'

const WORLD_WIDTH = 170

describe('landMask data', () => {
  it('has 17000 entries', () => {
    expect(LAND_MASK.length).toBe(17000)
  })

  it('has 5622 land pixels', () => {
    expect(LAND_COUNT).toBe(5622)
  })
})

describe('isLand', () => {
  it('returns false for water at origin id=0', () => {
    expect(isLand(0, LAND_MASK)).toBe(false)
  })

  it('returns true for land id=42 (x=42, y=0)', () => {
    expect(isLand(42, LAND_MASK)).toBe(true)
  })

  it('returns true for land id=208 (x=38, y=1)', () => {
    expect(isLand(208, LAND_MASK)).toBe(true)
  })
})

describe('isLandXY', () => {
  it('returns false for water at (0, 0)', () => {
    expect(isLandXY(0, 0, WORLD_WIDTH, LAND_MASK)).toBe(false)
  })

  it('returns true for land at (42, 0)', () => {
    expect(isLandXY(42, 0, WORLD_WIDTH, LAND_MASK)).toBe(true)
  })

  it('agrees with isLand for same coordinates', () => {
    const x = 38, y = 1
    const id = y * 170 + x
    expect(isLandXY(x, y, WORLD_WIDTH, LAND_MASK)).toBe(isLand(id, LAND_MASK))
  })
})
