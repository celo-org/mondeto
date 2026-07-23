import { describe, it, expect } from 'vitest'
import { decodePixelBatch } from '@/lib/contractReads'
import { ZERO_ADDRESS } from '@/constants/map'

// A 2x2 grid where only pixels 0 and 3 are land (row-major mask).
const MASK = new Uint8Array([1, 0, 0, 1])

// Each land record is 24 bytes = 48 hex chars: owner(40) saleCount(2) color(6).
const OWNER_A = '11'.repeat(20)
const OWNER_B = '22'.repeat(20)
const RECORD_0 = OWNER_A + '05' + 'a7ff05' // saleCount 5, color #a7ff05
const RECORD_1 = OWNER_B + '00' + '000000' // saleCount 0, color unset

describe('decodePixelBatch', () => {
  it('decodes packed land records into a row-major, full-length array', () => {
    const out = decodePixelBatch('0x' + RECORD_0 + RECORD_1, 0, 0, 2, 2, 2, 2, MASK)

    expect(out).toHaveLength(4)
    expect(out[0]).toEqual({
      owner: '0x' + OWNER_A,
      saleCount: 5,
      currentPrice: 0n,
      color: '#a7ff05',
      label: '',
      url: '',
    })
    expect(out[3]).toMatchObject({ owner: '0x' + OWNER_B, saleCount: 0, color: '' })
  })

  it('leaves water pixels as the zero-address default', () => {
    const out = decodePixelBatch('0x' + RECORD_0 + RECORD_1, 0, 0, 2, 2, 2, 2, MASK)
    for (const waterId of [1, 2]) {
      expect(out[waterId]).toEqual({
        owner: ZERO_ADDRESS,
        saleCount: 0,
        currentPrice: 0n,
        color: '',
        label: '',
        url: '',
      })
    }
  })

  it('tolerates a hex payload with no 0x prefix', () => {
    const out = decodePixelBatch(RECORD_0 + RECORD_1, 0, 0, 2, 2, 2, 2, MASK)
    expect(out[0].owner).toBe('0x' + OWNER_A)
  })

  it('stops cleanly when the payload is truncated mid-batch', () => {
    // Only the first record is present; pixel 3 keeps its default.
    const out = decodePixelBatch('0x' + RECORD_0, 0, 0, 2, 2, 2, 2, MASK)
    expect(out[0].owner).toBe('0x' + OWNER_A)
    expect(out[3].owner).toBe(ZERO_ADDRESS)
  })
})
