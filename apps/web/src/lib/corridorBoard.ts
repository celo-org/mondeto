import type { Address, LeaderEntry } from '@/lib/maps/types'

/**
 * The CAMPAIGN board during a CONNECT ("connect two cities") campaign
 * (celo-org/mondeto#282).
 *
 * **This must rank identically to the payout** (celo-org/mondeto-admin, the
 * CONNECT strategy in `src/lib/contest/campaignStrategies.ts`, rule from
 * mondeto-admin#123). #48 is what happens when the two drift: a player is shown
 * one order and paid another. So this file is a port, not a re-design, and the
 * parity fixtures in `__tests__/lib/corridorBoard.test.ts` are the same cases
 * the admin pins.
 *
 *   gap(W)    = fewest extra pixels W must buy to hold a 4-connected chain of
 *               its own land pixels from one anchor to the other.
 *   progress  = gap(start) − gap(end): the pixels of distance W closed during
 *               the campaign. A wallet with no progress at the start counts
 *               from an empty board. Only progress > 0 ranks.
 *
 * **Ties are shown as ties, never ordered.** The payout breaks equal progress
 * by the first block at which each wallet reached its final gap, replayed from
 * its purchase history, and falls back to address when any replay disagrees
 * with the pinned read. Reproducing that here would cost one or two subgraph
 * queries per ranked wallet on every board refresh, and a single untrusted
 * replay flips every tie on the board. The option the issue allows instead:
 * equal progress shares a rank, so the board can never claim an order the
 * payout does not use.
 */

/** Pixel ids are flat row-major indices: `id = y * width + x`. */
export interface CorridorConfig {
  width: number
  height: number
  /** 1 = land, 0 = water. Indexed by pixel id. */
  land: Uint8Array
  /** Anchor A: any one of these pixels is a valid start. */
  from: readonly number[]
  /** Anchor B: reaching any one of these ends the walk. */
  to: readonly number[]
}

/**
 * Minimum extra pixels `owned` must buy to connect the two anchors, or null
 * when no chain is possible at all (anchors on separate landmasses).
 *
 * A 0-1 BFS: stepping onto a pixel the wallet owns is free, onto unowned land
 * costs one purchase, water is impassable. 4-way adjacency, as on EMPIRE.
 * Ported line for line from mondeto-admin `src/lib/contest/connect.ts`.
 */
export function connectGap(owned: ReadonlySet<number>, cfg: CorridorConfig): number | null {
  const { width, height, land, from, to } = cfg
  const size = width * height

  const isTarget = new Uint8Array(size)
  let hasTarget = false
  for (const id of to) {
    if (id >= 0 && id < size && land[id] === 1) {
      isTarget[id] = 1
      hasTarget = true
    }
  }
  if (!hasTarget) return null

  const cost = (id: number): number => (owned.has(id) ? 0 : 1)
  const dist = new Int32Array(size).fill(-1)
  const buckets: number[][] = []
  const push = (d: number, id: number): void => {
    ;(buckets[d] ??= []).push(id)
  }

  for (const id of from) {
    if (id < 0 || id >= size || land[id] !== 1) continue
    const d = cost(id)
    if (dist[id] < 0 || d < dist[id]) {
      dist[id] = d
      push(d, id)
    }
  }

  for (let d = 0; d < buckets.length; d++) {
    const bucket = buckets[d]
    if (!bucket) continue
    for (let k = 0; k < bucket.length; k++) {
      const current = bucket[k]
      if (dist[current] !== d) continue
      if (isTarget[current] === 1) return d
      const x = current % width
      const neighbours = [
        x + 1 < width ? current + 1 : -1,
        x - 1 >= 0 ? current - 1 : -1,
        current + width < size ? current + width : -1,
        current - width >= 0 ? current - width : -1,
      ]
      for (const next of neighbours) {
        if (next < 0 || land[next] !== 1) continue
        const nd = d + cost(next)
        if (dist[next] < 0 || nd < dist[next]) {
          dist[next] = nd
          push(nd, next)
        }
      }
    }
  }
  return null
}

/** One owned pixel at a pinned block. `owner` lowercase. */
export interface PixelOwner {
  pixelId: number
  owner: string
}

/**
 * Every wallet's gap on the corridor from one pinned read. Wallets with no
 * progress at all (gap equal to an empty board's) are omitted, as on the admin.
 * Throws when the anchors can never be connected: that campaign is unwinnable
 * and must not be ranked.
 */
export function corridorGaps(
  pixels: readonly PixelOwner[],
  cfg: CorridorConfig,
): { empty: number; gaps: Map<string, number> } {
  const empty = connectGap(new Set(), cfg)
  if (empty === null) throw new Error('corridor anchors are on separate landmasses')
  const byOwner = new Map<string, Set<number>>()
  for (const p of pixels) {
    const owner = p.owner.toLowerCase()
    let set = byOwner.get(owner)
    if (!set) byOwner.set(owner, (set = new Set()))
    set.add(p.pixelId)
  }
  const gaps = new Map<string, number>()
  for (const [owner, owned] of byOwner) {
    const gap = connectGap(owned, cfg)
    if (gap === null || gap >= empty) continue
    gaps.set(owner, gap)
  }
  return { empty, gaps }
}

/** A ranked corridor row. `rank` is shared by every wallet with equal progress. */
export interface CorridorEntry extends LeaderEntry {
  rank: number
  /** True when another wallet has the same progress: the payout decides the order. */
  tied: boolean
}

/**
 * Rank the corridor: progress descending, only progress > 0. Equal progress
 * shares a rank (1, 2, 2, 4) and is listed by address only so the list is
 * stable between refreshes; `tied` says the order inside the group is not a
 * claim.
 */
export function corridorEntries(
  startPixels: readonly PixelOwner[],
  endPixels: readonly PixelOwner[],
  cfg: CorridorConfig,
): CorridorEntry[] {
  const { empty, gaps } = corridorGaps(endPixels, cfg)
  const startGaps = corridorGaps(startPixels, cfg).gaps
  const rows: { address: Address; value: number }[] = []
  for (const [owner, gap] of gaps) {
    const progress = (startGaps.get(owner) ?? empty) - gap
    if (progress <= 0) continue
    rows.push({ address: owner as Address, value: progress })
  }
  rows.sort((a, b) => (b.value !== a.value ? b.value - a.value : a.address < b.address ? -1 : 1))
  const count = new Map<number, number>()
  for (const r of rows) count.set(r.value, (count.get(r.value) ?? 0) + 1)
  const out: CorridorEntry[] = []
  for (let i = 0; i < rows.length; i++) {
    const rank = i > 0 && rows[i].value === rows[i - 1].value ? out[i - 1].rank : i + 1
    out.push({ ...rows[i], rank, tied: (count.get(rows[i].value) ?? 0) > 1 })
  }
  return out
}

/** One wallet's corridor progress, ranked or not, from the same two reads. */
export function corridorStanding(
  address: string,
  startPixels: readonly PixelOwner[],
  endPixels: readonly PixelOwner[],
  cfg: CorridorConfig,
): { progress: number; ranks: boolean } {
  const target = address.toLowerCase()
  const { empty, gaps } = corridorGaps(endPixels, cfg)
  const startGaps = corridorGaps(startPixels, cfg).gaps
  const end = gaps.get(target)
  const progress = end === undefined ? 0 : (startGaps.get(target) ?? empty) - end
  return { progress, ranks: progress > 0 }
}
