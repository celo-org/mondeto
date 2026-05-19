import { describe, it, expect, beforeAll } from 'vitest'
import { pixelViewToMapSnapshot } from '@/lib/maps/adapter'
import type { PixelView } from '@/lib/mock'
import { WIDTH, HEIGHT, TOTAL_PIXELS, ZERO_ADDRESS } from '@/constants/map'

beforeAll(async () => {
  const { fetchLandMaskFromContract } = await import('@/lib/landMask')
  const wordCount = Math.ceil(TOTAL_PIXELS / 256)
  const allOnes: bigint[] = []
  for (let i = 0; i < wordCount; i++) {
    allOnes.push((1n << 256n) - 1n)
  }
  await fetchLandMaskFromContract(
    async () => allOnes,
    '0x0000000000000000000000000000000000000000',
    [],
  )
})

function emptyPixels(): PixelView[] {
  return Array.from({ length: WIDTH * HEIGHT }, () => ({
    owner: ZERO_ADDRESS,
    saleCount: 0,
    currentPrice: 0n,
    color: '',
    label: '',
    url: '',
  }))
}

describe('pixelViewToMapSnapshot', () => {
  it('preserves length, derives (x, y) from index, and copies meta', () => {
    const data = emptyPixels()
    const snap = pixelViewToMapSnapshot(data, 3, true)
    expect(snap.meta).toEqual({ id: 3, open: true })
    expect(snap.pixels).toHaveLength(WIDTH * HEIGHT)
    // First pixel
    expect(snap.pixels[0].x).toBe(0)
    expect(snap.pixels[0].y).toBe(0)
    expect(snap.pixels[0].id).toBe(0)
    // Pixel at end of row 0
    expect(snap.pixels[WIDTH - 1].x).toBe(WIDTH - 1)
    expect(snap.pixels[WIDTH - 1].y).toBe(0)
    // First pixel of row 1
    expect(snap.pixels[WIDTH].x).toBe(0)
    expect(snap.pixels[WIDTH].y).toBe(1)
    // Last pixel
    const last = WIDTH * HEIGHT - 1
    expect(snap.pixels[last].x).toBe(WIDTH - 1)
    expect(snap.pixels[last].y).toBe(HEIGHT - 1)
  })

  it('maps ZERO_ADDRESS owner to null', () => {
    const data = emptyPixels()
    const snap = pixelViewToMapSnapshot(data, 0, true)
    expect(snap.pixels[0].owner).toBeNull()
  })

  it('preserves non-zero owner addresses verbatim', () => {
    const data = emptyPixels()
    data[42] = {
      owner: '0xAbCdEf0000000000000000000000000000000001',
      saleCount: 1,
      currentPrice: 200000n,
      color: '',
      label: '',
      url: '',
    }
    const snap = pixelViewToMapSnapshot(data, 0, true)
    expect(snap.pixels[42].owner).toBe(
      '0xAbCdEf0000000000000000000000000000000001',
    )
    expect(snap.pixels[42].currentPrice).toBe(200000)
  })

  it('converts bigint micro-USDT to number for downstream ranking', () => {
    const data = emptyPixels()
    data[0] = {
      owner: '0xA',
      saleCount: 1,
      currentPrice: 1234567n,
      color: '',
      label: '',
      url: '',
    }
    const snap = pixelViewToMapSnapshot(data, 0, true)
    expect(snap.pixels[0].currentPrice).toBe(1234567)
  })

  it('round-trips through the leaderboards module', async () => {
    const data = emptyPixels()
    // Place a 2x2 block for 0xA, a single for 0xB.
    data[0] = { owner: '0xA', saleCount: 1, currentPrice: 100n, color: '', label: '', url: '' }
    data[1] = { owner: '0xA', saleCount: 1, currentPrice: 100n, color: '', label: '', url: '' }
    data[WIDTH] = { owner: '0xA', saleCount: 1, currentPrice: 100n, color: '', label: '', url: '' }
    data[WIDTH + 1] = { owner: '0xA', saleCount: 1, currentPrice: 999n, color: '', label: '', url: '' }
    data[50] = { owner: '0xB', saleCount: 1, currentPrice: 50n, color: '', label: '', url: '' }

    const snap = pixelViewToMapSnapshot(data, 0, true)
    const { allLeaderboards } = await import('@/lib/maps/leaderboards')
    const r = allLeaderboards(snap)

    expect(r.mostPixels[0]).toEqual({ address: '0xA', value: 4 })
    expect(r.mostPixels[1]).toEqual({ address: '0xB', value: 1 })
    expect(r.biggestConnectedArea[0]).toEqual({ address: '0xA', value: 4 })
    expect(r.mostExpensivePixel[0]).toEqual({ address: '0xA', value: 999 })
  })

  it('honors the open flag in meta', () => {
    const snap = pixelViewToMapSnapshot(emptyPixels(), 7, false)
    expect(snap.meta).toEqual({ id: 7, open: false })
  })
})
