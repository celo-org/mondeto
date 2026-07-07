import { describe, it, expect } from 'vitest'
import {
  hexToUint24,
  uint24ToHex,
  formatUSDT,
  isValidHex,
  ownerDefaultColor,
} from '@/lib/colorUtils'
import { ZERO_ADDRESS } from '@/constants/map'

describe('hexToUint24', () => {
  it('converts black', () => {
    expect(hexToUint24('#000000')).toBe(0)
  })

  it('converts white', () => {
    expect(hexToUint24('#ffffff')).toBe(16777215)
  })

  it('converts red', () => {
    expect(hexToUint24('#ff0000')).toBe(0xff0000)
  })

  it('handles without hash', () => {
    expect(hexToUint24('3498db')).toBe(0x3498db)
  })
})

describe('uint24ToHex', () => {
  it('converts 0 to black', () => {
    expect(uint24ToHex(0)).toBe('#000000')
  })

  it('converts 16777215 to white', () => {
    expect(uint24ToHex(16777215)).toBe('#ffffff')
  })

  it('pads short values', () => {
    expect(uint24ToHex(0x000042)).toBe('#000042')
  })

  it('round-trips with hexToUint24', () => {
    expect(uint24ToHex(hexToUint24('#e74c3c'))).toBe('#e74c3c')
  })
})

describe('formatUSDT', () => {
  it('formats zero', () => {
    expect(formatUSDT(0n)).toBe('0.00')
  })

  it('formats 1 USDT', () => {
    expect(formatUSDT(1000000n)).toBe('1.00')
  })

  it('formats fractional value', () => {
    expect(formatUSDT(1500000n)).toBe('1.50')
  })

  it('formats small value', () => {
    expect(formatUSDT(10000n)).toBe('0.01')
  })

  it('formats large value', () => {
    expect(formatUSDT(123456789n)).toBe('123.45')
  })
})

describe('ownerDefaultColor', () => {
  // Regression: the map uses the contract's lowercase `pixel.owner`, while the
  // profile seed uses wagmi's checksummed address. Both must resolve to the
  // same color, or an owner's own pixel changes color when they connect.
  it('is case-insensitive (checksummed vs lowercase match)', () => {
    const checksummed = '0xAbC1230000000000000000000000000000DeF456'
    const lower = checksummed.toLowerCase()
    expect(ownerDefaultColor(checksummed)).toBe(ownerDefaultColor(lower))
  })

  it('returns a stable color for a given address', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678'
    expect(ownerDefaultColor(addr)).toBe(ownerDefaultColor(addr))
  })

  it('falls back to the first palette color for empty/zero address', () => {
    const fallback = ownerDefaultColor(undefined)
    expect(ownerDefaultColor(ZERO_ADDRESS)).toBe(fallback)
    expect(ownerDefaultColor(ZERO_ADDRESS.toUpperCase())).toBe(fallback)
  })
})

describe('isValidHex', () => {
  it('accepts valid 6-digit hex with hash', () => {
    expect(isValidHex('#e74c3c')).toBe(true)
  })

  it('rejects without hash', () => {
    expect(isValidHex('e74c3c')).toBe(false)
  })

  it('rejects short hex', () => {
    expect(isValidHex('#fff')).toBe(false)
  })

  it('rejects non-hex chars', () => {
    expect(isValidHex('#gggggg')).toBe(false)
  })

  it('accepts uppercase', () => {
    expect(isValidHex('#AABBCC')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidHex('')).toBe(false)
  })
})
