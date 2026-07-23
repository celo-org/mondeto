import { describe, it, expect } from 'vitest'
import { getMaskData, getMaskSlugs } from '@/lib/maps/masks'

describe('getMaskSlugs', () => {
  it('exposes the world map plus the six continents', () => {
    const slugs = getMaskSlugs()
    expect(slugs).toContain('world')
    for (const c of [
      'africa',
      'antarctica',
      'asia',
      'europe',
      'north-america',
      'oceania',
      'south-america',
    ]) {
      expect(slugs).toContain(c)
    }
  })
})

describe('getMaskData', () => {
  it('returns a coherent mask (dimensions match the array, land count fits)', () => {
    for (const slug of getMaskSlugs()) {
      const { width, height, landCount, mask } = getMaskData(slug)
      expect(width).toBeGreaterThan(0)
      expect(height).toBeGreaterThan(0)
      expect(mask).toBeInstanceOf(Uint8Array)
      expect(mask.length).toBe(width * height)
      expect(landCount).toBeGreaterThan(0)
      expect(landCount).toBeLessThanOrEqual(mask.length)
      // landCount must equal the number of set bits in the mask.
      const set = mask.reduce((n, b) => n + (b === 1 ? 1 : 0), 0)
      expect(set).toBe(landCount)
    }
  })

  it('throws for an unregistered slug', () => {
    // @ts-expect-error — exercising the runtime guard with an invalid slug.
    expect(() => getMaskData('atlantis')).toThrow(/no mask registered/)
  })
})
