import { describe, it, expect } from 'vitest'
import { latestReward, type RewardEntry } from '@/lib/rewards'

// A tiny helper so each case reads as "campaign X paid $Y (at T)".
function entry(campaignId: string, amountUsd: string, paidAt?: string): RewardEntry {
  return paidAt ? { campaignId, amountUsd, paidAt } : { campaignId, amountUsd }
}

describe('latestReward', () => {
  it('returns null for an empty list', () => {
    expect(latestReward([])).toBeNull()
  })

  it('returns the only entry', () => {
    const only = entry('c1', '1')
    expect(latestReward([only])).toBe(only)
  })

  it('returns the LAST entry when none are timestamped (never a sum)', () => {
    // The reported bug: two $1 wins must show $1 (the newest), not $2. The
    // admin repo appends new campaigns last, so array order is newest-last.
    const result = latestReward([entry('c1', '1'), entry('c2', '1')])
    expect(result?.campaignId).toBe('c2')
    expect(result?.amountUsd).toBe('1')
  })

  it('picks the newest paidAt regardless of array order', () => {
    const older = entry('c1', '5', '2026-07-20T00:00:00Z')
    const newer = entry('c2', '9', '2026-07-22T00:00:00Z')
    // Newer sits FIRST in the array — timestamp must win over position.
    expect(latestReward([newer, older])?.campaignId).toBe('c2')
    expect(latestReward([older, newer])?.campaignId).toBe('c2')
  })

  it('prefers a timestamped entry over an untimed one', () => {
    const timed = entry('c1', '5', '2026-07-22T00:00:00Z')
    const untimed = entry('c2', '9')
    expect(latestReward([timed, untimed])?.campaignId).toBe('c1')
    expect(latestReward([untimed, timed])?.campaignId).toBe('c1')
  })
})

describe('coerceEntry (via any-cast import path)', () => {
  // coerceEntry isn't exported, so exercise its paidAt handling through the
  // shape latestReward consumes: a valid paidAt string must survive and drive
  // ordering. (Full coercion is covered on the write side in the admin repo.)
  it('honours a valid paidAt string for ordering', () => {
    const a = entry('c1', '1', '2026-07-21T00:00:00Z')
    const b = entry('c2', '1', '2026-07-23T00:00:00Z')
    expect(latestReward([a, b])?.campaignId).toBe('c2')
  })

  it('falls back to array order when paidAt is absent', () => {
    const a = entry('c1', '1')
    const b = entry('c2', '1')
    expect(latestReward([a, b])?.campaignId).toBe('c2')
  })
})
