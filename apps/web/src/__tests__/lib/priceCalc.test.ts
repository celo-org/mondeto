import { describe, it, expect } from 'vitest'
import { pixelPrice, discretePrice, formatUSDTPrice, type PriceConfig } from '@/lib/priceCalc'

const MAX_UINT256 = (1n << 256n) - 1n

// Mirrors the on-chain pricing curve, so the client never quotes a price the
// contract would reject. These are the money-path invariants.
describe('discretePrice', () => {
  it('doubles the price for each sale above the epoch (saleCount >= epoch)', () => {
    expect(discretePrice(0, 0n, 1000n, 1n)).toBe(1000n)
    expect(discretePrice(1, 0n, 1000n, 1n)).toBe(2000n)
    expect(discretePrice(2, 0n, 1000n, 1n)).toBe(4000n)
  })

  it('halves the price for each epoch above the saleCount', () => {
    expect(discretePrice(0, 1n, 1000n, 1n)).toBe(500n)
    expect(discretePrice(0, 2n, 1000n, 1n)).toBe(250n)
  })

  it('clamps the decayed price to minPrice, never below', () => {
    // 1000 >> 4 = 62, but minPrice floors it at 100.
    expect(discretePrice(0, 4n, 1000n, 100n)).toBe(100n)
  })

  it('saturates to MAX_UINT256 when the up-shift would overflow', () => {
    expect(discretePrice(200, 0n, 1n, 1n)).toBe(MAX_UINT256)
    expect(discretePrice(128, 0n, 1n, 1n)).toBe(MAX_UINT256) // shift === 128
  })

  it('returns minPrice when the down-shift exceeds the 128-bit guard', () => {
    expect(discretePrice(0, 200n, 1000n, 7n)).toBe(7n)
  })
})

describe('pixelPrice', () => {
  const config: PriceConfig = {
    initialPrice: 1000n,
    minPrice: 1n,
    halvingStartTimestamp: 100n,
    halvingTime: 10n,
  }

  it('sits at initialPrice before the first sale (halvingStartTimestamp === 0)', () => {
    const fresh: PriceConfig = { ...config, halvingStartTimestamp: 0n }
    expect(pixelPrice(0, 999999n, fresh)).toBe(1000n)
  })

  it('returns the discrete price exactly on an epoch boundary (remainder === 0)', () => {
    expect(pixelPrice(0, 100n, config)).toBe(1000n) // epoch 0
    expect(pixelPrice(0, 110n, config)).toBe(500n) // epoch 1 — one halving
    expect(pixelPrice(0, 120n, config)).toBe(250n) // epoch 2
  })

  it('linearly interpolates between two epoch price levels', () => {
    // Halfway through the first halving window: between 1000 and 500 → 750.
    expect(pixelPrice(0, 105n, config)).toBe(750n)
  })

  it('short-circuits to MAX_UINT256 when the epoch-start price is saturated', () => {
    const cfg: PriceConfig = { ...config, initialPrice: 1n, minPrice: 0n }
    expect(pixelPrice(200, 105n, cfg)).toBe(MAX_UINT256)
  })
})

describe('formatUSDTPrice', () => {
  it('formats micro-units to two decimal places', () => {
    expect(formatUSDTPrice(100000n)).toBe('0.10')
    expect(formatUSDTPrice(1500000n)).toBe('1.50')
    expect(formatUSDTPrice(0n)).toBe('0.00')
    expect(formatUSDTPrice(1760000n)).toBe('1.76')
  })

  it('truncates sub-cent precision rather than rounding', () => {
    // 1.769999 → "1.76", never "1.77".
    expect(formatUSDTPrice(1769999n)).toBe('1.76')
  })

  it('honours a custom decimals argument', () => {
    expect(formatUSDTPrice(150n, 2)).toBe('1.50')
  })
})
