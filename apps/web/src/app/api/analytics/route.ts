import { NextResponse } from 'next/server'
import { fallbackReadClient } from '@/lib/chain'
import { MONDETO_ABI } from '@/lib/contract'
import { getContractByMapId } from '@/lib/maps/contracts'
import { scanPurchaseLogs } from '@/lib/purchaseLogs'
import { logger } from '@/lib/logger'
import type { MapId } from '@/lib/maps/types'

/**
 * Server-side game analytics for one map (players, tx counts, volume, revenue).
 *
 * Like /api/pnl, these are reconstructed from the full `PixelsPurchased` log.
 * Run on the phone it silently returned zero because public Celo RPCs reject
 * eth_getLogs windows over ~5k blocks and the old hook used 50k-block chunks.
 * Here the scan runs on Vercel's network via the shared scanner; the client
 * fetches a small JSON. Bigint fields ship as decimal strings.
 *
 * Lightweight live-read stand-in for the Envio indexer — no history beyond the
 * lookback window, no persistence.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Celo mainnet block time is ~1s post-L2. Upper bounds — the 24h/7d cutoffs are
// by block number, matching the previous client behaviour.
const BLOCKS_PER_DAY = 86_400n
const BLOCKS_PER_WEEK = 604_800n
// How far back to fetch logs for "all-time" metrics. Bump when we have a real
// indexer. (~8 days at 1s/block.)
const LOOKBACK_BLOCKS = 700_000n
const CACHE_TTL_MS = 60_000

interface AnalyticsResponse {
  dailyActiveUsers: number
  weeklyActiveUsers: number
  allTimePlayers: number
  txCount24h: number
  txCount7d: number
  txCountAllTime: number
  volume24h: string
  volume7d: string
  volumeAllTime: string
  feeRateBps: number
  revenueAllTime: string
  windowStartBlock: string
  windowEndBlock: string
  fetchedAt: number
}

// Per-mapId warm-instance cache.
const cache = new Map<string, { ts: number; value: AnalyticsResponse }>()

// Normalize a token amount to 6 decimals (the unit `formatUSDT` displays).
function toMicrocents(cost: bigint, decimals: number): bigint {
  if (decimals === 6) return cost
  if (decimals > 6) return cost / 10n ** BigInt(decimals - 6)
  return cost * 10n ** BigInt(6 - decimals)
}

async function computeAnalytics(mapId: MapId): Promise<AnalyticsResponse> {
  const contractAddress = getContractByMapId(mapId)
  const client = fallbackReadClient

  const currentBlock = await client.getBlockNumber()
  const fromBlock = currentBlock > LOOKBACK_BLOCKS ? currentBlock - LOOKBACK_BLOCKS : 0n

  const { logs, failedChunks, totalChunks } = await scanPurchaseLogs(
    contractAddress,
    fromBlock,
    currentBlock,
  )
  if (failedChunks > 0) {
    logger.warn('analytics scan had failed chunks', { failedChunks, totalChunks, mapId })
  }

  // Fee rate in basis points (e.g. 300 = 3%).
  let feeRateBps = 0
  try {
    const rate = (await client.readContract({
      address: contractAddress,
      abi: MONDETO_ABI,
      functionName: 'feeRate',
    })) as bigint
    feeRateBps = Number(rate)
  } catch (e) {
    logger.warn('failed to read feeRate', { err: String(e), mapId })
  }

  const dayCutoff = currentBlock > BLOCKS_PER_DAY ? currentBlock - BLOCKS_PER_DAY : 0n
  const weekCutoff = currentBlock > BLOCKS_PER_WEEK ? currentBlock - BLOCKS_PER_WEEK : 0n

  // Normalize mixed-token totals to a single 6-decimal unit before summing.
  const tokenDecimals = new Map<string, number>()
  const uniqueTokens = new Set<string>()
  for (const log of logs) uniqueTokens.add((log.args.token as string).toLowerCase())
  await Promise.all(
    [...uniqueTokens].map(async (token) => {
      try {
        const [, dec] = (await client.readContract({
          address: contractAddress,
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

  const allBuyers = new Set<string>()
  const dailyBuyers = new Set<string>()
  const weeklyBuyers = new Set<string>()
  let txCount24h = 0
  let txCount7d = 0
  let volume24h = 0n
  let volume7d = 0n
  let volumeAllTime = 0n

  for (const log of logs) {
    const buyer = (log.args.buyer as string).toLowerCase()
    const tokenAddr = (log.args.token as string).toLowerCase()
    const totalCost = log.args.totalCost as bigint
    const normalized = toMicrocents(totalCost, tokenDecimals.get(tokenAddr) ?? 6)
    const block = log.blockNumber ?? 0n

    allBuyers.add(buyer)
    volumeAllTime += normalized

    if (block >= weekCutoff) {
      weeklyBuyers.add(buyer)
      txCount7d++
      volume7d += normalized
    }
    if (block >= dayCutoff) {
      dailyBuyers.add(buyer)
      txCount24h++
      volume24h += normalized
    }
  }

  const revenueAllTime = feeRateBps > 0 ? (volumeAllTime * BigInt(feeRateBps)) / 10_000n : 0n

  return {
    dailyActiveUsers: dailyBuyers.size,
    weeklyActiveUsers: weeklyBuyers.size,
    allTimePlayers: allBuyers.size,
    txCount24h,
    txCount7d,
    txCountAllTime: logs.length,
    volume24h: volume24h.toString(),
    volume7d: volume7d.toString(),
    volumeAllTime: volumeAllTime.toString(),
    feeRateBps,
    revenueAllTime: revenueAllTime.toString(),
    windowStartBlock: fromBlock.toString(),
    windowEndBlock: currentBlock.toString(),
    fetchedAt: Date.now(),
  }
}

export async function GET(req: Request) {
  const mapId = (Number(new URL(req.url).searchParams.get('mapId') ?? '0') || 0) as MapId
  const key = String(mapId)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json(hit.value, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
    })
  }

  try {
    const value = await computeAnalytics(mapId)
    cache.set(key, { ts: Date.now(), value })
    return NextResponse.json(value, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' },
    })
  } catch (err) {
    logger.error('failed to compute analytics', { err: String(err), mapId })
    if (hit) return NextResponse.json(hit.value)
    return NextResponse.json({ error: 'failed to compute analytics' }, { status: 500 })
  }
}
