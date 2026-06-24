import { describe, it, expect, afterEach, vi } from 'vitest'
import { celo, celoSepolia } from 'viem/chains'
import {
  getMapsForChain,
  getContractByMapId,
  getMapContractById,
  isRevealedMapId,
  getRegistry,
} from '@/lib/maps/contracts'

describe('contracts registry', () => {
  it('registers the full world + continent lineup (all 8) on Celo mainnet', () => {
    const all = getRegistry()
    expect(all).toHaveLength(8)
    expect(all.map((m) => m.slug)).toEqual([
      'world',
      'africa',
      'asia',
      'europe',
      'north-america',
      'south-america',
      'oceania',
      'antarctica',
    ])
    for (const m of all) expect(m.chainId).toBe(celo.id)
  })

  it('reveals only WORLD by default (gradual continent rollout)', () => {
    const list = getMapsForChain(celo.id)
    expect(list).toHaveLength(1)
    expect(list[0].slug).toBe('world')
  })

  it('only returns maps for the requested chain', () => {
    const sepolia = getMapsForChain(celoSepolia.id)
    expect(sepolia).toHaveLength(0) // all maps live on mainnet
  })

  it('omits unrevealed maps from getMapsForChain', () => {
    for (const m of getMapsForChain(celo.id)) expect(m.revealed).toBe(true)
  })

  it('carries per-map dimensions matching the deployed continent grids', () => {
    const byId = (id: number) => getRegistry().find((m) => m.id === id)!
    expect(byId(0).width).toBe(170)
    expect(byId(0).height).toBe(100)
    expect(byId(1).width).toBe(127)
    expect(byId(1).height).toBe(134)
    expect(byId(7).slug).toBe('antarctica')
    expect(byId(7).width).toBe(145)
    expect(byId(7).height).toBe(117)
  })

  it('getContractByMapId returns the matching address for the revealed map', () => {
    const first = getMapsForChain(celo.id)[0]
    expect(getContractByMapId(first.id, celo.id)).toBe(first.address)
  })

  it('getContractByMapId falls back to the first revealed map for unknown/hidden ids', () => {
    const fallback = getMapsForChain(celo.id)[0]
    expect(getContractByMapId(999, celo.id)).toBe(fallback.address)
  })

  it('getMapContractById returns the full record with dims and slug (registry-wide)', () => {
    const m = getMapContractById(0, celo.id)
    expect(m.slug).toBe('world')
    expect(m.width).toBe(170)
    expect(m.height).toBe(100)
  })

  it('isRevealedMapId is true for WORLD and false for a hidden continent', () => {
    expect(isRevealedMapId(0, celo.id)).toBe(true)
    expect(isRevealedMapId(1, celo.id)).toBe(false) // africa hidden by default
    expect(isRevealedMapId(999, celo.id)).toBe(false)
  })

  it('addresses are 0x-prefixed 20-byte hex strings', () => {
    for (const m of getRegistry()) {
      expect(m.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })
})

describe('preview-only address override (NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES)', () => {
  const EXAMPLE = '0x2E7F1c57db241D529f7BD6B1fA8229984267Af23'

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is a no-op when unset (production safety)', () => {
    const africa = getRegistry().find((m) => m.id === 1)!
    expect(africa.address).toBe('0x67F48829b8CaA06C89Ea010521548CF67E4F5c09')
  })

  it('repoints the targeted map address while keeping slug/dims', () => {
    vi.stubEnv('NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES', `1:${EXAMPLE}`)
    const africa = getRegistry().find((m) => m.id === 1)!
    expect(africa.address).toBe(EXAMPLE)
    expect(africa.slug).toBe('africa')
    expect(africa.width).toBe(127)
    expect(africa.height).toBe(134)
    // other maps are untouched
    expect(getRegistry().find((m) => m.id === 0)!.address).toBe(
      '0x44bA167119355C8397C855756C2581B0771393D7',
    )
  })

  it('flows through the address resolver once the map is also revealed', () => {
    // getContractByMapId only resolves revealed maps, so QA reveals the
    // overridden map too (NEXT_PUBLIC_REVEALED_MAP_IDS=0,1).
    vi.stubEnv('NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES', `1:${EXAMPLE}`)
    vi.stubEnv('NEXT_PUBLIC_REVEALED_MAP_IDS', '0,1')
    expect(getContractByMapId(1, celo.id)).toBe(EXAMPLE)
  })

  it('ignores malformed pairs (bad id or address)', () => {
    vi.stubEnv('NEXT_PUBLIC_MAP_ADDRESS_OVERRIDES', 'x:0xabc,1:not-an-address')
    const africa = getRegistry().find((m) => m.id === 1)!
    expect(africa.address).toBe('0x67F48829b8CaA06C89Ea010521548CF67E4F5c09')
  })
})
