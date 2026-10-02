import { describe, expect, it } from 'vitest'
import { coerceCampaign } from '@/lib/campaign'

// mondeto#282: the public `campaign` key now carries what the payout ranks by.
describe('coerceCampaign reads the corridor fields the admin publishes', () => {
  const base = { id: 'c', text: 'x' }

  it('keeps board, strategy, label and both anchor lists', () => {
    const c = coerceCampaign({
      ...base,
      board: 'CAMPAIGN',
      strategy: 'CONNECT',
      label: 'New York → Mexico City',
      anchors: { from: [3094, 3095], to: [5795] },
    })!
    expect(c).toMatchObject({
      board: 'CAMPAIGN',
      strategy: 'CONNECT',
      label: 'New York → Mexico City',
      anchors: { from: [3094, 3095], to: [5795] },
    })
  })

  it('drops anchors the board could not rank, and never keeps half a corridor', () => {
    for (const anchors of [
      { from: [1] },
      { from: [], to: [2] },
      { from: [1.5], to: [2] },
      { from: [-1], to: [2] },
      { from: [17_000], to: [2] },
      [[1], [2]],
      'x',
    ]) {
      expect(coerceCampaign({ ...base, anchors })).not.toHaveProperty('anchors')
    }
    // Control: the grid's edges are valid pixels.
    expect(coerceCampaign({ ...base, anchors: { from: [0], to: [16_999] } })!.anchors).toEqual({ from: [0], to: [16_999] })
  })

  it('a key written before the admin published these fields reads exactly as before', () => {
    expect(coerceCampaign({ ...base, mapId: 0 })).toEqual({ ...base, mapId: 0 })
  })
})
