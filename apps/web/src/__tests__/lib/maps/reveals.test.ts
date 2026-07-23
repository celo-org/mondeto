import { describe, it, expect } from 'vitest'
import { parseIds, defaultRevealedMapIdsClient } from '@/lib/maps/reveals'

describe('parseIds', () => {
  it('parses a comma list, trimming whitespace', () => {
    expect(parseIds('0, 1 ,2')).toEqual([0, 1, 2])
  })

  it('drops negative and non-integer entries', () => {
    expect(parseIds('0,-1,2.5,3')).toEqual([0, 3])
  })

  it('returns null for empty / missing input', () => {
    expect(parseIds('')).toBeNull()
    expect(parseIds('   ')).toBeNull()
    expect(parseIds(null)).toBeNull()
    expect(parseIds(undefined)).toBeNull()
  })

  it('returns an empty array when nothing parses (distinct from null)', () => {
    expect(parseIds('abc,-4')).toEqual([])
  })
})

describe('defaultRevealedMapIdsClient', () => {
  it('defaults to WORLD only when no env override is set', () => {
    // Guard: if a NEXT_PUBLIC_REVEALED_MAP_IDS override is present in the
    // environment, the env path (covered by parseIds above) takes over.
    if (process.env.NEXT_PUBLIC_REVEALED_MAP_IDS) return
    expect(defaultRevealedMapIdsClient()).toEqual([0])
  })
})
