/**
 * Mondeto — on-chain MapSnapshot adapter
 *
 * Builds a `MapSnapshot` (the pure-domain shape consumed by assignment /
 * leaderboard / open-next-map logic) from a deployed map contract.
 *
 * TODO: Agent C owns the canonical adapter at this path. If their version
 * lands first, the implementation below should be replaced with the
 * canonical one and any call-sites left untouched (the exported signature
 * is the contract). For now this is a thin local fallback so /analytics
 * can render the advisory + per-map breakdown without blocking on them.
 */

import type { Address as ViemAddress, PublicClient } from 'viem'
import { MONDETO_ABI } from '@/lib/contract'
import { WIDTH, HEIGHT, ZERO_ADDRESS } from '@/constants/map'
import { decodePixelBatch } from '@/lib/contractReads'
import { pixelPrice } from '@/lib/priceCalc'
import { isLand } from '@/lib/landMask'
import type { MapSnapshot, PixelState } from '@/lib/maps/types'

/**
 * USDT has 6 decimals on Celo. We convert raw bigint prices into plain JS
 * numbers because the domain layer (`averagePrice`, `shouldOpenNextMap`)
 * works in USDT-as-number for math. Precision loss at $0.01-scale is fine
 * for an advisory signal — the threshold ($2) is two orders of magnitude
 * above the smallest meaningful figure here.
 */
const USDT_DECIMALS = 6
const USDT_SCALE = 10 ** USDT_DECIMALS

function rawToUSDT(raw: bigint): number {
  return Number(raw) / USDT_SCALE
}

/**
 * Read a single map contract and return a `MapSnapshot`. Pure I/O + a
 * row-major decode; no rendering, no React.
 *
 * `readContract` is the same shape used by `fetchAllPixelsFromContract` so
 * tests can pass an in-memory stub without standing up a real client.
 */
export async function fetchMapSnapshot(
  readContract: (args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args: readonly unknown[]
  }) => Promise<unknown>,
  opts: {
    id: number
    address: `0x${string}`
    open: boolean
  }
): Promise<MapSnapshot> {
  const { id, address, open } = opts

  const batchData = (await readContract({
    address,
    abi: MONDETO_ABI,
    functionName: 'getPixelBatch',
    args: [0, 0, WIDTH, HEIGHT],
  })) as `0x${string}`

  const decoded = decodePixelBatch(batchData, 0, 0, WIDTH, HEIGHT)

  let priceCfg: {
    initialPrice: bigint
    minPrice: bigint
    deployTimestamp: bigint
    halvingTime: bigint
  } | null = null
  try {
    const cfg = (await readContract({
      address,
      abi: MONDETO_ABI,
      functionName: 'config',
      args: [],
    })) as readonly [number, number, bigint, bigint, bigint, bigint, bigint]
    const [, , halvingTime, initialPrice, minPrice, deployTimestamp] = cfg
    if (deployTimestamp > 0n) {
      priceCfg = { initialPrice, minPrice, deployTimestamp, halvingTime }
    }
  } catch {
    // No config => leave priceCfg null; price defaults to 0 (advisory will
    // read "0.00" which is fine for an empty / not-yet-deployed map).
  }

  const now = BigInt(Math.floor(Date.now() / 1000))
  const pixels: PixelState[] = []
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const pid = y * WIDTH + x
      const land = isLand(pid)
      const view = decoded[pid]
      const ownerRaw = view ? view.owner : ZERO_ADDRESS
      const owner =
        ownerRaw && ownerRaw.toLowerCase() !== ZERO_ADDRESS
          ? ownerRaw.toLowerCase()
          : null
      const priceRaw =
        priceCfg && view
          ? pixelPrice(view.saleCount, now, priceCfg)
          : 0n
      pixels.push({
        id: pid,
        x,
        y,
        owner,
        currentPrice: rawToUSDT(priceRaw),
        isLand: land,
      })
    }
  }

  return { meta: { id, open }, pixels }
}

/**
 * Count of land pixels claimed (owner != null) over count of land pixels.
 * Returns a value in [0, 1]. 0 if the map has no land (defensive — should
 * never happen for a real deployed map).
 */
export function percentClaimed(map: MapSnapshot): number {
  let land = 0
  let owned = 0
  for (const p of map.pixels) {
    if (!p.isLand) continue
    land += 1
    if (p.owner !== null) owned += 1
  }
  return land === 0 ? 0 : owned / land
}

// Re-export for callers that want both the shape and a viem-typed address.
export type { ViemAddress, PublicClient }
