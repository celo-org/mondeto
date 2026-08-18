import { describe, it, expect, vi, beforeEach } from 'vitest'

// The scanners read through the module-level fallbackReadClient; mock it so we
// can assert exactly which getLogs windows are requested and drive the contract
// reads (halvingStartTimestamp / tokenConfig) and getBlock per test.
const getLogs = vi.fn()
const readContract = vi.fn()
const getBlock = vi.fn()
vi.mock('@/lib/chain', () => ({
  fallbackReadClient: {
    getLogs: (args: { fromBlock: bigint; toBlock: bigint }) => getLogs(args),
    readContract: (args: { functionName: string; args?: unknown[] }) => readContract(args),
    getBlock: (args: { blockNumber: bigint }) => getBlock(args),
  },
}))

import {
  scanPurchaseLogs,
  scanNormalizedPurchases,
  estimateHistoryFromBlock,
  toMicrocents,
} from '@/lib/purchaseLogs'

const ADDR = '0x00000000000000000000000000000000000000ab' as `0x${string}`

beforeEach(() => {
  getLogs.mockReset()
  getLogs.mockResolvedValue([])
  readContract.mockReset()
  getBlock.mockReset()
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

describe('toMicrocents (mixed-token money normalization)', () => {
  it('passes a 6-decimal amount through unchanged', () => {
    expect(toMicrocents(1_234_567n, 6)).toBe(1_234_567n)
  })

  it('scales an 18-decimal amount down by 10^12, truncating', () => {
    // 1.234567890123456789 cUSD (e18) → 1.234567 in microcents; the sub-micro
    // tail is truncated, never rounded up.
    expect(toMicrocents(1_234_567_890_123_456_789n, 18)).toBe(1_234_567n)
  })

  it('truncates a sub-microcent 18-decimal dust amount to zero', () => {
    expect(toMicrocents(999_999_999_999n, 18)).toBe(0n)
  })

  it('scales a low-decimal amount up (never truncates)', () => {
    expect(toMicrocents(5n, 0)).toBe(5_000_000n)
    expect(toMicrocents(123n, 5)).toBe(1_230n)
  })

  it('handles the 7-decimal boundary just above the target unit', () => {
    expect(toMicrocents(12_345_678n, 7)).toBe(1_234_567n)
  })

  it('keeps mixed-token sums in one magnitude — the reason it exists', () => {
    // $1 paid in USDC (e6) and $1 paid in USDm (e18) must sum to $2, not
    // $1 + $10^12.
    const usdc = toMicrocents(1_000_000n, 6)
    const usdm = toMicrocents(1_000_000_000_000_000_000n, 18)
    expect(usdc + usdm).toBe(2_000_000n)
  })
})

describe('estimateHistoryFromBlock', () => {
  it('returns null when the map has never been bought (halving clock unset)', async () => {
    readContract.mockResolvedValue(0n) // halvingStartTimestamp
    getBlock.mockResolvedValue({ timestamp: 1_755_000_000n })
    expect(await estimateHistoryFromBlock(ADDR, 10_000_000n)).toBeNull()
  })

  it('walks back seconds-since-first-sale plus the safety buffer', async () => {
    // Celo L2 is ~1s/block: 50_000s since the first sale ≈ 50_000 blocks, plus
    // the 100_000-block safety margin → scan starts 150_000 blocks back.
    readContract.mockResolvedValue(1_754_950_000n)
    getBlock.mockResolvedValue({ timestamp: 1_755_000_000n })
    expect(await estimateHistoryFromBlock(ADDR, 10_000_000n)).toBe(9_850_000n)
  })

  it('clamps to block 0 rather than going negative on a young chain', async () => {
    readContract.mockResolvedValue(1_754_950_000n)
    getBlock.mockResolvedValue({ timestamp: 1_755_000_000n })
    // 50_000 elapsed + 100_000 buffer > 120_000 current → clamp to genesis.
    expect(await estimateHistoryFromBlock(ADDR, 120_000n)).toBe(0n)
  })
})

// Realistic viem getLogs entry for the PixelsPurchased event — the full decoded
// log shape (topics/data/eventName/args) as fallbackReadClient.getLogs returns
// it, so the sort and normalization are exercised against what production sees.
function purchaseLog(opts: {
  blockNumber: bigint
  logIndex: number
  buyer?: string
  token?: string
  ids?: bigint[]
  totalCost?: bigint
}) {
  const buyer = opts.buyer ?? '0x1111111111111111111111111111111111111111'
  const token = opts.token ?? '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'
  return {
    address: ADDR,
    args: {
      buyer,
      token,
      ids: opts.ids ?? [1n],
      totalCost: opts.totalCost ?? 1_000_000n,
    },
    blockHash: '0x89b0f2c6a1c2f4b4a1e2d3c4b5a69788f0e1d2c3b4a5968778695a4b3c2d1e0f',
    blockNumber: opts.blockNumber,
    data: '0x',
    eventName: 'PixelsPurchased',
    logIndex: opts.logIndex,
    removed: false,
    topics: [
      '0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31',
      `0x000000000000000000000000${buyer.slice(2)}`,
      `0x000000000000000000000000${token.slice(2)}`,
    ],
    transactionHash: '0x2a1b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809',
    transactionIndex: 3,
  }
}

describe('scanNormalizedPurchases', () => {
  const USDC = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'
  const CUSD = '0x765DE816845861e75A25fCA122bb6898B8B1282a'

  beforeEach(() => {
    // tokenConfig(token) → [accepted, decimals]; halving reads don't happen here.
    readContract.mockImplementation((args: { functionName: string; args?: unknown[] }) => {
      if (args.functionName === 'tokenConfig') {
        const token = String((args.args as string[])[0]).toLowerCase()
        if (token === CUSD.toLowerCase()) return Promise.resolve([true, 18])
        return Promise.resolve([true, 6])
      }
      return Promise.reject(new Error(`unexpected read ${args.functionName}`))
    })
  })

  it('returns logs sorted chronologically — block first, then logIndex', async () => {
    // The ownership replay in /api/pnl credits the *previous* owner, so order
    // is money-correctness, not cosmetics. Deliver logs shuffled across chunks.
    getLogs
      .mockResolvedValueOnce([
        purchaseLog({ blockNumber: 300n, logIndex: 2 }),
        purchaseLog({ blockNumber: 100n, logIndex: 5 }),
      ])
      .mockResolvedValue([purchaseLog({ blockNumber: 300n, logIndex: 0 })])
    const res = await scanNormalizedPurchases(ADDR, 0n, 9_999n)
    expect(
      res.logs.map((l) => [l.blockNumber, l.logIndex]),
    ).toEqual([
      [100n, 5],
      [300n, 0],
      [300n, 2],
    ])
  })

  it('resolves each token’s decimals once, case-insensitively', async () => {
    getLogs.mockResolvedValue([
      purchaseLog({ blockNumber: 1n, logIndex: 0, token: USDC }),
      purchaseLog({ blockNumber: 2n, logIndex: 0, token: USDC.toLowerCase() }),
      purchaseLog({ blockNumber: 3n, logIndex: 0, token: CUSD }),
    ])
    const res = await scanNormalizedPurchases(ADDR, 0n, 4_999n)
    const configReads = readContract.mock.calls.filter(
      (c) => (c[0] as { functionName: string }).functionName === 'tokenConfig',
    )
    // Two unique tokens (USDC appears in two casings) → two reads, not three.
    expect(configReads).toHaveLength(2)
    expect(res.tokenDecimals.get(USDC.toLowerCase())).toBe(6)
    expect(res.tokenDecimals.get(CUSD.toLowerCase())).toBe(18)
  })

  it('falls back to 6 decimals when a tokenConfig read fails, keeping good tokens exact', async () => {
    // The control (CUSD → 18) runs in the same scan, so the fallback assertion
    // can't pass vacuously against a mock that always fails.
    readContract.mockImplementation((args: { functionName: string; args?: unknown[] }) => {
      const token = String((args.args as string[])[0]).toLowerCase()
      if (token === CUSD.toLowerCase()) return Promise.resolve([true, 18])
      return Promise.reject(new Error('HTTP request failed. Status: 429. URL: https://forno.celo.org'))
    })
    getLogs.mockResolvedValue([
      purchaseLog({ blockNumber: 1n, logIndex: 0, token: USDC }),
      purchaseLog({ blockNumber: 2n, logIndex: 0, token: CUSD }),
    ])
    const res = await scanNormalizedPurchases(ADDR, 0n, 4_999n)
    expect(res.tokenDecimals.get(USDC.toLowerCase())).toBe(6)
    expect(res.tokenDecimals.get(CUSD.toLowerCase())).toBe(18)
  })

  it('propagates failed-chunk accounting from the underlying scan', async () => {
    getLogs
      .mockResolvedValueOnce([purchaseLog({ blockNumber: 1n, logIndex: 0 })])
      .mockRejectedValueOnce(new Error('RPC 400: range too large'))
      .mockResolvedValue([])
    const res = await scanNormalizedPurchases(ADDR, 0n, 12_000n)
    expect(res.failedChunks).toBe(1)
    expect(res.totalChunks).toBe(3)
    expect(res.logs).toHaveLength(1)
  })
})
