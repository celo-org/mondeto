import { describe, it, expect } from 'vitest'
import { generateUsername, __TEST__ } from '@/lib/username'

const { FRUITS, FIGURES, hashAddress } = __TEST__
const ZERO = '0x0000000000000000000000000000000000000000'

describe('generateUsername', () => {
  it('returns "unowned" for the zero address and empty input', () => {
    expect(generateUsername(ZERO)).toBe('unowned')
    expect(generateUsername('')).toBe('unowned')
  })

  it('produces a "{fruit}-{figure}" pair drawn from the curated lists', () => {
    const name = generateUsername('0xabc123def4567890000000000000000000000001')
    const [fruit, figure] = name.split('-')
    expect(FRUITS).toContain(fruit)
    expect(FIGURES).toContain(figure)
  })

  it('is deterministic — the same address always maps to the same name', () => {
    const a = '0xdeadbeef00000000000000000000000000000000'
    expect(generateUsername(a)).toBe(generateUsername(a))
  })

  it('is case-insensitive on the address', () => {
    const lower = '0xabcdef1234567890000000000000000000000000'
    expect(generateUsername(lower)).toBe(generateUsername(lower.toUpperCase()))
  })

  it('only ever emits names that exist in the lists (fuzz across seeds)', () => {
    // hashAddress reads only the first 6 hex chars, so vary the LEADING bytes.
    for (let i = 1; i <= 200; i++) {
      const addr = '0x' + i.toString(16).padStart(6, '0') + '0'.repeat(34)
      const [fruit, figure] = generateUsername(addr).split('-')
      expect(FRUITS).toContain(fruit)
      expect(FIGURES).toContain(figure)
    }
  })
})

describe('hashAddress', () => {
  it('derives a 24-bit int from the first 6 hex chars, case-insensitively', () => {
    expect(hashAddress('0xFFFFFF0000')).toBe(0xffffff)
    expect(hashAddress('0x0000ff1234')).toBe(0x0000ff)
    expect(hashAddress('0xABCDEF9999')).toBe(hashAddress('0xabcdef9999'))
  })
})
