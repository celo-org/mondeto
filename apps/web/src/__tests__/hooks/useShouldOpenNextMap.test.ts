import { describe, it, expect } from 'vitest'
import {
  cacheKeyFor,
  pixelViewsToStates,
  summarizeMap,
} from '@/hooks/useShouldOpenNextMap'
import { celo } from 'viem/chains'
import { ZERO_ADDRESS } from '@/constants/map'
import { getMaskData } from '@/lib/maps/masks'
import type { PixelState } from '@/lib/maps/types'

const WORLD = getMaskData('world')
const WIDTH = WORLD.width
const HEIGHT = WORLD.height

function landPixel(
  id: number,
  owner: string | null,
  currentPrice: number,
): PixelState {
  return {
    id,
    x: id % WIDTH,
    y: Math.floor(id / WIDTH),
    owner,
    currentPrice,
    isLand: true,
  }
}

function waterPixel(id: number): PixelState {
  return {
    id,
    x: id % WIDTH,
    y: Math.floor(id / WIDTH),
    owner: null,
    currentPrice: 0,
    isLand: false,
  }
}

describe('summarizeMap', () => {
  it('computes fill% and avg price over land pixels only', () => {
    const pixels: PixelState[] = [
      landPixel(0, '0xAlice', 1.0),
      landPixel(1, '0xBob', 2.0),
      landPixel(2, null, 0.5),
      landPixel(3, null, 0.5),
      waterPixel(4),
      waterPixel(5),
    ]

    const summary = summarizeMap(7, pixels)

    expect(summary.mapId).toBe(7)
    expect(summary.totalLand).toBe(4)
    expect(summary.ownedCount).toBe(2)
    expect(summary.fillPct).toBeCloseTo(50, 5)
    expect(summary.avgPriceUsd).toBeCloseTo(1.0, 5)
  })

  it('returns zeros for an all-water map', () => {
    const pixels: PixelState[] = [waterPixel(0), waterPixel(1)]
    const summary = summarizeMap(0, pixels)
    expect(summary.totalLand).toBe(0)
    expect(summary.ownedCount).toBe(0)
    expect(summary.fillPct).toBe(0)
    expect(summary.avgPriceUsd).toBe(0)
  })

  it('handles a fully-owned map', () => {
    const pixels: PixelState[] = [
      landPixel(0, '0xAlice', 3),
      landPixel(1, '0xBob', 3),
    ]
    const summary = summarizeMap(1, pixels)
    expect(summary.fillPct).toBe(100)
    expect(summary.avgPriceUsd).toBeCloseTo(3, 5)
  })
})

describe('pixelViewsToStates', () => {
  it('converts USDT 6-decimal raw price to USD float', () => {
    const views = [
      { owner: '0xAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', currentPrice: 1_000_000n },
      { owner: ZERO_ADDRESS, currentPrice: 250_000n },
    ]
    const states = pixelViewsToStates(views, WIDTH, WORLD.mask)
    expect(states).toHaveLength(2)
    expect(states[0].owner).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(states[0].currentPrice).toBeCloseTo(1.0, 6)
    expect(states[1].owner).toBeNull()
    expect(states[1].currentPrice).toBeCloseTo(0.25, 6)
  })

  it('respects grid coordinates derived from index using per-map width', () => {
    const views = Array.from({ length: WIDTH + 2 }, () => ({
      owner: ZERO_ADDRESS,
      currentPrice: 0n,
    }))
    const states = pixelViewsToStates(views, WIDTH, WORLD.mask)
    expect(states[0]).toMatchObject({ x: 0, y: 0 })
    expect(states[WIDTH]).toMatchObject({ x: 0, y: 1 })
    expect(states[WIDTH + 1]).toMatchObject({ x: 1, y: 1 })
    expect(states[states.length - 1].y).toBeLessThan(HEIGHT)
  })
})

describe('cacheKeyFor', () => {
  it('includes the chain id and the sorted revealed ids', () => {
    expect(cacheKeyFor(celo.id, [1, 0])).toBe(
      `mondeto-should-open-next-map-cache:${celo.id}:0-1`,
    )
  })

  it('differs across reveal sets so a pre-reveal entry cannot shadow a wider one', () => {
    expect(cacheKeyFor(celo.id, [0])).not.toBe(cacheKeyFor(celo.id, [0, 1]))
  })

  it('is insensitive to reveal-id ordering', () => {
    expect(cacheKeyFor(celo.id, [1, 0])).toBe(cacheKeyFor(celo.id, [0, 1]))
  })
})
