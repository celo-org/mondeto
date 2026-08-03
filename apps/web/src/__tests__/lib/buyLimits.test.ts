import { describe, it, expect } from 'vitest'
import {
  APPROVAL_CAP_USD,
  MAX_SPEND_USD_MICROS,
  isOverSpendCap,
} from '@/lib/buyLimits'

describe('MAX_SPEND_USD_MICROS', () => {
  it('is a clean, round $10 in 6-decimal USD micros', () => {
    expect(MAX_SPEND_USD_MICROS).toBe(APPROVAL_CAP_USD * 1_000_000n)
    expect(MAX_SPEND_USD_MICROS).toBe(10_000_000n)
  })
})

describe('isOverSpendCap', () => {
  it('allows purchases at or below $10', () => {
    expect(isOverSpendCap(0n)).toBe(false)
    expect(isOverSpendCap(5_000_000n)).toBe(false) // $5
    expect(isOverSpendCap(9_999_999n)).toBe(false) // $9.999999
    expect(isOverSpendCap(10_000_000n)).toBe(false) // exactly $10 — allowed
  })

  it('blocks purchases above $10', () => {
    expect(isOverSpendCap(10_000_001n)).toBe(true) // a hair over $10
    expect(isOverSpendCap(11_000_000n)).toBe(true) // $11
  })
})
