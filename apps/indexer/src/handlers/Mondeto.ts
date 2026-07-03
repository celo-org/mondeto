/**
 * Event handlers for the Mondeto map contracts (HyperIndex V3 unified API).
 *
 * NOTE: `pnpm codegen` must run before this file type-checks — it writes the
 * ambient declarations (.envio/types.d.ts) that type `indexer`, `context`
 * and the entity shapes exported by the `envio` package.
 *
 * V3 preload optimization runs every handler twice (a batched preload pass,
 * then the real pass), so everything here is a pure function of `event` and
 * `context` reads — no module-level mutable state, no external side effects.
 */

import { indexer, type Pixel } from 'envio'
import { mapIdForAddress } from '../maps'

/** Best-effort UTF-8 decode of a 0x-prefixed hex byte string. */
function decodeBytesUtf8(hex: string): string {
  try {
    const stripped = hex.startsWith('0x') ? hex.slice(2) : hex
    return Buffer.from(stripped, 'hex')
      .toString('utf8')
      .replace(/\u0000/g, '')
  } catch {
    return ''
  }
}

indexer.onEvent(
  { contract: 'Mondeto', event: 'PixelsPurchased' },
  async ({ event, context }) => {
    const mapId = mapIdForAddress(event.srcAddress)
    if (mapId === undefined) {
      context.log.warn(
        `PixelsPurchased from unknown contract ${event.srcAddress} — registry drift between config.yaml and src/maps.ts`,
      )
      return
    }

    const buyer = event.params.buyer.toLowerCase()
    const token = event.params.token.toLowerCase()
    const ids: bigint[] = [...event.params.ids]
    const totalCost = event.params.totalCost
    const timestamp = BigInt(event.block.timestamp)
    const blockNumber = BigInt(event.block.number)
    const txHash = event.transaction.hash
    const batchId = `${txHash}-${event.logIndex}`

    // The contract only emits the batch total. Splitting it evenly across
    // pixels would be wrong (epoch pricing makes each pixel's cost depend on
    // its own sale history), so a per-pixel price is only recorded for
    // single-pixel batches; multi-pixel buys keep the exact figure on the
    // PurchaseBatch row.
    const singlePixelPrice = ids.length === 1 ? totalCost : undefined

    // Read current pixel state up front so the preload pass batches the
    // lookups into one database round trip.
    const existingPixels = await Promise.all(
      ids.map((pixelId) => context.Pixel.get(`${mapId}-${pixelId}`)),
    )

    context.PurchaseBatch.set({
      id: batchId,
      mapId,
      buyer,
      token,
      pixelIds: ids,
      pixelCountInBatch: ids.length,
      totalCost,
      timestamp,
      blockNumber,
      txHash,
    })

    // Pixels taken from each previous owner in this batch (address -> count),
    // and how many pixels the buyer netted (excludes re-buys of own pixels).
    const lostBy = new Map<string, number>()
    let buyerGained = 0

    // Track in-batch pixel writes locally so a pixel id appearing twice in
    // one batch sees the first write as its previous state.
    const localPixelState = new Map<string, Pixel>()

    ids.forEach((pixelId, arrayIndex) => {
      const pixelEntityId = `${mapId}-${pixelId}`
      const before = localPixelState.get(pixelEntityId) ?? existingPixels[arrayIndex]
      const previousOwner = before?.owner

      context.Purchase.set({
        id: `${batchId}-${arrayIndex}`,
        batchId,
        mapId,
        buyer,
        pixelId,
        previousOwner,
        pricePaid: singlePixelPrice,
        timestamp,
        txHash,
      })

      const updated: Pixel = {
        id: pixelEntityId,
        mapId,
        pixelId,
        owner: buyer,
        saleCount: (before?.saleCount ?? 0) + 1,
        lastPricePaid: singlePixelPrice,
        lastSoldAt: timestamp,
        lastTxHash: txHash,
      }
      context.Pixel.set(updated)
      localPixelState.set(pixelEntityId, updated)

      if (previousOwner !== buyer) {
        buyerGained += 1
        if (previousOwner !== undefined) {
          lostBy.set(previousOwner, (lostBy.get(previousOwner) ?? 0) + 1)
        }
      }
    })

    // Buyer aggregates: global and per-map. totalSpent is gross spend and is
    // never decremented — losing a pixel later does not refund the buy.
    const owner = await context.Owner.get(buyer)
    context.Owner.set({
      id: buyer,
      address: buyer,
      pixelCount: (owner?.pixelCount ?? 0) + buyerGained,
      totalSpent: (owner?.totalSpent ?? 0n) + totalCost,
      firstPurchaseAt: owner?.firstPurchaseAt ?? timestamp,
      lastPurchaseAt: timestamp,
    })

    const statsId = `${mapId}-${buyer}`
    const stats = await context.OwnerMapStats.get(statsId)
    context.OwnerMapStats.set({
      id: statsId,
      mapId,
      address: buyer,
      pixelCount: (stats?.pixelCount ?? 0) + buyerGained,
      totalSpent: (stats?.totalSpent ?? 0n) + totalCost,
    })

    // Previous owners lose the raided pixels from their live counts. Counts
    // are clamped at zero defensively; with full history from start_block
    // the clamp should never bite.
    for (const [loser, lostCount] of lostBy) {
      const loserOwner = await context.Owner.get(loser)
      if (loserOwner) {
        context.Owner.set({
          ...loserOwner,
          pixelCount: Math.max(0, loserOwner.pixelCount - lostCount),
        })
      }
      const loserStatsId = `${mapId}-${loser}`
      const loserStats = await context.OwnerMapStats.get(loserStatsId)
      if (loserStats) {
        context.OwnerMapStats.set({
          ...loserStats,
          pixelCount: Math.max(0, loserStats.pixelCount - lostCount),
        })
      }
    }
  },
)

indexer.onEvent(
  { contract: 'Mondeto', event: 'ProfileUpdated' },
  async ({ event, context }) => {
    const mapId = mapIdForAddress(event.srcAddress)
    if (mapId === undefined) return

    const user = event.params.user.toLowerCase()
    const labelHex = event.params.label
    const urlHex = event.params.url

    context.OwnerProfile.set({
      id: `${mapId}-${user}`,
      mapId,
      address: user,
      color: Number(event.params.color),
      labelHex,
      label: decodeBytesUtf8(labelHex),
      urlHex,
      url: decodeBytesUtf8(urlHex),
      updatedAt: BigInt(event.block.timestamp),
    })
  },
)
