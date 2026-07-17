/**
 * Falling-price helpers.
 *
 * The halving clock (halvingStartTimestamp, halvingTime) is MAP-GLOBAL:
 * while unsold, every pixel's price on a map decays continuously, halving
 * once per `halvingTime`. That is a constant daily rate — never a countdown
 * to an event.
 *
 * A "deal" is a pixel whose current price sits BELOW the map's initial
 * (entry) price — possible once the epoch overtakes a pixel's saleCount,
 * i.e. long-unsold or never-sold land decaying under the entry price.
 */

const DAY_SECONDS = 86_400

/**
 * Percent a pixel's price falls per day while unsold:
 * (1 − 2^(−86400 / halvingTimeSeconds)) × 100
 *
 * e.g. 14-day halving → ~4.83%/day. Returns 0 for non-positive or
 * non-finite inputs.
 */
export function dailyFallPct(halvingTimeSeconds: number): number {
  if (!Number.isFinite(halvingTimeSeconds) || halvingTimeSeconds <= 0) return 0
  return (1 - Math.pow(2, -DAY_SECONDS / halvingTimeSeconds)) * 100
}

/**
 * Days for one price halving: halvingTimeSeconds / 86400.
 * Returns 0 for non-positive or non-finite inputs.
 */
export function halvingPeriodDays(halvingTimeSeconds: number): number {
  if (!Number.isFinite(halvingTimeSeconds) || halvingTimeSeconds <= 0) return 0
  return halvingTimeSeconds / DAY_SECONDS
}

// Fixed-point scale for the bigint → number conversion below. Prices are
// 6-decimal micro-USDT bigints that can exceed Number's safe range, so we
// take the ratio in bigint space first and only then convert.
const DEPTH_SCALE = 1_000_000n

/**
 * How far below the entry (initial) price a pixel currently sits, as a
 * 0..1 fraction: 1 − currentPrice / initialPrice.
 *
 * Returns 0 when the pixel is at or above the entry price, or when the
 * inputs are unusable (non-positive initialPrice, negative currentPrice).
 */
export function dealDepth(currentPrice: bigint, initialPrice: bigint): number {
  if (initialPrice <= 0n) return 0
  if (currentPrice < 0n) return 0
  if (currentPrice >= initialPrice) return 0
  const ratio = Number((currentPrice * DEPTH_SCALE) / initialPrice) / Number(DEPTH_SCALE)
  const depth = 1 - ratio
  if (depth < 0) return 0
  if (depth > 1) return 1
  return depth
}
