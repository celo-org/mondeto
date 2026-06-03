/**
 * Client-side price calculation matching the Mondeto smart contract.
 * Uses BigInt for precision — prices can exceed 64-bit integers.
 */

const MAX_UINT256 = (1n << 256n) - 1n

export interface PriceConfig {
  initialPrice: bigint
  minPrice: bigint
  halvingStartTimestamp: bigint
  halvingTime: bigint
}

/**
 * Compute the current price of a pixel given its saleCount and the current block timestamp.
 *
 * `halvingStartTimestamp === 0n` means the first sale hasn't happened yet —
 * the halving clock hasn't started, so every pixel sits at `initialPrice`.
 */
export function pixelPrice(
  saleCount: number,
  blockTimestamp: bigint,
  config: PriceConfig,
): bigint {
  const elapsed =
    config.halvingStartTimestamp === 0n
      ? 0n
      : blockTimestamp - config.halvingStartTimestamp
  const epochStart = elapsed / config.halvingTime
  const remainder = elapsed % config.halvingTime

  const pStart = discretePrice(saleCount, epochStart, config.initialPrice, config.minPrice)
  if (remainder === 0n) return pStart
  if (pStart === MAX_UINT256) return MAX_UINT256

  const pEnd = discretePrice(saleCount, epochStart + 1n, config.initialPrice, config.minPrice)

  // Linear interpolation between adjacent power-of-2 price levels
  return pStart - (pStart - pEnd) * remainder / config.halvingTime
}

/**
 * Discrete price at a specific epoch boundary.
 * price = initialPrice << (saleCount - epoch)   when saleCount >= epoch
 * price = max(initialPrice >> (epoch - saleCount), minPrice)   otherwise
 */
export function discretePrice(
  saleCount: number,
  epoch: bigint,
  initialPrice: bigint,
  minPrice: bigint,
): bigint {
  const sc = BigInt(saleCount)
  if (sc >= epoch) {
    const shift = sc - epoch
    if (shift >= 128n) return MAX_UINT256
    return initialPrice << shift
  } else {
    const shift = epoch - sc
    if (shift >= 128n) return minPrice
    const p = initialPrice >> shift
    return p < minPrice ? minPrice : p
  }
}

/**
 * Format a USDT micro-unit amount to a human-readable string.
 * e.g. 100000n → "0.10", 1500000n → "1.50"
 */
export function formatUSDTPrice(amount: bigint, decimals = 6): string {
  const whole = amount / BigInt(10 ** decimals)
  const frac = amount % BigInt(10 ** decimals)
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2)
  return `${whole}.${fracStr}`
}
