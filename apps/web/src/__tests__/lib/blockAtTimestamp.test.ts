import { describe, it, expect, vi, beforeEach } from 'vitest'

// A synthetic chain with a known timestamp per block, so the search can be
// asserted exactly rather than approximately. Block N has timestamp
// GENESIS + N, matching Celo's ~1s cadence closely enough for the boundary
// conditions that matter.
const GENESIS = 1_700_000_000n
let head = 1_000_000n

const getBlock = vi.fn(async (args?: { blockNumber?: bigint; blockTag?: string }) => {
  const number = args?.blockNumber ?? head
  return { number, timestamp: GENESIS + number }
})

vi.mock('@/lib/chain', () => ({
  fallbackReadClient: {
    getBlock: (args?: { blockNumber?: bigint; blockTag?: string }) => getBlock(args),
  },
}))

import { blockAtTimestamp } from '@/lib/blockAtTimestamp'

beforeEach(() => {
  head = 1_000_000n
  getBlock.mockClear()
})

describe('blockAtTimestamp', () => {
  it('lands on the exact block when the timestamp is one', () => {
    // A campaign boundary usually falls on a real block; hitting it exactly is
    // the case that decides who is inside the window.
    return expect(blockAtTimestamp(GENESIS + 500_000n)).resolves.toBe(500_000n)
  })

  it('never returns a block that had not happened yet', () => {
    // The invariant the whole search exists for: "at or before". A block after
    // the deadline would let a buy made past the close count inside the window.
    return blockAtTimestamp(GENESIS + 500_000n + 1n).then(async (block) => {
      const { timestamp } = await getBlock({ blockNumber: block })
      expect(timestamp).toBeLessThanOrEqual(GENESIS + 500_000n + 1n)
      expect(block).toBe(500_001n)
    })
  })

  it('saturates at the head instead of throwing on a future timestamp', () => {
    // A campaign scheduled to end later today resolves to "now" rather than
    // failing the whole board.
    return expect(blockAtTimestamp(GENESIS + 9_999_999n)).resolves.toBe(head)
  })

  it('saturates at genesis for a timestamp before the chain existed', () => {
    return expect(blockAtTimestamp(GENESIS - 1n)).resolves.toBe(0n)
  })

  it('finds the first and last blocks without walking past them', () => {
    return Promise.all([
      expect(blockAtTimestamp(GENESIS)).resolves.toBe(0n),
      expect(blockAtTimestamp(GENESIS + head)).resolves.toBe(head),
    ])
  })

  it('costs a logarithmic number of round trips, not a linear scan', async () => {
    // ~20 for a million blocks. A linear walk would be a million RPC calls and
    // would blow the route's maxDuration long before it answered.
    getBlock.mockClear()
    await blockAtTimestamp(GENESIS + 777_777n)
    expect(getBlock.mock.calls.length).toBeLessThan(30)
  })

  it('is deterministic — the same timestamp always resolves to the same block', async () => {
    // The payout is re-derived from these blocks, so instability here would
    // mean the same campaign could pay two different sets of people.
    const a = await blockAtTimestamp(GENESIS + 123_456n)
    const b = await blockAtTimestamp(GENESIS + 123_456n)
    expect(a).toBe(b)
  })
})
