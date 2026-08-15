import { NextResponse } from 'next/server'
import { fallbackReadClient } from '@/lib/chain'
import { getMapContractById } from '@/lib/maps/contracts'
import { estimateHistoryFromBlock, scanNormalizedPurchases, toMicrocents } from '@/lib/purchaseLogs'
import { fetchOwnerPnl, subgraphConfigured } from '@/lib/subgraph'
import { netOfResaleFee, readFeeRateBps } from '@/lib/resaleFee'
import { logger } from '@/lib/logger'
import type { MapId } from '@/lib/maps/types'

/**
 * Server-side profit-and-loss for one wallet on one map: SPENT is the sum of the
 * wallet's own buys; EARNED is what actually reached the wallet when later
 * buyers took pixels off it. Values are 6-decimal "microcents" (the unit
 * `formatUSDT` renders).
 *
 * When the Goldsky subgraph is configured (NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL),
 * both numbers are a single indexed query (OwnerMapStats.totalSpent/totalEarned).
 * Otherwise we fall back to the legacy full-history `PixelsPurchased` log scan —
 * so this route behaves identically until the subgraph URL is set.
 *
 * EARNED is netted of the resale fee here rather than at either source, because
 * **both sources report it gross**. The subgraph accumulates `perPixelCost`
 * straight into `Owner.totalEarned` (`apps/subgraph/src/mapping.ts`, despite a
 * comment there claiming otherwise), and the log scan below does the same. On
 * chain the seller receives `price − fee`, so reporting either number as-is
 * overstates what reached the wallet by the fee rate — the app would state a
 * figure the player's own transaction history contradicts.
 *
 * Netting in the route also means no subgraph resync: it corrects historical
 * data that is already indexed. See `lib/resaleFee.ts` for the two
 * approximations that come with applying the current rate to lifetime totals.
 *
 * SPENT stays gross on purpose — the buyer really does pay the whole price.
 */

export const dynamic = 'force-dynamic'
// The full-history log scan is ~hundreds of small getLogs calls; give the
// function room beyond the 10s default so a cold computation finishes.
export const maxDuration = 60

const CACHE_TTL_MS = 60_000

interface Pnl {
  spent: string
  earned: string
}

const ZERO: Pnl = { spent: '0', earned: '0' }

// Per (mapId, address) warm-instance cache.
const cache = new Map<string, { ts: number; value: Pnl }>()

async function computePnl(mapId: MapId, addr: string): Promise<Pnl> {
  const grossEarnedAndSpent = subgraphConfigured()
    ? // Preferred path: one indexed query for the wallet's LIFETIME spend/earn
      // across every map (the global Owner entity). `mapId` is ignored here —
      // the profile shows an all-maps lifetime figure. The legacy fallback is
      // still per-map (it can only scan one contract's logs).
      await fetchOwnerPnl(addr)
    : await computePnlFromLogs(mapId, addr)

  // Both sources report EARNED gross; the seller only ever received
  // `price − fee`. The rate is read from the map whose contract we'd scan,
  // which is also the rate the profile's own map is settling at.
  const feeRateBps = await readFeeRateBps(getMapContractById(mapId).address, mapId)
  return {
    spent: grossEarnedAndSpent.spent,
    earned: netOfResaleFee(BigInt(grossEarnedAndSpent.earned), feeRateBps).toString(),
  }
}

async function computePnlFromLogs(mapId: MapId, addr: string): Promise<Pnl> {
  const contract = getMapContractById(mapId)
  const mondetoAddress = contract.address
  const client = fallbackReadClient

  const currentBlock = await client.getBlockNumber()

  // Estimate the first-sale block from the contract's own clock so we don't
  // scan from genesis. `null` means no purchases yet — nothing to scan.
  const fromBlock = await estimateHistoryFromBlock(mondetoAddress, currentBlock)
  if (fromBlock === null) return ZERO

  const { logs, tokenDecimals, failedChunks, totalChunks } = await scanNormalizedPurchases(
    mondetoAddress,
    fromBlock,
    currentBlock,
  )
  // A handful of dropped chunks skews P&L slightly; a wholesale failure means
  // the numbers are untrustworthy — surface it so a stale/zero result is
  // explainable rather than silently wrong.
  if (failedChunks > 0) {
    logger.warn('P&L scan had failed chunks', { failedChunks, totalChunks, mapId, address: addr })
  }

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
