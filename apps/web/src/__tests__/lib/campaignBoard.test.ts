import { describe, it, expect } from 'vitest'
import { netGainEntries, ownStanding, type OwnerStatsRow } from '@/lib/campaignBoard'

const row = (address: string, pixelCount: number, lastGainAt: string): OwnerStatsRow => ({
  address,
  pixelCount,
  lastGainAt,
})

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const C = '0xcccccccccccccccccccccccccccccccccccccccc'

describe('netGainEntries', () => {
  it('ranks growth inside the window, not holdings at the end', () => {
    // The whole point of the board: the biggest holder can rank last if they
    // didn't move. Under LAND this order is exactly reversed.
    const start = [row(A, 800, '100'), row(B, 10, '100'), row(C, 0, '0')]
    const end = [row(A, 804, '500'), row(B, 33, '400'), row(C, 11, '300')]

    expect(netGainEntries(start, end).map((e) => [e.address, e.value])).toEqual([
      [B, 23],
      [C, 11],
      [A, 4],
    ])
  })

  it('treats a wallet absent at the start as zero, not as missing', () => {
    // Someone who arrived mid-window competes on the same terms.
    const entries = netGainEntries([], [row(A, 7, '100')])
    expect(entries).toEqual([{ address: A, value: 7, tiebreak: 100 }])
  })

  it('leaves out anyone who broke even or went backwards', () => {
    // The payout ranks netGain > 0 only, and the board has to match it.
    const start = [row(A, 10, '1'), row(B, 10, '1'), row(C, 10, '1')]
    const end = [row(A, 10, '2'), row(B, 7, '2'), row(C, 12, '2')]

    expect(netGainEntries(start, end).map((e) => e.address)).toEqual([C])
  })

  it('breaks a tie by who reached their final gain first', () => {
    // Equal gain, so the earlier end-block lastGainAt wins — never the address.
    const start = [row(A, 0, '0'), row(B, 0, '0')]
    const end = [row(A, 5, '900'), row(B, 5, '400')]

    expect(netGainEntries(start, end).map((e) => e.address)).toEqual([B, A])
  })

  it('falls back to address only when gain and time both tie', () => {
    const start = [row(B, 0, '0'), row(A, 0, '0')]
    const end = [row(B, 5, '400'), row(A, 5, '400')]

    expect(netGainEntries(start, end).map((e) => e.address)).toEqual([A, B])
  })

  it('is order-independent and stable across re-runs', () => {
    // Re-running the same window must yield an identical order — it is what
    // the payout is re-derived from, so any instability is a paid-wrong bug.
    const start = [row(C, 1, '1'), row(A, 1, '1'), row(B, 1, '1')]
    const end = [row(B, 6, '300'), row(C, 4, '200'), row(A, 6, '100')]

    const first = netGainEntries(start, end).map((e) => e.address)
    const again = netGainEntries([...start].reverse(), [...end].reverse()).map((e) => e.address)
    expect(first).toEqual(again)
    expect(first).toEqual([A, B, C]) // A and B tie at 5; A reached it first
  })

  it('matches addresses regardless of checksum casing', () => {
    // The subgraph returns lowercase, but nothing guarantees a caller does.
    const start = [row(A.toUpperCase(), 10, '1')]
    const end = [row(A, 14, '2')]
    expect(netGainEntries(start, end)).toEqual([{ address: A, value: 4, tiebreak: 2 }])
  })

  it('returns nothing when nobody moved', () => {
    const rows = [row(A, 5, '1'), row(B, 3, '1')]
    expect(netGainEntries(rows, rows)).toEqual([])
  })
})

describe('ownStanding', () => {
  it('reports the drop for a wallet that was raided', () => {
    // This is the case the board cannot show: not ranked, but the player still
    // needs to see what happened instead of silently disappearing.
    expect(ownStanding(A, [row(A, 10, '1')], [row(A, 7, '2')])).toEqual({
      netGain: -3,
      ranks: false,
    })
  })

  it('agrees with the board about who ranks', () => {
    const start = [row(A, 0, '0')]
    const end = [row(A, 4, '5')]
    const standing = ownStanding(A, start, end)
    const ranked = netGainEntries(start, end).some((e) => e.address === A)
    expect(standing.ranks).toBe(ranked)
    expect(standing.netGain).toBe(4)
  })

  it('treats breaking even as not ranking', () => {
    expect(ownStanding(A, [row(A, 5, '1')], [row(A, 5, '9')])).toEqual({
      netGain: 0,
      ranks: false,
    })
  })

  it('reports zero for a wallet that was never there', () => {
    expect(ownStanding(C, [row(A, 5, '1')], [row(A, 9, '2')])).toEqual({
      netGain: 0,
      ranks: false,
    })
  })
})
