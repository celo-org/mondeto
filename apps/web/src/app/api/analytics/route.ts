import { NextResponse } from 'next/server'
import { fallbackReadClient } from '@/lib/chain'
import { MONDETO_ABI } from '@/lib/contract'
import { getContractByMapId } from '@/lib/maps/contracts'
import { estimateHistoryFromBlock, scanNormalizedPurchases, toMicrocents } from '@/lib/purchaseLogs'
import { fetchBatchesSince, fetchMapStats, subgraphConfigured } from '@/lib/subgraph'
import { readFeeRateBps } from '@/lib/resaleFee'
import { logger } from '@/lib/logger'
import type { MapId } from '@/lib/maps/types'

/**
 * Server-side game analytics for one map (players, tx counts, volume, revenue).
 *
 * When the Goldsky subgraph is configured (NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL),
 * all-time figures come from the indexed `MapStats` running totals and the
 * rolling 24h/7d windows from a bounded `PurchaseBatch` query. Otherwise we fall
 * back to the legacy full-history `PixelsPurchased` log scan — identical output
 * until the subgraph URL is set.
 *
 * Revenue = the contract treasury's take. A first-time (primary) sale has no
 * previous owner, so 100% of its price stays in the contract; a resale pays the
 * `feeRate` cut to the contract and the rest to the seller. Both paths split
 * primary vs resale proceeds so a naive `volume × feeRate` doesn't undercount
 * the treasury by ignoring primary sales.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Celo mainnet block time is ~1s post-L2. Upper bounds — the 24h/7d cutoffs are
// by block number, matching the previous client behaviour.
const BLOCKS_PER_DAY = 86_400n
const BLOCKS_PER_WEEK = 604_800n
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
  // Treasury take = primary-sale proceeds + resale fees (all in 6-decimal units).
  revenueAllTime: string
  primaryProceedsAllTime: string
  resaleVolumeAllTime: string
  windowStartBlock: string
  windowEndBlock: string
  fetchedAt: number
}

// Per-mapId warm-instance cache.
const cache = new Map<string, { ts: number; value: AnalyticsResponse }>()

const DAY_SECONDS = 86_400
const WEEK_SECONDS = 604_800

function emptyAnalytics(feeRateBps: number, windowMark: string): AnalyticsResponse {
  return {
    dailyActiveUsers: 0,
    weeklyActiveUsers: 0,
    allTimePlayers: 0,
    txCount24h: 0,
    txCount7d: 0,
    txCountAllTime: 0,
    volume24h: '0',
    volume7d: '0',
    volumeAllTime: '0',
    feeRateBps,
    revenueAllTime: '0',
    primaryProceedsAllTime: '0',
    resaleVolumeAllTime: '0',
    windowStartBlock: windowMark,
    windowEndBlock: windowMark,
    fetchedAt: Date.now(),
  }
}

async function computeAnalytics(mapId: MapId): Promise<AnalyticsResponse> {
  if (subgraphConfigured()) return computeAnalyticsFromSubgraph(mapId)
  return computeAnalyticsFromLogs(mapId)
}

/**
 * All-time totals from the indexed MapStats; rolling 24h/7d windows from a
 * bounded PurchaseBatch query (timestamp >= cutoff). Windows are by wall-clock
 * time rather than block number, which is more accurate than the log-scan path's
 * block-count approximation.
 */
async function computeAnalyticsFromSubgraph(mapId: MapId): Promise<AnalyticsResponse> {
  const nowSec = Math.floor(Date.now() / 1000)
  // The fee rate is read live from the contract, NOT from the subgraph: the
  // contract sets the initial fee in initialize() without emitting
  // FeeRateUpdated (only setFeeRate() emits), so MapStat.feeRateBps stays 0 and
  // would wrongly show "resale fees @ 0.00%". feeRate() is current-state anyway.
  const [stats, feeRateBps] = await Promise.all([
    fetchMapStats(mapId),
    readFeeRateBps(getContractByMapId(mapId), mapId),
  ])
  if (!stats) return emptyAnalytics(feeRateBps, String(nowSec))
  const primaryProceeds = BigInt(stats.primaryProceeds)
  const resaleVolume = BigInt(stats.resaleVolume)
  const resaleFee = feeRateBps > 0 ? (resaleVolume * BigInt(feeRateBps)) / 10_000n : 0n
  const revenueAllTime = primaryProceeds + resaleFee

  const dayCut = nowSec - DAY_SECONDS
  const weekBatches = await fetchBatchesSince(mapId, nowSec - WEEK_SECONDS)
  const weeklyBuyers = new Set<string>()
  const dailyBuyers = new Set<string>()
  let txCount24h = 0
  let txCount7d = 0
  let volume24h = 0n
  let volume7d = 0n
  for (const b of weekBatches) {
    const buyer = b.buyer.toLowerCase()
    const cost = BigInt(b.totalCost)
    weeklyBuyers.add(buyer)
    txCount7d++
    volume7d += cost
    if (Number(b.timestamp) >= dayCut) {
      dailyBuyers.add(buyer)
      txCount24h++
      volume24h += cost
    }
  }

  return {
    dailyActiveUsers: dailyBuyers.size,
    weeklyActiveUsers: weeklyBuyers.size,
    allTimePlayers: stats.uniqueBuyers,
    txCount24h,
    txCount7d,
    txCountAllTime: stats.txCountAllTime,
    volume24h: volume24h.toString(),
    volume7d: volume7d.toString(),
    volumeAllTime: BigInt(stats.volumeAllTime).toString(),
    feeRateBps,
    revenueAllTime: revenueAllTime.toString(),
    primaryProceedsAllTime: primaryProceeds.toString(),
    resaleVolumeAllTime: resaleVolume.toString(),
    windowStartBlock: String(nowSec - WEEK_SECONDS),
    windowEndBlock: String(nowSec),
    fetchedAt: Date.now(),
  }
}

async function computeAnalyticsFromLogs(mapId: MapId): Promise<AnalyticsResponse> {
  const contractAddress = getContractByMapId(mapId)
  const client = fallbackReadClient

  const currentBlock = await client.getBlockNumber()
  const [fromBlock, feeRateBps] = await Promise.all([
    estimateHistoryFromBlock(contractAddress, currentBlock),
    readFeeRateBps(contractAddress, mapId),
  ])

  // No purchases yet — nothing to scan.
  if (fromBlock === null) {
    return {
      dailyActiveUsers: 0,
      weeklyActiveUsers: 0,
      allTimePlayers: 0,
      txCount24h: 0,
      txCount7d: 0,
      txCountAllTime: 0,
      volume24h: '0',
      volume7d: '0',
      volumeAllTime: '0',
      feeRateBps,
      revenueAllTime: '0',
      primaryProceedsAllTime: '0',
      resaleVolumeAllTime: '0',
      windowStartBlock: currentBlock.toString(),
      windowEndBlock: currentBlock.toString(),
      fetchedAt: Date.now(),
    }
  }

  const { logs, tokenDecimals, failedChunks, totalChunks } = await scanNormalizedPurchases(
    contractAddress,
    fromBlock,
    currentBlock,
  )
  if (failedChunks > 0) {
    logger.warn('analytics scan had failed chunks', { failedChunks, totalChunks, mapId })
  }

  const dayCutoff = currentBlock > BLOCKS_PER_DAY ? currentBlock - BLOCKS_PER_DAY : 0n
  const weekCutoff = currentBlock > BLOCKS_PER_WEEK ? currentBlock - BLOCKS_PER_WEEK : 0n

  const allBuyers = new Set<string>()
  const dailyBuyers = new Set<string>()
  const weeklyBuyers = new Set<string>()
  let txCount24h = 0
  let txCount7d = 0
  let volume24h = 0n
  let volume7d = 0n
  let volumeAllTime = 0n

  // Ownership replay: split each per-pixel cost into primary (no prior owner →
  // 100% treasury) vs resale (prior owner → feeRate to treasury, rest to seller).
  const ownerOf = new Map<string, string>()
  let primaryProceeds = 0n
  let resaleVolume = 0n

  for (const log of logs) {
    const buyer = (log.args.buyer as string).toLowerCase()
    const tokenAddr = (log.args.token as string).toLowerCase()
    const ids = log.args.ids as bigint[]
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

    const perPixelCost = ids.length > 0 ? normalized / BigInt(ids.length) : 0n
    for (const id of ids) {
      const idStr = id.toString()
      if (ownerOf.has(idStr)) resaleVolume += perPixelCost
      else primaryProceeds += perPixelCost
      ownerOf.set(idStr, buyer)
    }
  }

  // Treasury take: all of primary proceeds + the fee cut on resales.
  const resaleFee = feeRateBps > 0 ? (resaleVolume * BigInt(feeRateBps)) / 10_000n : 0n
  const revenueAllTime = primaryProceeds + resaleFee

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
    primaryProceedsAllTime: primaryProceeds.toString(),
    resaleVolumeAllTime: resaleVolume.toString(),
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
