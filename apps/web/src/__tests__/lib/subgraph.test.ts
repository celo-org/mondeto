import { describe, it, expect, vi, afterEach } from 'vitest'

const URL = 'https://example.test/api/public/project_x/subgraphs/mondeto/1.0.0/gn'

/** Re-import the module with a controlled NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL. */
async function load(url: string | undefined) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL', url ?? '')
  return import('@/lib/subgraph')
}

/** Mock global.fetch to return `{ data }` payloads in sequence. */
function mockFetch(payloads: unknown[]) {
  let i = 0
  const fn = vi.fn(async () => {
    const data = payloads[Math.min(i, payloads.length - 1)]
    i++
    return { ok: true, json: async () => ({ data }) } as unknown as Response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('subgraphConfigured', () => {
  it('is false when the URL is unset/empty', async () => {
    const m = await load('')
    expect(m.subgraphConfigured()).toBe(false)
  })

  it('is true when the URL is set', async () => {
    const m = await load(URL)
    expect(m.subgraphConfigured()).toBe(true)
  })
})

describe('fetchAreaLeaderboard', () => {
  it('applies the time tie-break — earlier lastGainAt wins on a value tie', async () => {
    const m = await load(URL)
    mockFetch([
      {
        owners: [
          { address: '0xLATE', pixelCount: 7, lastGainAt: '200' },
          { address: '0xEARLY', pixelCount: 7, lastGainAt: '100' },
          { address: '0xTOP', pixelCount: 10, lastGainAt: '999' },
        ],
      },
    ])
    const board = await m.fetchAreaLeaderboard('global')
    // value desc, then whoever reached the tied count first (smaller lastGainAt).
    expect(board.map((e) => e.address)).toEqual(['0xtop', '0xearly', '0xlate'])
    expect(board[0].value).toBe(10)
    expect(board[1].tiebreak).toBe(100)
  })

  it('pages until a short page, then stops', async () => {
    const m = await load(URL)
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      address: '0x' + i.toString(16).padStart(40, '0'),
      pixelCount: 2000 - i,
      lastGainAt: String(i),
    }))
    const page2 = [{ address: '0xaaa', pixelCount: 1, lastGainAt: '5' }]
    const fetchFn = mockFetch([{ ownerMapStats: page1 }, { ownerMapStats: page2 }])
    const board = await m.fetchAreaLeaderboard(0)
    expect(board.length).toBe(1001)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})

describe('fetchOwnerMapPnl', () => {
  it('returns zeros when the wallet has no row', async () => {
    const m = await load(URL)
    mockFetch([{ ownerMapStat: null }])
    expect(await m.fetchOwnerMapPnl(0, '0xABC')).toEqual({ spent: '0', earned: '0' })
  })

  it('returns the wallet row values (6-dec microcents)', async () => {
    const m = await load(URL)
    mockFetch([{ ownerMapStat: { totalSpent: '1500000', totalEarned: '250000' } }])
    expect(await m.fetchOwnerMapPnl(0, '0xABC')).toEqual({
      spent: '1500000',
      earned: '250000',
    })
  })
})

/** Mock fetch with full control of the HTTP envelope, not just `{ data }`. */
function mockRawFetch(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  let i = 0
  const fn = vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)]
    i++
    return {
      ok: r.ok,
      status: r.status ?? 200,
      json: async () => r.body,
    } as unknown as Response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('querySubgraph error handling', () => {
  it('resolves data on a clean 200 (control for the failure cases below)', async () => {
    const m = await load(URL)
    mockRawFetch([{ ok: true, body: { data: { owner: null } } }])
    await expect(m.querySubgraph('query { owner(id: "x") { id } }')).resolves.toEqual({
      owner: null,
    })
  })

  it('throws when the URL is not configured', async () => {
    const m = await load('')
    const fetchFn = mockRawFetch([{ ok: true, body: { data: {} } }])
    await expect(m.querySubgraph('query { _meta { block { number } } }')).rejects.toThrow(
      'NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL is not set',
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('throws with the status on an HTTP failure', async () => {
    const m = await load(URL)
    mockRawFetch([{ ok: false, status: 502, body: 'Bad Gateway' }])
    await expect(m.querySubgraph('query { owners { id } }')).rejects.toThrow(
      'subgraph HTTP 502',
    )
  })

  it('throws on a GraphQL error payload (the real Graph error shape)', async () => {
    const m = await load(URL)
    // Captured shape of a graph-node validation error: 200 OK, `errors` array
    // with message + locations — no `data` key at all.
    mockRawFetch([
      {
        ok: true,
        body: {
          errors: [
            {
              message:
                'Type `Int` is not a valid input type for argument `mapId` of field `ownerMapStats`',
              locations: [{ line: 2, column: 5 }],
            },
          ],
        },
      },
    ])
    await expect(m.querySubgraph('query { ownerMapStats { id } }')).rejects.toThrow(
      /subgraph error:.*not a valid input type/,
    )
  })

  it('throws when a 200 carries neither data nor errors', async () => {
    const m = await load(URL)
    mockRawFetch([{ ok: true, body: {} }])
    await expect(m.querySubgraph('query { owners { id } }')).rejects.toThrow(
      'subgraph returned no data',
    )
  })
})

describe('fetchOwnedPixelIds', () => {
  it('converts pixelId strings to contract ids and stops on a short page', async () => {
    const m = await load(URL)
    const fetchFn = mockFetch([
      { pixels: [{ pixelId: '1201' }, { pixelId: '7' }] },
    ])
    expect(await m.fetchOwnedPixelIds(0, '0xABC')).toEqual([1201, 7])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('pages past a full page before stopping', async () => {
    const m = await load(URL)
    const full = Array.from({ length: 1000 }, (_, i) => ({ pixelId: String(i) }))
    const fetchFn = mockFetch([
      { pixels: full },
      { pixels: [{ pixelId: '5000' }] },
    ])
    const ids = await m.fetchOwnedPixelIds(0, '0xABC')
    expect(ids).toHaveLength(1001)
    expect(ids[1000]).toBe(5000)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})

describe('fetchPixelTimestamps', () => {
  it('builds the pixelId → lastSoldAt map from one short page', async () => {
    const m = await load(URL)
    const fetchFn = mockFetch([
      { pixels: [{ pixelId: '42', lastSoldAt: '1755000000' }, { pixelId: '43', lastSoldAt: '1755000100' }] },
    ])
    const ts = await m.fetchPixelTimestamps(0)
    expect(ts.get(42)).toBe(1_755_000_000)
    expect(ts.get(43)).toBe(1_755_000_100)
    expect(ts.size).toBe(2)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('fires the remaining pages in parallel when the first page is full', async () => {
    const m = await load(URL)
    const full = Array.from({ length: 1000 }, (_, i) => ({
      pixelId: String(i),
      lastSoldAt: String(1_755_000_000 + i),
    }))
    const fetchFn = mockFetch([
      { pixels: full },
      { pixels: [{ pixelId: '9999', lastSoldAt: '1755999999' }] },
    ])
    const ts = await m.fetchPixelTimestamps(0)
    // First page + the 5 parallel skips (1000..5000).
    expect(fetchFn).toHaveBeenCalledTimes(6)
    expect(ts.get(9999)).toBe(1_755_999_999)
  })
})

describe('fetchMapStats', () => {
  it('is null when the map has no purchases yet', async () => {
    const m = await load(URL)
    mockFetch([{ mapStat: null }])
    expect(await m.fetchMapStats(0)).toBeNull()
  })

  it('passes the analytics row through untouched', async () => {
    const m = await load(URL)
    const row = {
      volumeAllTime: '123450000',
      txCountAllTime: 87,
      uniqueBuyers: 31,
      primaryProceeds: '100000000',
      resaleVolume: '23450000',
      feeRateBps: 500,
    }
    mockFetch([{ mapStat: row }])
    expect(await m.fetchMapStats(0)).toEqual(row)
  })
})

describe('fetchBatchesSince', () => {
  const batch = (ts: number, cost = '1000000') => ({
    buyer: '0x1111111111111111111111111111111111111111',
    totalCost: cost,
    timestamp: String(ts),
  })

  it('returns a short first page without firing the parallel pages', async () => {
    const m = await load(URL)
    const fetchFn = mockFetch([{ purchaseBatches: [batch(1_755_000_000)] }])
    const out = await m.fetchBatchesSince(0, 1_754_900_000)
    expect(out).toHaveLength(1)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('fans out the remaining pages in parallel when the first page is full', async () => {
    const m = await load(URL)
    const full = Array.from({ length: 1000 }, (_, i) => batch(1_755_000_000 + i))
    const fetchFn = mockFetch([
      { purchaseBatches: full },
      { purchaseBatches: [batch(1_755_100_000, '2500000')] },
    ])
    const out = await m.fetchBatchesSince(0, 1_754_900_000)
    // 1000 from the first page + 5 parallel pages each answering one row
    // (mockFetch repeats its last payload).
    expect(fetchFn).toHaveBeenCalledTimes(6)
    expect(out).toHaveLength(1005)
  })
})

describe('fetchRecentBatches / fetchProfilesFor', () => {
  it('returns recent batches newest-first as delivered', async () => {
    const m = await load(URL)
    const rows = [
      {
        id: '0x2a1b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809-3',
        buyer: '0x1111111111111111111111111111111111111111',
        pixelCountInBatch: 4,
        totalCost: '4000000',
        timestamp: '1755000200',
        txHash: '0x2a1b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809',
      },
    ]
    mockFetch([{ purchaseBatches: rows }])
    expect(await m.fetchRecentBatches(0, 8)).toEqual(rows)
  })

  it('skips the network entirely for an empty address list', async () => {
    const m = await load(URL)
    const fetchFn = mockFetch([{ ownerProfiles: [] }])
    expect(await m.fetchProfilesFor(0, [])).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('fetches profiles when addresses are given (control for the skip above)', async () => {
    const m = await load(URL)
    const rows = [
      { address: '0x1111111111111111111111111111111111111111', label: '0x6c656e61', color: 3 },
    ]
    const fetchFn = mockFetch([{ ownerProfiles: rows }])
    expect(
      await m.fetchProfilesFor(0, ['0x1111111111111111111111111111111111111111']),
    ).toEqual(rows)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
