import { describe, it, expect } from 'vitest'
import { netOfResaleFee } from '@/lib/resaleFee'

// The live rate on the World, Africa and Europe maps at the time of writing,
// verified with `cast call <proxy> "feeRate()(uint256)"`.
const LIVE_FEE_BPS = 500

describe('netOfResaleFee', () => {
  it('takes the 5% cut the contract actually keeps', () => {
    // The case from #182, in the units the route works in: a player who was
    // credited $12.00 gross received $11.40.
    expect(netOfResaleFee(12_000_000n, LIVE_FEE_BPS)).toBe(11_400_000n)
  })

  it('reports gross when there is no fee', () => {
    expect(netOfResaleFee(12_000_000n, 0)).toBe(12_000_000n)
  })

  it('scales with the rate rather than assuming 5%', () => {
    // feeRate is admin-settable up to 2000 bps, so nothing may hardcode 500.
    expect(netOfResaleFee(1_000_000n, 1_000)).toBe(900_000n)
    expect(netOfResaleFee(1_000_000n, 2_000)).toBe(800_000n)
  })

  it('truncates the fee the way the contract does', () => {
    // Fee first, then subtract — the contract's own shape. Computing
    // `gross * (10000 - bps) / 10000` instead would round the other way and
    // reintroduce the discrepancy this exists to remove.
    expect(netOfResaleFee(199n, LIVE_FEE_BPS)).toBe(190n) // fee 9.95 → 9
    expect(netOfResaleFee(1n, LIVE_FEE_BPS)).toBe(1n) //     fee 0.0005 → 0
  })

  it('never invents a debt from a bad rate', () => {
    // A failed read or a nonsensical value must understate the correction, not
    // flip a player's earnings negative on their profile.
    for (const bad of [-1, 10_000, 99_999, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(netOfResaleFee(1_000_000n, bad)).toBe(1_000_000n)
    }
  })

  it('leaves zero at zero', () => {
    // A wallet that never sold anything shows 0, not a rounding artefact.
    expect(netOfResaleFee(0n, LIVE_FEE_BPS)).toBe(0n)
  })

  it('holds at the scale of real lifetime totals', () => {
    // No precision loss: these are bigints, and a float would already be
    // wrong at this magnitude.
    expect(netOfResaleFee(1_234_567_890_123n, LIVE_FEE_BPS)).toBe(1_172_839_495_617n)
  })
})
