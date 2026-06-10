import { describe, it, expect } from 'vitest'
import { celo, celoSepolia } from 'viem/chains'
import {
  getMapsForChain,
  getContractByMapId,
  getMapContractById,
  isRevealedMapId,
  getRegistry,
} from '@/lib/maps/contracts'

describe('contracts registry', () => {
  it('exposes the full world + continent lineup on Celo mainnet', () => {
    const list = getMapsForChain(celo.id)
    expect(list).toHaveLength(8)
    expect(list.map((m) => m.slug)).toEqual([
      'world',
      'africa',
      'asia',
      'europe',
      'north-america',
      'south-america',
      'oceania',
      'antarctica',
    ])
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
    expect(sepolia).toHaveLength(0) // all maps live on mainnet
    for (const m of mainnet) expect(m.chainId).toBe(celo.id)
  })

  it('omits unrevealed maps from getMapsForChain', () => {
    for (const m of getMapsForChain(celo.id)) expect(m.revealed).toBe(true)
  })

  it('carries per-map dimensions matching the deployed continent grids', () => {
    const byId = (id: number) => getMapsForChain(celo.id).find((m) => m.id === id)!
    expect(byId(0).width).toBe(170)
    expect(byId(0).height).toBe(100)
    expect(byId(1).width).toBe(127)
    expect(byId(1).height).toBe(134)
    expect(byId(7).slug).toBe('antarctica')
    expect(byId(7).width).toBe(145)
    expect(byId(7).height).toBe(117)
  })

  it('getContractByMapId returns the matching address for a known map', () => {
    const first = getMapsForChain(celo.id)[0]
    expect(getContractByMapId(first.id, celo.id)).toBe(first.address)
  })

  it('getContractByMapId falls back to the first revealed map for unknown ids', () => {
    const fallback = getMapsForChain(celo.id)[0]
    expect(getContractByMapId(999, celo.id)).toBe(fallback.address)
  })

  it('getMapContractById returns the full record with dims and slug', () => {
    const m = getMapContractById(1, celo.id)
    expect(m.slug).toBe('africa')
    expect(m.width).toBe(127)
    expect(m.height).toBe(134)
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
