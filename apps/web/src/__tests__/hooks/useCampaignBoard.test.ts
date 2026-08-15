import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCampaignBoard } from '@/hooks/useCampaignBoard'

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function respondWith(body: unknown) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => body })
}

const RUNNING = {
  board: {
    campaignId: 'sat-climb',
    entries: [
      { address: A, value: 23 },
      { address: B, value: 4 },
    ],
    startsAt: '2026-08-15T09:00:00Z',
    endsAt: '2026-08-15T21:00:00Z',
  },
  you: { netGain: 4, ranks: true },
}

beforeEach(() => {
  fetchMock.mockReset()
})

describe('useCampaignBoard', () => {
  it('ranks growth and renders it with an explicit sign', async () => {
    respondWith(RUNNING)
    const { result } = renderHook(() => useCampaignBoard(0))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.board?.entries.map((e) => [e.rank, e.value, e.unit])).toEqual([
      [1, '+23', 'PX'],
      [2, '+4', 'PX'],
    ])
  })

  it('treats no running campaign as the ordinary state, not an error', async () => {
    // Campaigns run on selected days, so this is what the tab shows most of
    // the time. It has to be distinguishable from a failure.
    respondWith({ board: null, you: null })
    const { result } = renderHook(() => useCampaignBoard(0))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.board).toBeNull()
    expect(result.current.you).toBeNull()
  })

  it('reports a raided wallet even though it cannot rank', async () => {
    // The case the board itself cannot show: negative movement is excluded
    // from the ranking, so without this the player just vanishes.
    respondWith({
      board: { ...RUNNING.board, entries: [{ address: A, value: 23 }] },
      you: { netGain: -3, ranks: false },
    })
    const { result } = renderHook(() => useCampaignBoard(0, B))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.you).toBeNull() // no row — not ranked
    expect(result.current.yourNetGain).toBe(-3) // but the drop is reported
  })

  it('builds the standing and gap for a wallet that does rank', async () => {
    respondWith(RUNNING)
    const { result } = renderHook(() => useCampaignBoard(0, B))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.you?.entry.rank).toBe(2)
    expect(result.current.you?.gap).toBe(19) // 23 − 4
  })

  it('gives rank 1 no gap to chase', async () => {
    respondWith(RUNNING)
    const { result } = renderHook(() => useCampaignBoard(0, A))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.you?.entry.rank).toBe(1)
    expect(result.current.you?.gap).toBeNull()
  })

  it('passes the viewer only when there is one', async () => {
    respondWith(RUNNING)
    renderHook(() => useCampaignBoard(3))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('mapId=3')
    expect(url).not.toContain('address=')
    expect(url).not.toContain('from=')
  })

  it('forwards an explicit window when one is given', async () => {
    // Only meaningful on a preview — the route drops these on production — so
    // the hook forwards them unconditionally rather than trying to guess the
    // environment from the client.
    respondWith(RUNNING)
    renderHook(() =>
      useCampaignBoard(0, undefined, undefined, {
        from: '2026-08-15T09:00:00Z',
        to: '2026-08-15T21:00:00Z',
      }),
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('from=2026-08-15T09%3A00%3A00Z')
    expect(url).toContain('to=2026-08-15T21%3A00%3A00Z')
  })

  it('ignores a half-specified window', async () => {
    respondWith(RUNNING)
    renderHook(() =>
      useCampaignBoard(0, undefined, undefined, { from: '2026-08-15T09:00:00Z', to: '' }),
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('from=')
  })

  it('falls back to the between-campaigns state when the route fails', async () => {
    // The map is the product; a missing board is not worth an error screen.
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const { result } = renderHook(() => useCampaignBoard(0))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.board).toBeNull()
  })

  it('prefers a saved profile name over the generated one', async () => {
    respondWith(RUNNING)
    const profiles = new Map([[A, { label: 'ALICE', url: '', color: '#fff' }]])
    const { result } = renderHook(() => useCampaignBoard(0, undefined, profiles))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.board?.entries[0].label).toBe('ALICE')
    // The unnamed wallet still gets something readable rather than an address.
    expect(result.current.board?.entries[1].label).toBeTruthy()
  })
})
