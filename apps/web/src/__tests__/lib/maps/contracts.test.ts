import { describe, it, expect } from 'vitest'
import {
  MAP_CONTRACTS,
  getRevealedMaps,
  getContractByMapId,
  isRevealedMapId,
} from '@/lib/maps/contracts'

describe('contracts registry', () => {
  it('exports at least one revealed map (launch baseline)', () => {
    const revealed = getRevealedMaps()
    expect(revealed.length).toBeGreaterThanOrEqual(1)
  })

  it('returns revealed maps in ascending id order', () => {
    const revealed = getRevealedMaps()
    const ids = revealed.map((m) => m.id)
    const sorted = [...ids].sort((a, b) => a - b)
    expect(ids).toEqual(sorted)
  })

  it('omits unrevealed maps from getRevealedMaps()', () => {
    const revealed = getRevealedMaps()
    for (const m of revealed) {
      expect(m.revealed).toBe(true)
    }
  })

  it('getContractByMapId returns the matching address for a revealed map', () => {
    const first = getRevealedMaps()[0]
    expect(getContractByMapId(first.id)).toBe(first.address)
  })

  it('getContractByMapId falls back to a revealed map for unknown ids', () => {
    const fallback = getRevealedMaps()[0]
    // 999 is intentionally outside the deployed lineup.
    expect(getContractByMapId(999)).toBe(fallback.address)
  })

  it('isRevealedMapId is true for live maps and false for unrevealed/unknown ids', () => {
    const first = getRevealedMaps()[0]
    expect(isRevealedMapId(first.id)).toBe(true)
    expect(isRevealedMapId(999)).toBe(false)
  })

  it('addresses are 0x-prefixed 20-byte hex strings', () => {
    for (const m of MAP_CONTRACTS) {
      expect(m.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })
})
