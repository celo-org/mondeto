import { NextResponse } from 'next/server'
import { fallbackReadClient } from '@/lib/chain'
import { getMapContractById } from '@/lib/maps/contracts'
import { estimateHistoryFromBlock, scanNormalizedPurchases, toMicrocents } from '@/lib/purchaseLogs'
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

interface Pnl {
  spent: string
  earned: string
}

const ZERO: Pnl = { spent: '0', earned: '0' }

// Per (mapId, address) warm-instance cache.
const cache = new Map<string, { ts: number; value: Pnl }>()

async function computePnl(mapId: MapId, addr: string): Promise<Pnl> {
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
