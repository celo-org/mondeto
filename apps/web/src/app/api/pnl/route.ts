import { NextResponse } from 'next/server'
import { parseAbiItem } from 'viem'
import { fallbackReadClient } from '@/lib/chain'
import { MONDETO_ABI } from '@/lib/contract'
import { getMapContractById } from '@/lib/maps/contracts'
import { logger } from '@/lib/logger'
import type { MapId } from '@/lib/maps/types'

/**
 * Server-side profit-and-loss for one wallet on one map.
 *
 * P&L is reconstructed from the full `PixelsPurchased` event history: SPENT is
 * the sum of the wallet's own buys; EARNED is what later buyers paid for pixels
 * the wallet used to own. That needs a wide `getLogs` scan across the whole
 * contract history — dozens of 50k-block chunks on Celo.
 *
 * Doing that on the phone meant the scan routinely failed on MiniPay's
 * constrained network and the profile showed $0 earned / $0 spent. Here the
 * reads run on Vercel's network — fast, reliable — and the phone fetches a
 * small `{ spent, earned }` JSON (values in 6-decimal "microcents", the unit
 * `formatUSDT` renders). Cached briefly in the warm instance so navigating
 * back to the profile doesn't re-scan.
 *
 * This mirrors /api/global-board: a lightweight live-read stand-in for a full
 * indexer, no persistence or historical queries.
 */

export const dynamic = 'force-dynamic'
// The full-history log scan is ~hundreds of small getLogs calls; give the
// function room beyond the 10s default so a cold computation finishes.
export const maxDuration = 60

const CACHE_TTL_MS = 60_000
// Public Celo RPCs (Forno, dRPC) reject eth_getLogs windows larger than
// ~5k blocks — a 50k window fails outright, which silently zeroed every P&L.
// Stay at 5k and lean on parallelism to keep the ~300-chunk scan fast.
const CHUNK_BLOCKS = 5_000n
const MAX_PARALLEL = 20
const SAFETY_BUFFER_BLOCKS = 100_000n

// Multi-token PixelsPurchased — `token` is the second indexed parameter as of
// contract v2.
const PURCHASE_EVENT = parseAbiItem(
  'event PixelsPurchased(address indexed buyer, address indexed token, uint256[] ids, uint256 totalCost)',
)

interface Pnl {
  spent: string
  earned: string
}

const ZERO: Pnl = { spent: '0', earned: '0' }

// Per (mapId, address) warm-instance cache.
const cache = new Map<string, { ts: number; value: Pnl }>()

// Normalize a token amount to 6 decimals (the unit `formatUSDT` displays), so
// mixed-token totals (e18 USDm vs e6 USDC) sum in one magnitude.
function toMicrocents(cost: bigint, decimals: number): bigint {
  if (decimals === 6) return cost
  if (decimals > 6) return cost / 10n ** BigInt(decimals - 6)
  return cost * 10n ** BigInt(6 - decimals)
}

async function computePnl(mapId: MapId, addr: string): Promise<Pnl> {
  const contract = getMapContractById(mapId)
  const mondetoAddress = contract.address
  const client = fallbackReadClient

  const currentBlock = await client.getBlockNumber()

  // Estimate the first-sale block from the contract's own clock so we don't
  // scan from genesis. 1s/block on Celo L2 — overestimating is safe.
  let fromBlock = 0n
  const [halvingStartTs, head] = await Promise.all([
    client.readContract({
      address: mondetoAddress,
      abi: MONDETO_ABI,
      functionName: 'halvingStartTimestamp',
    }) as Promise<bigint>,
    client.getBlock({ blockNumber: currentBlock }),
  ])
  // 0 means no purchases yet — nothing to scan.
  if (halvingStartTs === 0n) return ZERO
  const secondsSinceStart = head.timestamp - halvingStartTs
  const estimatedBlocks = secondsSinceStart + SAFETY_BUFFER_BLOCKS
  fromBlock = currentBlock > estimatedBlocks ? currentBlock - estimatedBlocks : 0n

  const ranges: Array<{ from: bigint; to: bigint }> = []
  for (let start = fromBlock; start <= currentBlock; start += CHUNK_BLOCKS) {
    const end =
      start + CHUNK_BLOCKS - 1n > currentBlock ? currentBlock : start + CHUNK_BLOCKS - 1n
    ranges.push({ from: start, to: end })
  }

  type Log = Awaited<ReturnType<typeof client.getLogs<typeof PURCHASE_EVENT>>>[number]
  const logs: Log[] = []
  let failedChunks = 0
  for (let i = 0; i < ranges.length; i += MAX_PARALLEL) {
    const batch = ranges.slice(i, i + MAX_PARALLEL)
    const results = await Promise.allSettled(
      batch.map((r) =>
        client.getLogs({
          address: mondetoAddress,
          event: PURCHASE_EVENT,
          fromBlock: r.from,
          toBlock: r.to,
        }),
      ),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') logs.push(...r.value)
      else failedChunks++
    }
  }
  // A handful of dropped chunks skews P&L slightly; a wholesale failure means
  // the numbers are untrustworthy — surface it so a stale/zero result is
  // explainable rather than silently wrong.
  if (failedChunks > 0) {
    logger.warn('P&L scan had failed chunks', {
      failedChunks,
      totalChunks: ranges.length,
      mapId,
      address: addr,
    })
  }

  // Chronological order so the running owner-of map reflects real purchase order.
  logs.sort((a, b) => {
    const ab = a.blockNumber ?? 0n
    const bb = b.blockNumber ?? 0n
    if (ab !== bb) return ab < bb ? -1 : 1
    return (a.logIndex ?? 0) - (b.logIndex ?? 0)
  })

  // Look up each payment token's decimals for normalization.
  const tokenDecimals = new Map<string, number>()
  const uniqueTokens = new Set<string>()
  for (const log of logs) uniqueTokens.add((log.args.token as string).toLowerCase())
  await Promise.all(
    [...uniqueTokens].map(async (token) => {
      try {
        const [, dec] = (await client.readContract({
          address: mondetoAddress,
          abi: MONDETO_ABI,
          functionName: 'tokenConfig',
          args: [token as `0x${string}`],
        })) as readonly [boolean, number]
        tokenDecimals.set(token, Number(dec))
      } catch {
        tokenDecimals.set(token, 6)
      }
    }),
  )

  let totalSpent = 0n
  let totalEarned = 0n
  const ownerOf = new Map<string, string>()

  for (const log of logs) {
    const buyer = (log.args.buyer as string).toLowerCase()
    const tokenAddr = (log.args.token as string).toLowerCase()
    const ids = log.args.ids as bigint[]
    const totalCost = log.args.totalCost as bigint
    const normalized = toMicrocents(totalCost, tokenDecimals.get(tokenAddr) ?? 6)

    if (buyer === addr) totalSpent += normalized

    const perPixelCost = ids.length > 0 ? normalized / BigInt(ids.length) : 0n
    for (const id of ids) {
      const idStr = id.toString()
      if (ownerOf.get(idStr) === addr) totalEarned += perPixelCost
      ownerOf.set(idStr, buyer)
    }
  }

  return { spent: totalSpent.toString(), earned: totalEarned.toString() }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const address = (url.searchParams.get('address') ?? '').toLowerCase()
  const mapId = (Number(url.searchParams.get('mapId') ?? '0') || 0) as MapId

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(ZERO)
  }

  const key = `${mapId}:${address}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json(hit.value, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
    })
  }

  try {
    const value = await computePnl(mapId, address)
    cache.set(key, { ts: Date.now(), value })
    return NextResponse.json(value, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
    })
  } catch (err) {
    logger.error('failed to compute P&L', { err: String(err), mapId, address })
    // Serve stale over zero if we have anything cached.
    if (hit) return NextResponse.json(hit.value)
    return NextResponse.json(ZERO)
  }
}
