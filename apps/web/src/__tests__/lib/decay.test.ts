import { describe, it, expect } from 'vitest'
import { dailyFallPct, dealDepth, dealTierRamps, DEAL_MIN_LIME, halvingPeriodDays } from '@/lib/decay'

const DAY = 86_400

describe('dailyFallPct', () => {
  it('is ~4.83%/day for a 14-day halving time', () => {
    expect(dailyFallPct(14 * DAY)).toBeCloseTo(4.83, 2)
  })

  it('is exactly 50%/day for a 1-day halving time', () => {
    expect(dailyFallPct(DAY)).toBeCloseTo(50, 10)
  })

  it('is 25% per half day equivalent: 2-day halving → ~29.29%/day', () => {
    // 1 - 2^(-1/2) = 1 - 0.70710678 = 0.29289322
    expect(dailyFallPct(2 * DAY)).toBeCloseTo(29.289, 3)
  })

  it('approaches 0 for very long halving times', () => {
    expect(dailyFallPct(10_000 * DAY)).toBeLessThan(0.01)
    expect(dailyFallPct(10_000 * DAY)).toBeGreaterThan(0)
  })

  it('returns 0 for zero halving time (no division by zero)', () => {
    expect(dailyFallPct(0)).toBe(0)
  })

  it('returns 0 for negative halving time', () => {
    expect(dailyFallPct(-DAY)).toBe(0)
  })

  it('returns 0 for non-finite halving time', () => {
    expect(dailyFallPct(Infinity)).toBe(0)
    expect(dailyFallPct(NaN)).toBe(0)
  })
})

describe('halvingPeriodDays', () => {
  it('returns the halving span in days', () => {
    expect(halvingPeriodDays(30 * DAY)).toBe(30)
    expect(halvingPeriodDays(14 * DAY)).toBe(14)
  })

  it('returns fractional days for sub-day precision', () => {
    expect(halvingPeriodDays(DAY / 2)).toBeCloseTo(0.5, 10)
  })

  it('returns 0 for zero, negative, and non-finite inputs', () => {
    expect(halvingPeriodDays(0)).toBe(0)
    expect(halvingPeriodDays(-DAY)).toBe(0)
    expect(halvingPeriodDays(Infinity)).toBe(0)
    expect(halvingPeriodDays(NaN)).toBe(0)
  })
})

describe('dealDepth', () => {
  const INITIAL = 100_000n // $0.10 in 6-decimal micro-USDT

  it('is 0 when the pixel is exactly at entry price', () => {
    expect(dealDepth(INITIAL, INITIAL)).toBe(0)
  })

  it('is 0 when the pixel is above entry price', () => {
    expect(dealDepth(INITIAL * 8n, INITIAL)).toBe(0)
  })

  it('is 0.5 at half the entry price', () => {
    expect(dealDepth(INITIAL / 2n, INITIAL)).toBeCloseTo(0.5, 6)
  })

  it('is 0.75 at a quarter of the entry price', () => {
    expect(dealDepth(INITIAL / 4n, INITIAL)).toBeCloseTo(0.75, 6)
  })

  it('is 1 at a current price of zero', () => {
    expect(dealDepth(0n, INITIAL)).toBe(1)
  })

  it('keeps precision on huge bigint prices beyond Number range', () => {
    const huge = 10n ** 30n
    expect(dealDepth(huge / 2n, huge)).toBeCloseTo(0.5, 6)
    expect(dealDepth(huge / 10n, huge)).toBeCloseTo(0.9, 6)
  })

  it('handles a tiny discount without rounding to a fake deal', () => {
    // 1 micro-unit under entry — depth is positive but ~0
    const depth = dealDepth(INITIAL - 1n, INITIAL)
    expect(depth).toBeGreaterThan(0)
    expect(depth).toBeLessThan(0.001)
  })

  it('guards zero initial price (division by zero)', () => {
    expect(dealDepth(50_000n, 0n)).toBe(0)
  })

  it('guards negative inputs', () => {
    expect(dealDepth(-1n, INITIAL)).toBe(0)
    expect(dealDepth(50_000n, -1n)).toBe(0)
  })
})

describe('dealTierRamps', () => {
  const P = (cents: number) => BigInt(cents) * 10_000n // ¢ → 6-decimal micro-USDT

  it('anchors the deepest deal to the LOWEST live price, brightest lime', () => {
    // Cheapest land is 8¢ → 8¢ is the deal, at full brightness.
    const ramps = dealTierRamps([P(8), P(16), P(32), P(8)])
    expect(ramps.get(P(8))).toBeCloseTo(1, 10)
  })

  it('works when everything is bought and bid up above entry price', () => {
    // No pixel below the 10¢ entry — cheapest available is 20¢, still a deal.
    const ramps = dealTierRamps([P(20), P(40), P(80)])
    expect(ramps.get(P(20))).toBeCloseTo(1, 10)
  })

  it('makes several stages, cheapest brightest → last stage at the floor', () => {
    const ramps = dealTierRamps([P(8), P(16), P(32), P(64)], 4)
    expect(ramps.get(P(8))).toBeCloseTo(1, 10)
    expect(ramps.get(P(64))).toBeCloseTo(DEAL_MIN_LIME, 10)
    // Monotonic: cheaper is always brighter.
    expect(ramps.get(P(8))!).toBeGreaterThan(ramps.get(P(16))!)
    expect(ramps.get(P(16))!).toBeGreaterThan(ramps.get(P(32))!)
    expect(ramps.get(P(32))!).toBeGreaterThan(ramps.get(P(64))!)
  })

  it('only lights the cheapest N tiers; pricier land is not a deal', () => {
    const ramps = dealTierRamps([P(8), P(16), P(32), P(64), P(128)], 3)
    expect(ramps.has(P(8))).toBe(true)
    expect(ramps.has(P(16))).toBe(true)
    expect(ramps.has(P(32))).toBe(true)
    expect(ramps.has(P(64))).toBe(false) // beyond the 3 stages → greys out
    expect(ramps.has(P(128))).toBe(false)
  })

  it('lights the whole map at full brightness when only one price exists', () => {
    // Early game: every pixel is one price → all the deepest deal.
    const ramps = dealTierRamps([P(10), P(10), P(10)])
    expect(ramps.size).toBe(1)
    expect(ramps.get(P(10))).toBeCloseTo(1, 10)
  })

  it('dedupes identical prices so one tier is not spent on repeats', () => {
    // 8¢ (×3) and 16¢ (×2) are two tiers, not five.
    const ramps = dealTierRamps([P(8), P(8), P(8), P(16), P(16)], 4)
    expect(ramps.size).toBe(2)
    expect(ramps.get(P(8))).toBeCloseTo(1, 10)
    expect(ramps.get(P(16))).toBeCloseTo(DEAL_MIN_LIME, 10)
  })

  it('respects a custom stage count and floor', () => {
    const ramps = dealTierRamps([P(8), P(16), P(32)], 2, 0.5)
    expect(ramps.size).toBe(2)
    expect(ramps.get(P(8))).toBeCloseTo(1, 10)
    expect(ramps.get(P(16))).toBeCloseTo(0.5, 10)
    expect(ramps.has(P(32))).toBe(false)
  })

  it('ignores non-positive prices (unloaded pixels) and empty input', () => {
    expect(dealTierRamps([]).size).toBe(0)
    const ramps = dealTierRamps([0n, -1n, P(8)])
    expect(ramps.size).toBe(1)
    expect(ramps.get(P(8))).toBeCloseTo(1, 10)
  })

  it('returns an empty map when stages <= 0', () => {
    expect(dealTierRamps([P(8), P(16)], 0).size).toBe(0)
  })
})
