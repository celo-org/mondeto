/**
 * Mondeto subgraph mappings (AssemblyScript / The Graph).
 *
 * Ported from the retired Envio handler (apps/indexer/src/handlers/Mondeto.ts).
 * Same intent, adapted to graph-ts + the new fields the frontend needs:
 *   - money normalized to 6-decimal microcents via the payment token's decimals
 *     (Token entity, fed by AcceptedTokenAdded) — see `toMicrocents`, which
 *     mirrors lib/purchaseLogs.ts;
 *   - `totalEarned` credited to previous owners (even split per batch), so
 *     /api/pnl is one query;
 *   - `lastGainAt` (+ block/logIndex) set on every count-INCREASING buy — the
 *     leaderboard tie-break;
 *   - per-map `MapStat` running totals (volume, tx, unique buyers, primary vs
 *     resale split) for /api/analytics.
 *
 * The frontend mapId is injected per contract via dataSource.context so all
 * eight map proxies share this one mapping file.
 */
import { BigInt, Bytes, Address, dataSource } from '@graphprotocol/graph-ts'
import {
  PixelsPurchased,
  ProfileUpdated,
  AcceptedTokenAdded,
  AcceptedTokenRemoved,
  FeeRateUpdated,
} from '../generated/Mondeto0/Mondeto'
import {
  Pixel,
  Owner,
  OwnerMapStat,
  PurchaseBatch,
  Purchase,
  OwnerProfile,
  Token,
  MapStat,
  ActiveBuyer,
} from '../generated/schema'

const MICRO = 6

/** mapId injected per contract via dataSource.context (see subgraph.yaml). */
function currentMapId(): i32 {
  return dataSource.context().getI32('mapId')
}

/**
 * Normalize a token amount to 6 decimals (the unit `formatUSDT` renders), so
 * mixed-token totals (e18 USDm vs e6 USDC) sum in one magnitude. Mirrors
 * `toMicrocents` in apps/web/src/lib/purchaseLogs.ts.
 */
function toMicrocents(cost: BigInt, decimals: i32): BigInt {
  if (decimals == MICRO) return cost
  if (decimals > MICRO) {
    return cost.div(BigInt.fromI32(10).pow((decimals - MICRO) as u8))
  }
  return cost.times(BigInt.fromI32(10).pow((MICRO - decimals) as u8))
}

/** Payment token's ERC-20 decimals; 6 when unknown (matches the old scanner's `?? 6`). */
function tokenDecimals(token: Address): i32 {
  const t = Token.load(token.toHexString())
  return t == null ? MICRO : t.decimals
}

function loadOrCreateMapStat(mapId: i32): MapStat {
  const id = mapId.toString()
  let s = MapStat.load(id)
  if (s == null) {
    s = new MapStat(id)
    s.mapId = mapId
    s.volumeAllTime = BigInt.zero()
    s.txCountAllTime = 0
    s.uniqueBuyers = 0
    s.primaryProceeds = BigInt.zero()
    s.resaleVolume = BigInt.zero()
    s.feeRateBps = 0
  }
  return s as MapStat
}

export function handlePixelsPurchased(event: PixelsPurchased): void {
  const mapId = currentMapId()
  const buyer = event.params.buyer
  const buyerId = buyer.toHexString()
  const token = event.params.token
  const ids = event.params.ids
  const timestamp = event.block.timestamp
  const blockNumber = event.block.number
  const txHash = event.transaction.hash
  const logIndex = event.logIndex
  const batchId = txHash.toHexString() + '-' + logIndex.toString()

  const normalized = toMicrocents(event.params.totalCost, tokenDecimals(token))
  let singlePixelPrice: BigInt | null = null
  if (ids.length == 1) singlePixelPrice = normalized
  const perPixelCost =
    ids.length > 0 ? normalized.div(BigInt.fromI32(ids.length)) : BigInt.zero()

  const batch = new PurchaseBatch(batchId)
  batch.mapId = mapId
  batch.buyer = buyer
  batch.token = token
  batch.pixelIds = ids
  batch.pixelCountInBatch = ids.length
  batch.totalCost = normalized
  batch.timestamp = timestamp
  batch.blockNumber = blockNumber
  batch.txHash = txHash
  batch.save()

  // Pixels taken from each previous owner (address -> count / earnings), and how
  // many the buyer netted (excludes re-buys of a pixel they already hold).
  const lostBy = new Map<string, i32>()
  const earnedBy = new Map<string, BigInt>()
  let buyerGained = 0
  let primaryAdd = BigInt.zero()
  let resaleAdd = BigInt.zero()

  // Track in-batch writes so a pixel id appearing twice in one batch sees the
  // first write as its previous state. The only in-batch writer is `buyer`.
  const localTouchedSaleCount = new Map<string, i32>()

  for (let i = 0; i < ids.length; i++) {
    const pixelId = ids[i]
    const pixelEntityId = mapId.toString() + '-' + pixelId.toString()

    // Previous owner as a lowercase hex id ('' = none / first claim). The only
    // in-batch writer is `buyer`, so a pixel seen earlier in this batch is his.
    let prevOwnerId = ''
    let prevSaleCount = 0
    let existedBefore = false
    if (localTouchedSaleCount.has(pixelEntityId)) {
      prevOwnerId = buyerId
      prevSaleCount = localTouchedSaleCount.get(pixelEntityId)
      existedBefore = true
    } else {
      const existing = Pixel.load(pixelEntityId)
      if (existing != null) {
        prevOwnerId = existing.owner.toHexString()
        prevSaleCount = existing.saleCount
        existedBefore = true
      }
    }

    const purchase = new Purchase(batchId + '-' + i.toString())
    purchase.batch = batchId
    purchase.mapId = mapId
    purchase.buyer = buyer
    purchase.pixelId = pixelId
    if (existedBefore) purchase.previousOwner = Bytes.fromHexString(prevOwnerId)
    purchase.pricePaid = singlePixelPrice
    purchase.timestamp = timestamp
    purchase.txHash = txHash
    purchase.save()

    let pixel = Pixel.load(pixelEntityId)
    if (pixel == null) pixel = new Pixel(pixelEntityId)
    pixel.mapId = mapId
    pixel.pixelId = pixelId
    pixel.owner = buyer
    pixel.saleCount = prevSaleCount + 1
    pixel.lastPricePaid = singlePixelPrice
    pixel.lastSoldAt = timestamp
    pixel.lastTxHash = txHash
    pixel.save()

    localTouchedSaleCount.set(pixelEntityId, prevSaleCount + 1)

    // Treasury split: a pixel with no prior owner is a primary sale (100%
    // treasury); any resale contributes to resaleVolume (fee cut applied later).
    if (existedBefore) resaleAdd = resaleAdd.plus(perPixelCost)
    else primaryAdd = primaryAdd.plus(perPixelCost)

    // Net gain / raid bookkeeping ignores re-buying a pixel you already hold.
    if (prevOwnerId != buyerId) {
      buyerGained += 1
      if (prevOwnerId != '') {
        lostBy.set(prevOwnerId, (lostBy.has(prevOwnerId) ? lostBy.get(prevOwnerId) : 0) + 1)
        const prevEarned = earnedBy.has(prevOwnerId) ? earnedBy.get(prevOwnerId) : BigInt.zero()
        earnedBy.set(prevOwnerId, prevEarned.plus(perPixelCost))
      }
    }
  }

  // --- Buyer aggregates: global + per-map. totalSpent is gross, never refunded.
  let owner = Owner.load(buyerId)
  if (owner == null) {
    owner = new Owner(buyerId)
    owner.address = buyer
    owner.pixelCount = 0
    owner.totalSpent = BigInt.zero()
    owner.totalEarned = BigInt.zero()
    owner.firstPurchaseAt = timestamp
    owner.lastGainAt = BigInt.zero()
    owner.lastGainBlock = BigInt.zero()
    owner.lastGainLogIndex = BigInt.zero()
  }
  owner.pixelCount = owner.pixelCount + buyerGained
  owner.totalSpent = owner.totalSpent.plus(normalized)
  owner.lastPurchaseAt = timestamp
  if (buyerGained > 0) {
    owner.lastGainAt = timestamp
    owner.lastGainBlock = blockNumber
    owner.lastGainLogIndex = logIndex
  }
  owner.save()

  const statsId = mapId.toString() + '-' + buyerId
  let mapStats = OwnerMapStat.load(statsId)
  if (mapStats == null) {
    mapStats = new OwnerMapStat(statsId)
    mapStats.mapId = mapId
    mapStats.address = buyer
    mapStats.pixelCount = 0
    mapStats.totalSpent = BigInt.zero()
    mapStats.totalEarned = BigInt.zero()
    mapStats.lastGainAt = BigInt.zero()
    mapStats.lastGainBlock = BigInt.zero()
    mapStats.lastGainLogIndex = BigInt.zero()
  }
  mapStats.pixelCount = mapStats.pixelCount + buyerGained
  mapStats.totalSpent = mapStats.totalSpent.plus(normalized)
  if (buyerGained > 0) {
    mapStats.lastGainAt = timestamp
    mapStats.lastGainBlock = blockNumber
    mapStats.lastGainLogIndex = logIndex
  }
  mapStats.save()

  // --- Previous owners: lose raided pixels (clamped ≥ 0) and earn the fee-less
  // per-pixel proceeds the buyer paid. Earnings accrue globally + per map.
  const losers = lostBy.keys()
  for (let i = 0; i < losers.length; i++) {
    const loserId = losers[i]
    const lostCount = lostBy.get(loserId)
    const earned = earnedBy.get(loserId)

    const loserOwner = Owner.load(loserId)
    if (loserOwner != null) {
      let pc = loserOwner.pixelCount - lostCount
      if (pc < 0) pc = 0
      loserOwner.pixelCount = pc
      loserOwner.totalEarned = loserOwner.totalEarned.plus(earned)
      loserOwner.save()
    }
    const loserStatsId = mapId.toString() + '-' + loserId
    const loserStats = OwnerMapStat.load(loserStatsId)
    if (loserStats != null) {
      let pc2 = loserStats.pixelCount - lostCount
      if (pc2 < 0) pc2 = 0
      loserStats.pixelCount = pc2
      loserStats.totalEarned = loserStats.totalEarned.plus(earned)
      loserStats.save()
    }
  }

  // --- Per-map analytics running totals.
  const analytics = loadOrCreateMapStat(mapId)
  analytics.volumeAllTime = analytics.volumeAllTime.plus(normalized)
  analytics.txCountAllTime = analytics.txCountAllTime + 1
  analytics.primaryProceeds = analytics.primaryProceeds.plus(primaryAdd)
  analytics.resaleVolume = analytics.resaleVolume.plus(resaleAdd)
  const activeId = mapId.toString() + '-' + buyerId
  if (ActiveBuyer.load(activeId) == null) {
    const marker = new ActiveBuyer(activeId)
    marker.save()
    analytics.uniqueBuyers = analytics.uniqueBuyers + 1
  }
  analytics.save()
}

export function handleProfileUpdated(event: ProfileUpdated): void {
  const mapId = currentMapId()
  const user = event.params.user
  const id = mapId.toString() + '-' + user.toHexString()
  let p = OwnerProfile.load(id)
  if (p == null) p = new OwnerProfile(id)
  p.mapId = mapId
  p.address = user
  p.color = event.params.color
  p.label = event.params.label
  p.url = event.params.url
  p.updatedAt = event.block.timestamp
  p.save()
}

export function handleAcceptedTokenAdded(event: AcceptedTokenAdded): void {
  const id = event.params.token.toHexString()
  let t = Token.load(id)
  if (t == null) t = new Token(id)
  t.decimals = event.params.decimals
  t.accepted = true
  t.save()
}

export function handleAcceptedTokenRemoved(event: AcceptedTokenRemoved): void {
  const id = event.params.token.toHexString()
  const t = Token.load(id)
  if (t != null) {
    t.accepted = false
    t.save()
  }
}

export function handleFeeRateUpdated(event: FeeRateUpdated): void {
  const s = loadOrCreateMapStat(currentMapId())
  s.feeRateBps = event.params.feeRate.toI32()
  s.save()
}
