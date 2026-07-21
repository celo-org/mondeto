import { describe, it, expect, vi, beforeEach } from 'vitest'

// scanPurchaseLogs reads through the module-level fallbackReadClient; mock it so
// we can assert exactly which getLogs windows it requests.
const getLogs = vi.fn()
vi.mock('@/lib/chain', () => ({
  fallbackReadClient: {
    getLogs: (args: { fromBlock: bigint; toBlock: bigint }) => getLogs(args),
  },
}))

import { scanPurchaseLogs } from '@/lib/purchaseLogs'

const ADDR = '0x00000000000000000000000000000000000000ab' as `0x${string}`

beforeEach(() => {
  getLogs.mockReset()
  getLogs.mockResolvedValue([])
})

function windows(): Array<{ from: bigint; to: bigint }> {
  return getLogs.mock.calls.map((c) => {
    const a = c[0] as { fromBlock: bigint; toBlock: bigint }
    return { from: a.fromBlock, to: a.toBlock }
  })
}

describe('scanPurchaseLogs chunking (regression guard for the silent-zero P&L/analytics bug)', () => {
  it('never requests a getLogs window wider than the RPC ~5k-block limit', async () => {
    // The original code used 50k-block windows, which public Celo RPCs reject
    // (or partially answer) — every chunk failed and P&L/analytics silently
    // read $0. Every window must stay <= 5000 blocks so this can't regress.
    await scanPurchaseLogs(ADDR, 0n, 200_000n)
    expect(getLogs).toHaveBeenCalled()
    for (const w of windows()) {
      expect(w.to - w.from + 1n).toBeLessThanOrEqual(5_000n)
    }
  })

  it('covers the whole block range contiguously — no gaps, no overlaps', async () => {
    await scanPurchaseLogs(ADDR, 1_000n, 13_456n)
    const ranges = windows().sort((a, b) => (a.from < b.from ? -1 : 1))
    expect(ranges[0].from).toBe(1_000n)
    expect(ranges[ranges.length - 1].to).toBe(13_456n)
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].from).toBe(ranges[i - 1].to + 1n)
    }
  })

  it('aggregates logs across all chunks', async () => {
    getLogs.mockReset()
    getLogs.mockResolvedValue([{ ok: true }])
    const res = await scanPurchaseLogs(ADDR, 0n, 12_000n) // 3 chunks: 5k, 5k, 2k
    expect(res.totalChunks).toBe(3)
    expect(res.logs).toHaveLength(3)
    expect(res.failedChunks).toBe(0)
  })

  it('tolerates a failed chunk instead of throwing, and reports the count', async () => {
    getLogs.mockReset()
    getLogs
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockRejectedValueOnce(new Error('RPC 400: range too large'))
      .mockResolvedValue([])
    const res = await scanPurchaseLogs(ADDR, 0n, 12_000n)
    expect(res.failedChunks).toBe(1)
    expect(res.logs).toHaveLength(1) // only the successful non-empty chunk
  })
})
