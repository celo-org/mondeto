import { describe, expect, it } from 'vitest'
import { getMaskData } from '@/lib/maps/masks'
import {
  connectGap,
  corridorEntries,
  corridorStanding,
  type CorridorConfig,
  type PixelOwner,
} from '@/lib/corridorBoard'

/**
 * Parity with the payout (mondeto#282). The anchors are the ones the admin's
 * resolver freezes for the two real corridors, and every case below is a case
 * mondeto-admin pins in `tests/connect-strategy.test.ts` (#79, #115, #122), on
 * the real World mask. The admin's mask and this one were compared byte for
 * byte when this was written: 17,000 cells, 5,622 land, identical.
 */

const world = getMaskData('world')
const W = world.width
const LAGOS_LONDON: CorridorConfig = {
  width: W,
  height: world.height,
  land: world.mask,
  from: [7553, 7554, 7723, 7724, 7893, 7894],
  to: [2110, 2111, 2280, 2281, 2282],
}
const NY_MX: CorridorConfig = {
  ...LAGOS_LONDON,
  from: [3094, 3095, 3263, 3264, 3265, 3433],
  to: [5795, 5796, 5965, 5966, 5967, 6135, 6136, 6137],
}

/** One shortest 4-connected land chain (plain BFS), as the admin fixture builds it. */
function shortestChain(from: number[], to: number[], blocked = new Set<number>()): number[] {
  const prev = new Map<number, number>()
  const seen = new Set([...from, ...blocked])
  const q = [...from]
  const target = new Set(to)
  while (q.length) {
    const cur = q.shift()!
    if (target.has(cur)) {
      const path = [cur]
      while (prev.has(path[0])) path.unshift(prev.get(path[0])!)
      return path
    }
    const x = cur % W
    for (const n of [x + 1 < W ? cur + 1 : -1, x > 0 ? cur - 1 : -1, cur + W, cur - W]) {
      if (n < 0 || n >= world.mask.length || world.mask[n] !== 1 || seen.has(n)) continue
      seen.add(n)
      prev.set(n, cur)
      q.push(n)
    }
  }
  throw new Error('no chain')
}

const CHAIN = shortestChain([...LAGOS_LONDON.from], [...LAGOS_LONDON.to])
const CHAIN2 = shortestChain(
  LAGOS_LONDON.from.filter((p) => !CHAIN.includes(p)),
  LAGOS_LONDON.to.filter((p) => !CHAIN.includes(p)),
  new Set(CHAIN),
)
const addr = (c: string) => '0x' + c.repeat(40)
const A = addr('a')
const B = addr('b')
const C = addr('c')
const D = addr('d')
const px = (owner: string, ids: number[]): PixelOwner[] => ids.map((pixelId) => ({ pixelId, owner }))
const empty = connectGap(new Set(), LAGOS_LONDON)!

describe('connectGap: the same numbers the admin pins', () => {
  it('the shortest chain on an empty board is 36 px for Lagos→London and 32 for New York→Mexico City', () => {
    expect(connectGap(new Set(), LAGOS_LONDON)).toBe(36)
    expect(connectGap(new Set(), NY_MX)).toBe(32)
  })

  it('a wallet holding a whole chain has gap 0, and one pixel short has gap 1', () => {
    expect(connectGap(new Set(CHAIN), LAGOS_LONDON)).toBe(0)
    expect(connectGap(new Set(CHAIN.filter((p) => p !== CHAIN[5])), LAGOS_LONDON)).toBe(1)
  })

  it('anchors on separate landmasses have no gap at all', () => {
    // Sydney is not connected to London over land on this mask.
    const sydney = { ...LAGOS_LONDON, from: [LAGOS_LONDON.land.findIndex((v, i) => v === 1 && i % W > 150 && Math.floor(i / W) > 70)] }
    expect(connectGap(new Set(), sydney)).toBeNull()
  })
})

describe('ranking: progress inside the window (mondeto-admin#123)', () => {
  it('#122: an incumbent who drops one pixel before the window and re-buys it scores 1, below a builder from empty', () => {
    const kept = CHAIN.filter((p) => p !== CHAIN[5])
    const entries = corridorEntries(px(A, kept), [...px(A, CHAIN), ...px(D, CHAIN2)], LAGOS_LONDON)
    expect(entries.map((e) => [e.address, e.value])).toEqual([
      [D, empty],
      [A, 1],
    ])
  })

  it('a wallet that already held the chain when the window opened is not ranked', () => {
    expect(corridorEntries(px(A, CHAIN), px(A, CHAIN), LAGOS_LONDON)).toEqual([])
    // Control: the same end state built inside the window ranks.
    expect(corridorEntries([], px(A, CHAIN), LAGOS_LONDON).map((e) => e.address)).toEqual([A])
  })

  it('a wallet that improved ranks; one that held still does not; from empty the most progress leads', () => {
    const third = CHAIN.slice(0, Math.floor(CHAIN.length / 3))
    const half = CHAIN.slice(0, Math.floor(CHAIN.length / 2))
    const held = corridorEntries([...px(B, third), ...px(C, third)], [...px(B, half), ...px(C, third)], LAGOS_LONDON)
    expect(held.map((e) => e.address)).toEqual([B])
    const fromEmpty = corridorEntries([], [...px(A, CHAIN), ...px(B, half), ...px(C, third)], LAGOS_LONDON)
    expect(fromEmpty.map((e) => e.address)).toEqual([A, B, C])
    expect(fromEmpty[0].value).toBe(empty)
  })

  it('pixels nowhere near the corridor rank nothing', () => {
    const far = LAGOS_LONDON.land.findIndex((v, i) => v === 1 && i % W > 150 && Math.floor(i / W) > 70)
    expect(corridorEntries([], px(C, [far]), LAGOS_LONDON)).toEqual([])
  })
})

describe('ties are shown as ties, never ordered (the payout breaks them)', () => {
  /** A prefix of the second chain that closed exactly `progress` from empty. */
  const matchingPrefix = (progress: number): number[] => {
    const k = CHAIN2.findIndex((_, i) => empty - connectGap(new Set(CHAIN2.slice(0, i)), LAGOS_LONDON)! === progress)
    if (k <= 0) throw new Error(`fixture: no prefix of the second chain closes ${progress}`)
    return CHAIN2.slice(0, k)
  }

  it('the cross-class tie: a completer and a wallet still short with equal progress share rank 1, flagged', () => {
    // The admin's case: the payout orders these by who reached their final gap
    // first. This board must not claim either order.
    const bPixels = CHAIN.slice(0, Math.floor(CHAIN.length / 2))
    const progress = empty - connectGap(new Set(bPixels), LAGOS_LONDON)!
    const aStart = matchingPrefix(empty - progress) // A starts that far along and completes
    const entries = corridorEntries(px(A, aStart), [...px(A, CHAIN2), ...px(B, bPixels)], LAGOS_LONDON)
    expect(connectGap(new Set(CHAIN2), LAGOS_LONDON), 'A completes').toBe(0)
    expect(entries.map((e) => [e.value, e.rank, e.tied])).toEqual([
      [progress, 1, true],
      [progress, 1, true],
    ])
  })

  it('competition ranking: 1, 2, 2, 4, with only the equal pair flagged', () => {
    const bPixels = CHAIN.slice(0, 12)
    const tie = empty - connectGap(new Set(bPixels), LAGOS_LONDON)!
    const cPixels = matchingPrefix(tie)
    const dPixels = CHAIN.slice(CHAIN.length - 3)
    const entries = corridorEntries([], [...px(A, CHAIN.slice(12, 30)), ...px(B, bPixels), ...px(C, cPixels), ...px(D, dPixels)], LAGOS_LONDON)
    // Sanity on the fixture itself, so the expectation below cannot be vacuous.
    const values = entries.map((e) => e.value)
    expect(values[1]).toBe(values[2])
    expect(values[0]).toBeGreaterThan(values[1])
    expect(values[3]).toBeLessThan(values[2])
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 2, 4])
    expect(entries.map((e) => e.tied)).toEqual([false, true, true, false])
  })

  it('the order is the same whatever order the pixels arrive in', () => {
    const half = CHAIN.slice(0, 20)
    const a = corridorEntries([], [...px(B, half), ...px(C, CHAIN.slice(0, 10))], LAGOS_LONDON)
    const b = corridorEntries([], [...px(C, CHAIN.slice(0, 10)), ...px(B, half)], LAGOS_LONDON)
    expect(b).toEqual(a)
  })
})

describe('own standing', () => {
  it('matches the board for a ranked wallet and reads 0 for an unranked one', () => {
    const kept = CHAIN.filter((p) => p !== CHAIN[5])
    expect(corridorStanding(A, px(A, kept), px(A, CHAIN), LAGOS_LONDON)).toEqual({ progress: 1, ranks: true })
    expect(corridorStanding(B, px(A, kept), px(A, CHAIN), LAGOS_LONDON)).toEqual({ progress: 0, ranks: false })
  })
})

describe('own standing agrees with the board for every wallet on it', () => {
  it('a randomised board: standing.progress equals the entry value, and unranked wallets read 0 or less', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    const wallets = [A, B, C, D]
    for (let round = 0; round < 40; round++) {
      const deal = (density: number) =>
        [...CHAIN, ...CHAIN2].filter(() => rnd() < density).map((pixelId) => ({ pixelId, owner: wallets[Math.floor(rnd() * 4)] }))
      const start = deal(0.3)
      const end = deal(0.6)
      const entries = corridorEntries(start, end, LAGOS_LONDON)
      for (const w of wallets) {
        const s = corridorStanding(w, start, end, LAGOS_LONDON)
        const e = entries.find((x) => x.address === w)
        if (e) expect(s).toEqual({ progress: e.value, ranks: true })
        else expect(s.ranks).toBe(false)
      }
    }
  })
})
