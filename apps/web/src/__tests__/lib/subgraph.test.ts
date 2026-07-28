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
