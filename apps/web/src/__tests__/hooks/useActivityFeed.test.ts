import { describe, it, expect } from 'vitest'
import {
  selectFreshBatches,
  toFeedItem,
  type RawBatch,
} from '@/hooks/useActivityFeed'
import { generateUsername } from '@/lib/username'

function batch(over: Partial<RawBatch> & { id: string }): RawBatch {
  return {
    buyer: '0x1111111111111111111111111111111111111111',
    pixelCount: 1,
    totalCost: '1000000', // 1.00
    timestamp: '100',
    txHash: over.id.split('-')[0] ?? '0xtx',
    label: null,
    color: 0,
    ...over,
  }
}

describe('selectFreshBatches', () => {
  it('seeds on first load without surfacing any history', () => {
    const seen = new Set<string>()
    const incoming = [batch({ id: 'a' }), batch({ id: 'b' })]
    const fresh = selectFreshBatches({ incoming, seen, isFirstLoad: true })
    expect(fresh).toHaveLength(0)
    // But everything is now marked seen, so it won't flood on the next poll.
    expect(seen.has('a')).toBe(true)
    expect(seen.has('b')).toBe(true)
  })

  it('surfaces only batches unseen after the seed load', () => {
    const seen = new Set<string>()
    selectFreshBatches({ incoming: [batch({ id: 'a' })], seen, isFirstLoad: true })
    const fresh = selectFreshBatches({
      incoming: [batch({ id: 'a' }), batch({ id: 'b' })],
      seen,
      isFirstLoad: false,
    })
    expect(fresh.map((b) => b.id)).toEqual(['b'])
  })

  it('never surfaces the same batch twice', () => {
    const seen = new Set<string>()
    // seed empty so first real poll can surface
    selectFreshBatches({ incoming: [], seen, isFirstLoad: true })
    const first = selectFreshBatches({
      incoming: [batch({ id: 'b' })],
      seen,
      isFirstLoad: false,
    })
    const second = selectFreshBatches({
      incoming: [batch({ id: 'b' })],
      seen,
      isFirstLoad: false,
    })
    expect(first.map((b) => b.id)).toEqual(['b'])
    expect(second).toHaveLength(0)
  })

  it("excludes the viewer's own purchases but still marks them seen", () => {
    const own = '0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa'
    const seen = new Set<string>()
    selectFreshBatches({ incoming: [], seen, isFirstLoad: true, ownAddress: own })
    const fresh = selectFreshBatches({
      incoming: [
        batch({ id: 'mine', buyer: own.toLowerCase() }),
        batch({ id: 'theirs', buyer: '0x2222222222222222222222222222222222222222' }),
      ],
      seen,
      isFirstLoad: false,
      ownAddress: own,
    })
    expect(fresh.map((b) => b.id)).toEqual(['theirs'])
    expect(seen.has('mine')).toBe(true)
  })

  it('returns fresh batches oldest-first regardless of input order', () => {
    const seen = new Set<string>()
    selectFreshBatches({ incoming: [], seen, isFirstLoad: true })
    const fresh = selectFreshBatches({
      incoming: [
        batch({ id: 'new', timestamp: '300' }),
        batch({ id: 'old', timestamp: '100' }),
        batch({ id: 'mid', timestamp: '200' }),
      ],
      seen,
      isFirstLoad: false,
    })
    expect(fresh.map((b) => b.id)).toEqual(['old', 'mid', 'new'])
  })
})

describe('toFeedItem', () => {
  it('uses the on-chain label when present', () => {
    const item = toFeedItem(batch({ id: 'a', label: 'Uniswap' }))
    expect(item.name).toBe('Uniswap')
  })

  it('falls back to a deterministic username when no label', () => {
    const buyer = '0x3333333333333333333333333333333333333333'
    const item = toFeedItem(batch({ id: 'a', buyer, label: null }))
    expect(item.name).toBe(generateUsername(buyer))
  })

  it('formats the batch total as USD', () => {
    const item = toFeedItem(batch({ id: 'a', totalCost: '12340000' }))
    expect(item.amount).toBe('12.34')
  })

  it('derives a hex color from the profile color when set', () => {
    const item = toFeedItem(batch({ id: 'a', color: 0xff4c00 }))
    expect(item.color).toBe('#ff4c00')
  })
})
