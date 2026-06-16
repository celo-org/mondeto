/**
 * Adapter — bridge the existing on-chain `PixelView[]` model
 * (one flat array indexed by pixel id) to the pure-function
 * `MapSnapshot` model the leaderboards module consumes.
 *
 * The leaderboards module is dependency-free and price-agnostic; it
 * treats `currentPrice` as a `number` so sorting and tie-breaking work
 * naturally. Raw on-chain prices are USDT bigints with 6 decimals, so
 * we scale them to USDT units (1e6) here. Magnitude alone matters for
 * ranking, so a float is fine and avoids dragging bigint into pure code.
 */

import { ZERO_ADDRESS } from '@/constants/map'
import { isLand } from '@/lib/landMask'
import type { PixelView } from '@/lib/mock'
import type { MapId, MapSnapshot, PixelState } from './types'

const USDT_DECIMALS = 1_000_000n // 6 decimals

function priceToNumber(raw: bigint): number {
  // Whole units + fractional micros => float. Precision loss past ~9
  // quadrillion USDT is irrelevant for ranking.
  const whole = raw / USDT_DECIMALS
  const frac = Number(raw % USDT_DECIMALS) / 1_000_000
  return Number(whole) + frac
}

export function pixelViewToMapSnapshot(
  pixelData: PixelView[],
  mapId: MapId,
  open: boolean,
  width: number,
  mask: Uint8Array,
): MapSnapshot {
  const pixels: PixelState[] = new Array(pixelData.length)

  for (let id = 0; id < pixelData.length; id++) {
    const px = pixelData[id]
    const x = id % width
    const y = Math.floor(id / width)
    const ownerRaw = px?.owner
    const owner =
      !ownerRaw || ownerRaw === ZERO_ADDRESS
        ? null
        : ownerRaw.toLowerCase()
    pixels[id] = {
      id,
      x,
      y,
      owner,
      currentPrice: priceToNumber(px?.currentPrice ?? 0n),
      isLand: isLand(id, mask),
    }
  }

  return {
    meta: { id: mapId, open },
    pixels,
  }
}
