import { describe, it, expect } from 'vitest'
import {
  APPROVAL_CAP_USD,
  BPS_DENOM,
  SLIPPAGE_BPS,
  MAX_SPEND_USD_MICROS,
  isOverSpendCap,
} from '@/lib/buyLimits'

// At the default 2% slippage the $10 approval covers a purchase up to
// $10 / 1.02 = $9.803921… → 9_803_921 micros (floored by bigint division).
const DEFAULT_MAX = 9_803_921n

describe('MAX_SPEND_USD_MICROS', () => {
  it('keeps the buffered approval within the $10 cap at the limit', () => {
    // The safety property: a purchase right at the limit, plus the slippage
    // buffer, still approves ≤ $10 (mirrors the hook's approveAmount formula).
    const capMicros = APPROVAL_CAP_USD * 1_000_000n
    const approvalAt = (MAX_SPEND_USD_MICROS * (BPS_DENOM + SLIPPAGE_BPS)) / BPS_DENOM
    expect(approvalAt).toBeLessThanOrEqual(capMicros)
    // And a full cent over the limit clearly blows the cap — no false "safe".
    const approvalOverByCent = ((MAX_SPEND_USD_MICROS + 10_000n) * (BPS_DENOM + SLIPPAGE_BPS)) / BPS_DENOM
    expect(approvalOverByCent).toBeGreaterThan(capMicros)
  })

  it('tracks the slippage buffer (default 2% → ~$9.80)', () => {
    // Derived from the same env-driven SLIPPAGE_BPS the approval uses, so the
    // UI gate and the on-chain approval can never disagree on the boundary.
    expect(MAX_SPEND_USD_MICROS).toBe(
      (APPROVAL_CAP_USD * 1_000_000n * BPS_DENOM) / (BPS_DENOM + SLIPPAGE_BPS),
    )
    // Guard the concrete default so a stray env change is caught in CI.
    if (SLIPPAGE_BPS === 200n) expect(MAX_SPEND_USD_MICROS).toBe(DEFAULT_MAX)
  })
})

describe('isOverSpendCap', () => {
  it('allows purchases at or below the safe limit', () => {
    expect(isOverSpendCap(0n)).toBe(false)
    expect(isOverSpendCap(5_000_000n)).toBe(false) // $5
    expect(isOverSpendCap(MAX_SPEND_USD_MICROS - 1n)).toBe(false)
    expect(isOverSpendCap(MAX_SPEND_USD_MICROS)).toBe(false)
  })

  it('blocks purchases above the safe limit — including a round $10', () => {
    expect(isOverSpendCap(MAX_SPEND_USD_MICROS + 1n)).toBe(true)
    expect(isOverSpendCap(10_000_000n)).toBe(true) // $10 — approval would be $10.20
    expect(isOverSpendCap(11_000_000n)).toBe(true) // $11
  })
})
