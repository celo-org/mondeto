import { describe, it, expect } from 'vitest'
import { getAttributionSuffix } from '@/lib/attribution'

describe('getAttributionSuffix', () => {
  it('produces a hex data-suffix for the builder-code attribution tag', () => {
    const suffix = getAttributionSuffix()
    expect(suffix).toMatch(/^0x[0-9a-fA-F]+$/)
  })

  it('is stable across calls (memoized)', () => {
    expect(getAttributionSuffix()).toBe(getAttributionSuffix())
  })
})
