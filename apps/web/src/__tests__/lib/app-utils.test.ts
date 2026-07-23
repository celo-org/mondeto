import { describe, it, expect, vi } from 'vitest'
import { formatCurrency, truncateAddress, isValidAddress, sleep } from '@/lib/app-utils'

describe('formatCurrency', () => {
  it('formats USD by default', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50')
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('honours an explicit currency', () => {
    // Non-breaking space between symbol and amount for EUR in en-US.
    expect(formatCurrency(10, 'EUR')).toMatch(/€10\.00/)
  })
})

describe('truncateAddress', () => {
  const addr = '0x1234567890abcdef1234567890abcdef12345678'

  it('keeps the head and tail with an ellipsis', () => {
    expect(truncateAddress(addr)).toBe('0x1234...5678')
  })

  it('respects custom lengths', () => {
    expect(truncateAddress(addr, 4, 2)).toBe('0x12...78')
  })

  it('returns short strings unchanged', () => {
    expect(truncateAddress('0x1234')).toBe('0x1234')
  })
})

describe('isValidAddress', () => {
  it('accepts a well-formed 20-byte hex address, any case', () => {
    expect(isValidAddress('0x1234567890abcdefABCDEF1234567890abcdef12')).toBe(true)
  })

  it('rejects wrong length, missing prefix and non-hex chars', () => {
    expect(isValidAddress('0x1234')).toBe(false)
    expect(isValidAddress('1234567890abcdef1234567890abcdef12345678')).toBe(false)
    expect(isValidAddress('0xZZZ4567890abcdef1234567890abcdef12345678')).toBe(false)
    expect(isValidAddress('')).toBe(false)
  })
})

describe('sleep', () => {
  it('resolves after the given delay', async () => {
    vi.useFakeTimers()
    let done = false
    const p = sleep(1000).then(() => {
      done = true
    })
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    await p
    expect(done).toBe(true)
    vi.useRealTimers()
  })
})
