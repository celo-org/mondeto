import { describe, it, expect } from 'vitest'
import { percentClaimed } from '@/lib/maps/adapter'
import type { MapSnapshot, PixelState } from '@/lib/maps/types'

function px(
  id: number,
  owner: string | null,
  isLand: boolean,
  price = 0.04,
): PixelState {
  return {
    id,
    x: id,
    y: 0,
    owner,
    currentPrice: price,
    isLand,
  }
}

function makeMap(pixels: PixelState[]): MapSnapshot {
  return { meta: { id: 0, open: true }, pixels }
}

describe('percentClaimed', () => {
  it('returns 0 for an all-water (no land) map', () => {
    expect(
      percentClaimed(makeMap([px(0, null, false), px(1, null, false)])),
    ).toBe(0)
  })

  it('returns 0 when no land pixel has an owner', () => {
    expect(
      percentClaimed(makeMap([px(0, null, true), px(1, null, true)])),
    ).toBe(0)
  })

  it('returns 1 when every land pixel is owned', () => {
    expect(
      percentClaimed(
        makeMap([px(0, '0xabc', true), px(1, '0xdef', true)]),
      ),
    ).toBe(1)
  })

  it('ignores water pixels even if they have an owner', () => {
    // Water pixels can never be owned in practice, but the function must
    // not let one skew the denominator either way.
    const m = makeMap([
      px(0, '0xabc', true), // counted, owned
      px(1, null, true), //    counted, unowned
      px(2, '0xdef', false), // ignored
    ])
    expect(percentClaimed(m)).toBe(0.5)
  })

  it('rounds correctly when only one of three land pixels is owned', () => {
    const m = makeMap([
      px(0, '0xabc', true),
      px(1, null, true),
      px(2, null, true),
    ])
    expect(percentClaimed(m)).toBeCloseTo(1 / 3, 5)
  })
})
