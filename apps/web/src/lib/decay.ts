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
 * e.g. a 14-day halving → ~4.83%/day (illustrative; callers pass the live
 * `config().halvingTime`). Returns 0 for non-positive or non-finite inputs.
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

/**
 * Default brightness floor for the DEALS ramp: even the shallowest deal stage
 * reads as clearly lime rather than near-black moss, so buyable land never
 * looks like a grey, taken pixel.
 */
export const DEAL_MIN_LIME = 0.3

/**
 * How many price levels count as "a deal" in the DEALS view — the cheapest N
 * distinct prices on the map, from the very lowest (deepest deal) up. Anchored
 * to whatever the lowest live price is, NOT to the entry price: if the cheapest
 * land is 8¢, that 8¢ tier is the deepest deal, the next levels up are
 * shallower stages, and everything above the Nth level greys out.
 */
export const DEAL_STAGES = 4

/**
 * Map each of the cheapest `stages` distinct prices on the map to a DEALS
 * ramp position (0..1), cheapest → 1 (brightest, deepest deal) and the last
 * shown stage → `minLime` (dimmest but still visibly lit). Prices not in the
 * returned map are NOT deals and should grey out.
 *
 * The whole scale is anchored to the map's actual lowest live price, so it
 * always surfaces the cheapest land available — even once every pixel is
 * bought and bid up, the lowest of those prices is still "the deal." It
 * re-ranks itself for free as land decays or gets bought.
 *
 * Prices are the contract's discrete power-of-two levels (a pixel's saleCount
 * vs the global epoch), so distinct prices cleanly separate the stages: all
 * unsold land shares the lowest price, sold-once land the next, and so on.
 */
export function dealTierRamps(
  landPrices: bigint[],
  stages: number = DEAL_STAGES,
  minLime: number = DEAL_MIN_LIME,
): Map<bigint, number> {
  const ramps = new Map<bigint, number>()
  if (stages <= 0) return ramps

  // Distinct valid prices, cheapest first.
  const distinct = Array.from(new Set(landPrices))
    .filter(p => p > 0n)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  const dealTiers = distinct.slice(0, stages)
  // Evenly space the shown stages across [minLime, 1]; a single tier (early
  // game, everything at one price) is the brightest lime on its own.
  const span = Math.max(1, dealTiers.length - 1)
  dealTiers.forEach((price, idx) => {
    const t = 1 - idx / span
    ramps.set(price, minLime + (1 - minLime) * t)
  })
  return ramps
}
