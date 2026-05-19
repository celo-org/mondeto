import { describe, it, expect, beforeAll } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLeaderboard, type OwnerProfileData } from '@/hooks/useLeaderboard'
import type { PixelView } from '@/lib/mock'
import { WIDTH, HEIGHT, ZERO_ADDRESS, TOTAL_PIXELS } from '@/constants/map'

// The maps module filters water pixels, so the hook only ranks land. For the
// tests we make every pixel land by stubbing the live land mask before the
// hook runs.
beforeAll(async () => {
  const { fetchLandMaskFromContract } = await import('@/lib/landMask')
  const wordCount = Math.ceil(TOTAL_PIXELS / 256)
  const allOnes: bigint[] = []
  for (let i = 0; i < wordCount; i++) {
    // All 256 bits set => every pixel marked as land.
    allOnes.push((1n << 256n) - 1n)
  }
  await fetchLandMaskFromContract(
    async () => allOnes,
    '0x0000000000000000000000000000000000000000',
    [],
  )
})

function emptyMap(): PixelView[] {
  return Array.from({ length: WIDTH * HEIGHT }, () => ({
    owner: ZERO_ADDRESS,
    saleCount: 0,
    currentPrice: 100000n,
    color: '',
    label: '',
    url: '',
  }))
}

function place(data: PixelView[], x: number, y: number, owner: string, price = 100000n) {
  data[y * WIDTH + x] = {
    owner,
    saleCount: 1,
    currentPrice: price,
    color: '',
    label: '',
    url: '',
  }
}

describe('useLeaderboard', () => {
  it('AREA: ranks by total pixel count (LOCAL scope)', () => {
    const data = emptyMap()
    place(data, 0, 0, '0xAlice')
    place(data, 1, 0, '0xAlice')
    place(data, 2, 0, '0xAlice')
    place(data, 3, 0, '0xBob')

    const { result } = renderHook(() => useLeaderboard(data))
    const { area } = result.current

    expect(area).toHaveLength(2)
    expect(area[0].owner).toBe('0xAlice')
    expect(area[0].value).toBe('3')
    expect(area[0].unit).toBe('px')
    expect(area[0].rank).toBe(1)
    expect(area[1].owner).toBe('0xBob')
    expect(area[1].rank).toBe(2)
  })

  it('EMPIRE: ranks by largest contiguous region', () => {
    const data = emptyMap()
    // Alice has 3 contiguous in row 0
    place(data, 0, 0, '0xAlice')
    place(data, 1, 0, '0xAlice')
    place(data, 2, 0, '0xAlice')
    // Bob has 2 contiguous in row 1 (far from Alice so they don't connect)
    place(data, 50, 1, '0xBob')
    place(data, 51, 1, '0xBob')

    const { result } = renderHook(() => useLeaderboard(data))
    const { empire } = result.current

    expect(empire).toHaveLength(2)
    expect(empire[0].owner).toBe('0xAlice')
    expect(empire[0].value).toBe('3')
    expect(empire[1].owner).toBe('0xBob')
    expect(empire[1].value).toBe('2')
  })

  it('TYCOONS: ranks by highest pixel price per owner, formatted as USDT', () => {
    const data = emptyMap()
    // 50000 micro-USDT = 0.05, 100000 = 0.10, 80000 = 0.08
    place(data, 0, 0, '0xAlice', 50000n)
    place(data, 1, 0, '0xAlice', 100000n)
    place(data, 2, 0, '0xBob', 80000n)

    const { result } = renderHook(() => useLeaderboard(data))
    const { tycoons } = result.current

    expect(tycoons).toHaveLength(2)
    expect(tycoons[0].owner).toBe('0xAlice')
    expect(tycoons[0].unit).toBe('USDT')
    expect(tycoons[1].owner).toBe('0xBob')
  })

  it('excludes ZERO_ADDRESS pixels', () => {
    const data = emptyMap()
    place(data, 0, 0, '0xAlice')

    const { result } = renderHook(() => useLeaderboard(data))
    expect(result.current.area).toHaveLength(1)
  })

  it('GLOBAL scope matches LOCAL when only one map is revealed', () => {
    const data = emptyMap()
    place(data, 0, 0, '0xAlice')
    place(data, 1, 0, '0xAlice')
    place(data, 2, 0, '0xBob')

    const { result } = renderHook(() => useLeaderboard(data))
    const { local, global } = result.current

    expect(global.area.map((e) => [e.owner, e.value])).toEqual(
      local.area.map((e) => [e.owner, e.value]),
    )
    expect(global.empire.map((e) => [e.owner, e.value])).toEqual(
      local.empire.map((e) => [e.owner, e.value]),
    )
    expect(global.tycoons.map((e) => [e.owner, e.value])).toEqual(
      local.tycoons.map((e) => [e.owner, e.value]),
    )
  })

  it('applies on-chain profile labels via profilesMap', () => {
    const data = emptyMap()
    place(data, 0, 0, '0xAlice')

    const profiles = new Map<string, OwnerProfileData>([
      ['0xalice', { label: 'AliceCorp', url: 'https://a.test', color: '#ff0000' }],
    ])

    const { result } = renderHook(() => useLeaderboard(data, 0, profiles))
    expect(result.current.area[0].label).toBe('AliceCorp')
    expect(result.current.area[0].color).toBe('#ff0000')
  })
})
