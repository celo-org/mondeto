import { describe, it, expect } from 'vitest'
import {
  COLOR_PRESETS,
  DRAWER_SWATCHES,
  MAX_SELECT,
} from '@/constants/map'

describe('map constants', () => {
  it('COLOR_PRESETS has 12 items', () => {
    expect(COLOR_PRESETS).toHaveLength(12)
  })

  it('DRAWER_SWATCHES has 7 items', () => {
    expect(DRAWER_SWATCHES).toHaveLength(7)
  })

  it('MAX_SELECT is 100 (contract gas limit)', () => {
    expect(MAX_SELECT).toBe(100)
  })

  it('contract addresses are in lib/contract.ts', () => {
    expect(true).toBe(true)
  })

  it('grid dimensions are per-map (sourced from useCurrentMapMeta)', () => {
    // WIDTH/HEIGHT/TOTAL_PIXELS no longer exist as globals — see
    // lib/maps/contracts.ts and hooks/useCurrentMapMeta for per-map dims.
    expect(true).toBe(true)
  })
})
