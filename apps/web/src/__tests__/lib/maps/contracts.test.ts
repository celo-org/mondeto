import { describe, it, expect } from 'vitest'
import { celo, celoSepolia } from 'viem/chains'
import {
  getMapsForChain,
  getContractByMapId,
  isRevealedMapId,
  getRegistry,
} from '@/lib/maps/contracts'

describe('contracts registry', () => {
  it('exports at least one map for production (default env)', () => {
    expect(getRegistry().length).toBeGreaterThanOrEqual(1)
  })

  it('returns mainnet maps in ascending id order', () => {
    const list = getMapsForChain(celo.id)
    const ids = list.map((m) => m.id)
    const sorted = [...ids].sort((a, b) => a - b)
    expect(ids).toEqual(sorted)
  })

  it('only returns maps for the requested chain', () => {
    const mainnet = getMapsForChain(celo.id)
    const sepolia = getMapsForChain(celoSepolia.id)
    for (const m of mainnet) expect(m.chainId).toBe(celo.id)
    for (const m of sepolia) expect(m.chainId).toBe(celoSepolia.id)
  })

  it('omits unrevealed maps from getMapsForChain', () => {
    for (const m of getMapsForChain(celo.id)) expect(m.revealed).toBe(true)
  })

  it('getContractByMapId returns the matching address for a known map', () => {
    const first = getMapsForChain(celo.id)[0]
    expect(getContractByMapId(first.id, celo.id)).toBe(first.address)
  })

  it('getContractByMapId falls back to the first revealed map for unknown ids', () => {
    const fallback = getMapsForChain(celo.id)[0]
    expect(getContractByMapId(999, celo.id)).toBe(fallback.address)
  })

  it('isRevealedMapId is true for live maps and false for unrevealed/unknown ids', () => {
    const first = getMapsForChain(celo.id)[0]
    expect(isRevealedMapId(first.id, celo.id)).toBe(true)
    expect(isRevealedMapId(999, celo.id)).toBe(false)
  })

  it('addresses are 0x-prefixed 20-byte hex strings', () => {
    for (const m of getRegistry()) {
      expect(m.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })
})
