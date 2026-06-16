import { describe, it, expect, beforeAll } from 'vitest'
import {
  getAllPixels,
  selectionPrice,
  buyPixels,
  getProfile,
  updateProfile,
  getUSDTBalance,
} from '@/lib/mock'
import type { PixelView } from '@/lib/mock'
import { isLand } from '@/lib/landMask'
import { ZERO_ADDRESS } from '@/constants/map'
import { getMaskData } from '@/lib/maps/masks'

const WORLD = getMaskData('world')
const TOTAL_PIXELS = WORLD.width * WORLD.height

let pixels: PixelView[]

beforeAll(async () => {
  pixels = await getAllPixels()
})

describe('getAllPixels', () => {
  it('returns world-sized pixel array', () => {
    expect(pixels).toHaveLength(TOTAL_PIXELS)
  })

  it('every pixel has required fields', () => {
    const first = pixels[0]
    expect(first).toHaveProperty('owner')
    expect(first).toHaveProperty('saleCount')
    expect(first).toHaveProperty('currentPrice')
    expect(first).toHaveProperty('color')
    expect(first).toHaveProperty('label')
    expect(first).toHaveProperty('url')
  })
})

describe('selectionPrice', () => {
  it('returns 0 for empty selection', async () => {
    const price = await selectionPrice([])
    expect(price).toBe(0n)
  })

  it('computes sum of pixel prices', async () => {
    const price = await selectionPrice([0, 1])
    expect(price).toBe(pixels[0].currentPrice + pixels[1].currentPrice)
  })
})

describe('buyPixels', () => {
  it('changes ownership and increments saleCount', async () => {
    const idx = pixels.findIndex(p => p.owner === ZERO_ADDRESS)
    const prevSaleCount = pixels[idx].saleCount
    const prevPrice = pixels[idx].currentPrice
    const buyer = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

    const txHash = await buyPixels([idx], '#ff0000', 'Tester', 'https://test.com', buyer)
    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/)

    const updated = await getAllPixels()
    expect(updated[idx].owner).toBe(buyer)
    expect(updated[idx].saleCount).toBe(prevSaleCount + 1)
    expect(updated[idx].currentPrice).toBe(prevPrice * 2n)
  })
})

describe('getProfile / updateProfile', () => {
  it('getProfile returns null for unknown address', async () => {
    const profile = await getProfile('0xDEAD000000000000000000000000000000000000')
    expect(profile).toBeNull()
  })

  it('getProfile returns data for demo owner', async () => {
    const profile = await getProfile('0x1111111111111111111111111111111111111111')
    expect(profile).not.toBeNull()
    expect(profile!.label).toBe('CeloFan')
  })

  it('updateProfile sets and retrieves profile', async () => {
    const addr = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'
    await updateProfile(addr, 0xff0000, 'TestUser', 'https://example.com')
    const profile = await getProfile(addr)
    expect(profile).not.toBeNull()
    expect(profile!.label).toBe('TestUser')
    expect(profile!.color).toBe(0xff0000)
    expect(profile!.url).toBe('https://example.com')
  })
})

describe('demo data seeds on land only', () => {
  it('all owned pixels are on land', () => {
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i].owner !== ZERO_ADDRESS) {
        expect(isLand(i, WORLD.mask)).toBe(true)
      }
    }
  })
})

describe('getUSDTBalance', () => {
  it('returns a bigint value', async () => {
    const balance = await getUSDTBalance()
    expect(typeof balance).toBe('bigint')
  })
})
