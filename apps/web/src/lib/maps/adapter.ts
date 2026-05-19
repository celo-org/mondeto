/**
 * Mondeto — adapter from the on-chain PixelView[] shape to the pure
 * MapSnapshot type used by the maps module.
 *
 * The contract returns a flat array indexed by pixel id (y * WIDTH + x), with
 * the owner stored as a 0x… string and the current price as a bigint of USDT
 * micro-units (6 decimals). The maps module is dependency-free and uses
 * `number` for prices and `null` for unowned. This adapter does the conversion
 * once at the boundary so hooks downstream can stay pure.
 */

import { HEIGHT, WIDTH, ZERO_ADDRESS } from '@/constants/map'
import { isLand } from '@/lib/landMask'
import type { PixelView } from '@/lib/mock'
import type { MapId, MapSnapshot, PixelState } from './types'

export function pixelViewToMapSnapshot(
  pixelData: PixelView[],
  mapId: MapId,
  open: boolean,
): MapSnapshot {
  const pixels: PixelState[] = new Array(pixelData.length)
  for (let id = 0; id < pixelData.length; id++) {
    const px = pixelData[id]
    const x = id % WIDTH
    const y = Math.floor(id / WIDTH)
    const ownerRaw = px.owner
    const owner =
      !ownerRaw || ownerRaw.toLowerCase() === ZERO_ADDRESS ? null : ownerRaw
    pixels[id] = {
      id,
      x,
      y,
      owner,
      // bigint micro-USDT -> number. Safe: max ~$10 * 1e6 = 1e7, well within
      // Number.MAX_SAFE_INTEGER. Rankings only need ordering, not arithmetic.
      currentPrice: Number(px.currentPrice),
      isLand: y < HEIGHT && x < WIDTH ? isLand(id) : false,
    }
  }
  return {
    meta: { id: mapId, open },
    pixels,
  }
}
