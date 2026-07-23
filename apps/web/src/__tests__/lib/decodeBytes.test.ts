import { describe, it, expect } from 'vitest'
import { decodeBytes } from '@/lib/decodeBytes'

// 'Lena' = 4c 65 6e 61
const LENA_HEX = '0x4c656e61'

describe('decodeBytes', () => {
  it('decodes a hex string to UTF-8', () => {
    expect(decodeBytes(LENA_HEX)).toBe('Lena')
  })

  it('decodes a Uint8Array to UTF-8', () => {
    expect(decodeBytes(new Uint8Array([0x4c, 0x65, 0x6e, 0x61]))).toBe('Lena')
  })

  it('strips embedded NUL padding', () => {
    expect(decodeBytes('0x4c656e6100000000')).toBe('Lena')
    expect(decodeBytes(new Uint8Array([0x4c, 0x00, 0x00]))).toBe('L')
  })

  it('treats empty markers as empty string', () => {
    expect(decodeBytes('0x')).toBe('')
    expect(decodeBytes('')).toBe('')
    expect(decodeBytes(undefined)).toBe('')
    expect(decodeBytes(null)).toBe('')
    expect(decodeBytes(0)).toBe('')
  })

  it('passes through an already-decoded plain string', () => {
    expect(decodeBytes('already text')).toBe('already text')
  })

  it('stringifies other types as a last resort', () => {
    expect(decodeBytes(1234)).toBe('1234')
  })
})
