import { describe, it, expect, vi, beforeEach } from 'vitest'

// The window resolution is the whole point of these tests: both Critical
// findings on #224 were in how the two boundary blocks are chosen, and the
// route is where that happens.
const { blockAtTimestamp, subgraphHead, fetchOwnerStatsAtBlock, readCampaignForBoard } =
  vi.hoisted(() => ({
    blockAtTimestamp: vi.fn(),
    subgraphHead: vi.fn(),
    fetchOwnerStatsAtBlock: vi.fn(),
    readCampaignForBoard: vi.fn(),
  }))

vi.mock('@/lib/blockAtTimestamp', () => ({ blockAtTimestamp }))
vi.mock('@/lib/subgraph', () => ({
  subgraphConfigured: () => true,
  subgraphHead,
  fetchOwnerStatsAtBlock,
}))
vi.mock('@/lib/campaign', () => ({ readCampaignForBoard }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

import { GET } from '@/app/api/campaign-board/route'

const START = '2026-08-15T09:00:00Z'
const END = '2026-08-15T21:00:00Z'
const START_BLOCK = 1_000_000n
const END_BLOCK = 1_043_200n

// A fresh campaign id per test so the route's warm-instance cache, which is
// module state, can't leak a previous test's board into the next one.
let seq = 0
function campaign(over: Record<string, unknown> = {}) {
  seq += 1
  return { id: `c${seq}`, text: 'x', startsAt: START, endsAt: END, ...over }
}

function get(query = 'mapId=0') {
  return GET(new Request(`https://example.test/api/campaign-board?${query}`))
}

beforeEach(() => {
  vi.clearAllMocks()
  blockAtTimestamp.mockImplementation(async (sec: bigint) =>
    sec === BigInt(Math.floor(Date.parse(START) / 1000)) ? START_BLOCK : END_BLOCK,
  )
  subgraphHead.mockResolvedValue(9_999_999n)
  fetchOwnerStatsAtBlock.mockResolvedValue([])
  readCampaignForBoard.mockResolvedValue({ campaign: campaign(), settled: false })
})

describe('campaign-board window resolution', () => {
  it('pins the campaign boundaries with no offset applied', async () => {
    // The payout's `resolveBlockNumber` returns `blockAtTimestamp(t)`
    // unmodified. Any offset here — even a well-meant reorg buffer — ranks a
    // different window than the one that pays, which is #48 one layer down.
    const body = await (await get()).json()
    expect(body.board.fromBlock).toBe(START_BLOCK.toString())
    expect(body.board.toBlock).toBe(END_BLOCK.toString())
  })

  it('reads the subgraph at exactly those two blocks', async () => {
    await get()
    const blocks = fetchOwnerStatsAtBlock.mock.calls.map((c) => c[1])
    expect(blocks).toEqual([Number(START_BLOCK), Number(END_BLOCK)])
  })

  it('clamps the end to the subgraph head when the campaign is still running', async () => {
    // `blockAtTimestamp` saturates at CHAIN head for a future endsAt, which is
    // always ahead of what the subgraph has indexed. Pinning above the indexed
    // head is an error from The Graph, not an empty result — so without this
    // clamp a live campaign renders "no active campaign".
    subgraphHead.mockResolvedValue(END_BLOCK - 500n)
    const body = await (await get()).json()
    expect(body.board.toBlock).toBe((END_BLOCK - 500n).toString())
    expect(body.board.fromBlock).toBe(START_BLOCK.toString()) // start is untouched
  })

  it('does not clamp when the subgraph is already past the window', async () => {
    const body = await (await get()).json()
    expect(body.board.toBlock).toBe(END_BLOCK.toString())
  })

  it('refuses to clamp a SETTLED window, and says it is still settling', async () => {
    // The clamp is right for a running board and wrong for a closed one: its
    // window is an explicit, audited boundary, and truncating it silently
    // re-targets the blocks the payout settles on — while the UI calls the
    // result final. The paying side refuses the same thing (`snapshot.ts`
    // clamps only for `latest`).
    //
    // The lag is the ordinary state right after the buzzer, not an edge case:
    // blockAtTimestamp reads the chain, subgraphHead reads the index.
    readCampaignForBoard.mockResolvedValue({ campaign: campaign(), settled: true })
    subgraphHead.mockResolvedValue(END_BLOCK - 30n)

    const body = await (await get()).json()
    expect(body.board).toBeNull()
    expect(body.settling).toBe(true)
    // Nothing was ranked from a truncated window.
    expect(fetchOwnerStatsAtBlock).not.toHaveBeenCalled()
  })

  it('serves a settled board once the index has caught up', async () => {
    readCampaignForBoard.mockResolvedValue({ campaign: campaign(), settled: true })
    subgraphHead.mockResolvedValue(END_BLOCK + 100n)

    const body = await (await get()).json()
    expect(body.board.toBlock).toBe(END_BLOCK.toString()) // the real end, unclamped
    expect(body.board.settled).toBe(true)
    expect(body.settling).toBeUndefined()
  })

  it('keeps settling distinct from failure and from no-campaign', async () => {
    // Three different nulls, three different things to tell the player.
    readCampaignForBoard.mockResolvedValue({ campaign: campaign(), settled: true })
    subgraphHead.mockResolvedValue(END_BLOCK - 30n)
    expect((await (await get()).json()).error).toBeUndefined()

    readCampaignForBoard.mockResolvedValue(null)
    const none = await (await get()).json()
    expect(none.settling).toBeUndefined()
    expect(none.error).toBeUndefined()
  })
})

describe('campaign-board gating', () => {
  it('serves nothing when no campaign is running', async () => {
    readCampaignForBoard.mockResolvedValue(null)
    const body = await (await get()).json()
    expect(body).toEqual({ board: null, you: null })
  })

  it('ignores a campaign targeting a different map', async () => {
    // Otherwise a map-3 campaign lights a CAMPAIGN board on all eight maps,
    // ranking growth nobody is being paid for.
    readCampaignForBoard.mockResolvedValue({ campaign: campaign({ mapId: 3 }), settled: false })
    const body = await (await get('mapId=0')).json()
    expect(body.board).toBeNull()
    expect(fetchOwnerStatsAtBlock).not.toHaveBeenCalled()
  })

  it('serves a campaign that targets this map', async () => {
    readCampaignForBoard.mockResolvedValue({ campaign: campaign({ mapId: 3 }), settled: false })
    const body = await (await get('mapId=3')).json()
    expect(body.board).not.toBeNull()
  })

  it('serves a campaign with no map set on any map', async () => {
    readCampaignForBoard.mockResolvedValue({ campaign: campaign({ mapId: undefined }), settled: false })
    expect((await (await get('mapId=5')).json()).board).not.toBeNull()
  })

  it('rejects an inverted window instead of ranking it backwards', async () => {
    readCampaignForBoard.mockResolvedValue({ campaign: campaign({ startsAt: END, endsAt: START }), settled: false })
    expect((await (await get()).json()).board).toBeNull()
  })
})

describe('campaign-board preview window', () => {
  // "Ignored entirely on the production deployment" was a docblock guarantee
  // with no test on either path (review on #224): deleting the VERCEL_ENV
  // early-return left the suite green. These two are the pin and its control.
  it('drops from/to entirely on the production deployment', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    try {
      readCampaignForBoard.mockResolvedValue(null)
      const body = await (await get(`mapId=0&from=${START}&to=${END}`)).json()
      expect(body).toEqual({ board: null, you: null })
      // Dropped means dropped: no window is resolved, nothing is read.
      expect(fetchOwnerStatsAtBlock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('honours from/to on a preview deployment (control)', async () => {
    // VERCEL_ENV is unset in this suite, which is the preview/local case.
    readCampaignForBoard.mockResolvedValue(null)
    const body = await (await get(`mapId=0&from=${START}&to=${END}`)).json()
    expect(body.board).not.toBeNull()
    expect(body.board.campaignId.startsWith('preview-')).toBe(true)
    expect(fetchOwnerStatsAtBlock).toHaveBeenCalled()
  })
})

describe('campaign-board failure handling', () => {
  it('marks a failure as failed, not as "no campaign running"', async () => {
    // A cold miss is ~50 sequential unretried getBlock calls plus two paged
    // subgraph reads. Collapsing one hiccup into the between-campaigns state
    // tells players there is no campaign during one.
    subgraphHead.mockRejectedValue(new Error('subgraph down'))
    const body = await (await get()).json()
    expect(body.board).toBeNull()
    expect(body.error).toBe(true)
  })

  it('keeps no-campaign distinguishable from failure', async () => {
    readCampaignForBoard.mockResolvedValue(null)
    expect((await (await get()).json()).error).toBeUndefined()
  })
})
