import { fallbackReadClient } from '@/lib/chain'
import { MONDETO_ABI } from '@/lib/contract'
import { BPS_DENOM } from '@/lib/buyLimits'
import { logger } from '@/lib/logger'
import type { MapId } from '@/lib/maps/types'

/**
 * The contract's resale fee, and the arithmetic for applying it.
 *
 * On a resale the contract keeps `feeRate` basis points and forwards the rest
 * to the seller, so a seller's *proceeds* are always less than the price the
 * buyer paid. Anywhere we report what a wallet earned, that cut has to come
 * off — otherwise the app states a number the player's own wallet contradicts,
 * which is its own support-ticket generator.
 *
 * A first (primary) sale has no previous owner: the whole price goes to the
 * treasury and no one earns anything, so nothing on that path needs adjusting.
 */

/**
 * Read the live fee rate in basis points. Admin-settable on-chain (capped at
 * 2000), so it is read rather than hardcoded.
 *
 * Falls back to 0 on a read failure, which reports gross rather than
 * over-deducting — the same posture `/api/analytics` already takes. A warn is
 * emitted so a silently un-netted figure is explainable rather than mysterious.
 */
export async function readFeeRateBps(
  contractAddress: `0x${string}`,
  mapId: MapId,
): Promise<number> {
  try {
    const rate = (await fallbackReadClient.readContract({
      address: contractAddress,
      abi: MONDETO_ABI,
      functionName: 'feeRate',
    })) as bigint
    return Number(rate)
  } catch (e) {
    logger.warn('failed to read feeRate', { err: String(e), mapId })
    return 0
  }
}

/**
 * Seller proceeds for `gross` resale volume at `feeRateBps`.
 *
 * Mirrors the contract's own shape — take the fee, then subtract it — so the
 * truncation lands the same way rather than being reintroduced as a rounding
 * difference.
 *
 * Two approximations worth knowing about when reading the result:
 *
 * - It applies the **current** rate to historical totals. If the rate has ever
 *   been changed, older sales settled at the old one. `/api/analytics` already
 *   makes exactly this trade for treasury revenue; matching it keeps the two
 *   numbers consistent with each other, which matters more than either being
 *   individually exact.
 * - On-chain the fee is truncated per transfer, whereas this applies it once to
 *   an aggregate. The gap is bounded by a microcent per resale.
 *
 * A nonsensical rate (negative, or above 100%) is treated as 0 rather than
 * flipping proceeds negative — a bad read should understate the correction,
 * never invent a debt.
 */
export function netOfResaleFee(gross: bigint, feeRateBps: number): bigint {
  if (!Number.isFinite(feeRateBps) || feeRateBps <= 0) return gross
  const bps = BigInt(Math.floor(feeRateBps))
  if (bps >= BPS_DENOM) return gross
  return gross - (gross * bps) / BPS_DENOM
}
