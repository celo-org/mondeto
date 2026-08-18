import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * /api/pnl — the route that states what a wallet SPENT and EARNED. The replay
 * arithmetic (per-pixel credit to the previous owner, mixed-token decimal
 * normalization, resale-fee netting) is asserted here with recomputed-by-hand
 * expected values, per the money-path checklist.
 *
 * The chunked log scanner and the fee arithmetic have their own unit suites
 * (purchaseLogs.test.ts, resaleFee.test.ts); here they are mocked at the
 * seam except toMicrocents/netOfResaleFee, which stay real so the money
 * numbers below go through the production conversion code.
 */

const h = vi.hoisted(() => ({
  subgraphConfigured: vi.fn(),
  fetchOwnerPnl: vi.fn(),
  estimateHistoryFromBlock: vi.fn(),
  scanNormalizedPurchases: vi.fn(),
  readFeeRateBps: vi.fn(),
  getBlockNumber: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/lib/chain', () => ({
  fallbackReadClient: { getBlockNumber: () => h.getBlockNumber() },
}))

vi.mock('@/lib/subgraph', () => ({
  subgraphConfigured: () => h.subgraphConfigured(),
  fetchOwnerPnl: (addr: string) => h.fetchOwnerPnl(addr),
}))

vi.mock('@/lib/purchaseLogs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/purchaseLogs')>()),
  estimateHistoryFromBlock: (addr: string, current: bigint) =>
    h.estimateHistoryFromBlock(addr, current),
  scanNormalizedPurchases: (addr: string, from: bigint, to: bigint) =>
    h.scanNormalizedPurchases(addr, from, to),
}))

vi.mock('@/lib/resaleFee', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/resaleFee')>()),
  readFeeRateBps: (addr: string, mapId: number) => h.readFeeRateBps(addr, mapId),
}))

// The logger pulls the OTel SDK in; keep it out of jsdom and assert on it.
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: (...args: unknown[]) => h.loggerWarn(...args),
    error: (...args: unknown[]) => h.loggerError(...args),
  },
}))

import { GET } from '@/app/api/pnl/route'

const USDC = '0xceba9300f2b948710d2653dd7b07f33a8b32118c'
const CUSD = '0x765de816845861e75a25fca122bb6898b8b1282a'

// Realistic decoded PixelsPurchased log — only the fields the replay consumes
// vary per test; the envelope matches what viem's getLogs returns.
function purchase(opts: {
  buyer: string
  ids: bigint[]
  totalCost: bigint
  token?: string
  blockNumber?: bigint
  logIndex?: number
}) {
  return {
    address: '0x8ce50f0f76c592c542a5e349e2ae3c471cf9dc0f',
    args: {
      buyer: opts.buyer,
      token: opts.token ?? USDC,
      ids: opts.ids,
      totalCost: opts.totalCost,
    },
    blockHash: '0x89b0f2c6a1c2f4b4a1e2d3c4b5a69788f0e1d2c3b4a5968778695a4b3c2d1e0f',
    blockNumber: opts.blockNumber ?? 1n,
    data: '0x',
    eventName: 'PixelsPurchased',
    logIndex: opts.logIndex ?? 0,
    removed: false,
    topics: [],
    transactionHash: '0x2a1b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809',
    transactionIndex: 0,
  }
}

function get(address: string, mapId = 0) {
  return GET(new Request(`http://localhost/api/pnl?address=${address}&mapId=${mapId}`))
}

// The route keeps a warm (mapId, address) cache across requests; use a distinct
// wallet per test so tests stay independent, and reuse one only when the cache
// itself is under test.
let walletSeq = 0
function freshWallet(): string {
  walletSeq++
  return `0x${walletSeq.toString(16).padStart(40, '0')}`
}

beforeEach(() => {
  h.subgraphConfigured.mockReset().mockReturnValue(false)
  h.fetchOwnerPnl.mockReset()
  h.estimateHistoryFromBlock.mockReset().mockResolvedValue(0n)
  h.scanNormalizedPurchases.mockReset().mockResolvedValue({
    logs: [],
    tokenDecimals: new Map<string, number>(),
    failedChunks: 0,
    totalChunks: 1,
  })
  h.readFeeRateBps.mockReset().mockResolvedValue(0)
  h.getBlockNumber.mockReset().mockResolvedValue(50_000_000n)
  h.loggerWarn.mockReset()
  h.loggerError.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('/api/pnl address gate', () => {
  it('returns zeros without computing for a malformed address', async () => {
    for (const bad of ['', 'nope', '0x123', '1234567890123456789012345678901234567890']) {
      const res = await get(bad)
      expect(await res.json()).toEqual({ spent: '0', earned: '0' })
    }
    expect(h.subgraphConfigured).not.toHaveBeenCalled()
    expect(h.scanNormalizedPurchases).not.toHaveBeenCalled()
  })

  it('accepts a checksummed address and computes with it lowercased (control)', async () => {
    h.subgraphConfigured.mockReturnValue(true)
    h.fetchOwnerPnl.mockResolvedValue({ spent: '0', earned: '0' })
    const res = await get('0xcebA9300f2b948710d2653dD7B07f33A8B32118C')
    expect(res.status).toBe(200)
    expect(h.fetchOwnerPnl).toHaveBeenCalledWith(
      '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
    )
  })
})

describe('/api/pnl log-scan replay (legacy path, subgraph unset)', () => {
  it('sums SPENT gross and credits EARNED per pixel to the previous owner, mixed-token', async () => {
    const me = freshWallet()
    const buyerB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const buyerC = '0xcccccccccccccccccccccccccccccccccccccccc'
    h.scanNormalizedPurchases.mockResolvedValue({
      logs: [
        // I buy pixels 1+2 for $2 in USDC → SPENT 2_000_000.
        purchase({ buyer: me, ids: [1n, 2n], totalCost: 2_000_000n, blockNumber: 10n }),
        // B takes pixel 1 off me for $3.30 → EARNED +3_300_000 (gross).
        purchase({ buyer: buyerB, ids: [1n], totalCost: 3_300_000n, blockNumber: 20n }),
        // C buys pixels 2,3,4 for $1 paid in 18-decimal cUSD. Normalized to
        // 1_000_000 microcents; per-pixel 333_333 (truncated); only pixel 2
        // was mine → EARNED +333_333.
        purchase({
          buyer: buyerC,
          ids: [2n, 3n, 4n],
          totalCost: 1_000_000_000_000_000_000n,
          token: CUSD,
          blockNumber: 30n,
        }),
      ],
      tokenDecimals: new Map([
        [USDC, 6],
        [CUSD, 18],
      ]),
      failedChunks: 0,
      totalChunks: 4,
    })
    // 5% resale fee: gross earned 3_633_333 → fee 181_666 (truncated) → 3_451_667.
    h.readFeeRateBps.mockResolvedValue(500)

    const res = await get(me)
    expect(await res.json()).toEqual({ spent: '2000000', earned: '3451667' })
    // SPENT deliberately stays gross — the buyer really paid the whole price.
  })

  it('keeps EARNED gross when the fee rate is zero (control for the netting)', async () => {
    const me = freshWallet()
    const buyerB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    h.scanNormalizedPurchases.mockResolvedValue({
      logs: [
        purchase({ buyer: me, ids: [1n], totalCost: 1_000_000n, blockNumber: 10n }),
        purchase({ buyer: buyerB, ids: [1n], totalCost: 2_000_000n, blockNumber: 20n }),
      ],
      tokenDecimals: new Map([[USDC, 6]]),
      failedChunks: 0,
      totalChunks: 1,
    })
    h.readFeeRateBps.mockResolvedValue(0)
    const res = await get(me)
    expect(await res.json()).toEqual({ spent: '1000000', earned: '2000000' })
  })

  it('does not credit a sale of pixels the wallet never owned', async () => {
    const me = freshWallet()
    const buyerB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const buyerC = '0xcccccccccccccccccccccccccccccccccccccccc'
    h.scanNormalizedPurchases.mockResolvedValue({
      logs: [
        // B buys from treasury, then C buys from B — none of it is mine.
        purchase({ buyer: buyerB, ids: [9n], totalCost: 1_000_000n, blockNumber: 10n }),
        purchase({ buyer: buyerC, ids: [9n], totalCost: 2_000_000n, blockNumber: 20n }),
      ],
      tokenDecimals: new Map([[USDC, 6]]),
      failedChunks: 0,
      totalChunks: 1,
    })
    const res = await get(me)
    expect(await res.json()).toEqual({ spent: '0', earned: '0' })
  })

  it('handles an empty ids array without dividing by zero', async () => {
    const me = freshWallet()
    h.scanNormalizedPurchases.mockResolvedValue({
      logs: [purchase({ buyer: me, ids: [], totalCost: 1_000_000n, blockNumber: 10n })],
      tokenDecimals: new Map([[USDC, 6]]),
      failedChunks: 0,
      totalChunks: 1,
    })
    const res = await get(me)
    expect(await res.json()).toEqual({ spent: '1000000', earned: '0' })
  })

  it('short-circuits to zeros when the map has never been bought', async () => {
    const me = freshWallet()
    h.estimateHistoryFromBlock.mockResolvedValue(null)
    const res = await get(me)
    expect(await res.json()).toEqual({ spent: '0', earned: '0' })
    expect(h.scanNormalizedPurchases).not.toHaveBeenCalled()
  })

  it('surfaces dropped chunks in the log so a skewed figure is explainable', async () => {
    const me = freshWallet()
    h.scanNormalizedPurchases.mockResolvedValue({
      logs: [],
      tokenDecimals: new Map(),
      failedChunks: 3,
      totalChunks: 40,
    })
    await get(me)
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'P&L scan had failed chunks',
      expect.objectContaining({ failedChunks: 3, totalChunks: 40 }),
    )
  })
})

describe('/api/pnl subgraph path', () => {
  it('uses the indexed lifetime figures and nets EARNED of the resale fee', async () => {
    const me = freshWallet()
    h.subgraphConfigured.mockReturnValue(true)
    h.fetchOwnerPnl.mockResolvedValue({ spent: '5000000', earned: '1000000' })
    h.readFeeRateBps.mockResolvedValue(500)
    const res = await get(me)
    // earned 1_000_000 − 5% = 950_000; spent stays gross.
    expect(await res.json()).toEqual({ spent: '5000000', earned: '950000' })
    // The legacy scan never runs when the subgraph answers.
    expect(h.scanNormalizedPurchases).not.toHaveBeenCalled()
    expect(h.getBlockNumber).not.toHaveBeenCalled()
  })
})

describe('/api/pnl warm cache and failure posture', () => {
  it('serves the second request within the TTL from cache without recomputing', async () => {
    const me = freshWallet()
    h.subgraphConfigured.mockReturnValue(true)
    h.fetchOwnerPnl.mockResolvedValue({ spent: '5000000', earned: '1000000' })
    const first = await (await get(me)).json()
    const second = await (await get(me)).json()
    expect(second).toEqual(first)
    expect(h.fetchOwnerPnl).toHaveBeenCalledTimes(1)
  })

  it('recomputes for a different wallet (control: the cache is per-address)', async () => {
    const a = freshWallet()
    const b = freshWallet()
    h.subgraphConfigured.mockReturnValue(true)
    h.fetchOwnerPnl.mockResolvedValue({ spent: '0', earned: '0' })
    await get(a)
    await get(b)
    expect(h.fetchOwnerPnl).toHaveBeenCalledTimes(2)
  })

  it('serves stale over zero when a recompute fails after the TTL', async () => {
    vi.useFakeTimers()
    const me = freshWallet()
    h.subgraphConfigured.mockReturnValue(true)
    h.fetchOwnerPnl.mockResolvedValue({ spent: '5000000', earned: '1000000' })
    const warm = await (await get(me)).json()
    expect(warm).toEqual({ spent: '5000000', earned: '1000000' })

    vi.advanceTimersByTime(61_000) // past the 60s TTL
    h.fetchOwnerPnl.mockRejectedValue(new Error('subgraph HTTP 502'))
    const stale = await (await get(me)).json()
    expect(stale).toEqual({ spent: '5000000', earned: '1000000' })
    expect(h.loggerError).toHaveBeenCalled()
  })

  it('returns zeros when a compute fails with nothing cached (control for stale-serve)', async () => {
    const me = freshWallet()
    h.subgraphConfigured.mockReturnValue(true)
    h.fetchOwnerPnl.mockRejectedValue(new Error('subgraph HTTP 502'))
    const res = await get(me)
    expect(await res.json()).toEqual({ spent: '0', earned: '0' })
    expect(h.loggerError).toHaveBeenCalled()
  })
})
