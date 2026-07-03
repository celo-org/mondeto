import { ZERO_ADDRESS } from '@/constants/map'
import { MONDETO_ABI } from './contract'
import { isLand } from './landMask'
import { uint24ToHex } from './colorUtils'
import { pixelPrice, type PriceConfig } from './priceCalc'
import type { PixelView } from './mock'

/**
 * Decode packed pixel batch bytes from the contract into a PixelView
 * array of length width*height, indexed row-major.
 *
 * Each land pixel = 24 bytes: owner(20) + saleCount(1) + color(3). Water
 * pixels are skipped in the packed data — we iterate row-major and only
 * consume a record when `isLand` is true.
 */
export function decodePixelBatch(
  hexData: string,
  startX: number,
  startY: number,
  w: number,
  h: number,
  width: number,
  height: number,
  mask: Uint8Array,
): PixelView[] {
  const hex = hexData.startsWith('0x') ? hexData.slice(2) : hexData
  const totalPixels = width * height
  const result: PixelView[] = new Array(totalPixels)

  for (let i = 0; i < totalPixels; i++) {
    result[i] = {
      owner: ZERO_ADDRESS,
      saleCount: 0,
      currentPrice: 0n,
      color: '',
      label: '',
      url: '',
    }
  }

  let recordOffset = 0
  for (let row = startY; row < startY + h; row++) {
    for (let col = startX; col < startX + w; col++) {
      const pixelId = row * width + col
      if (!isLand(pixelId, mask)) continue

      const byteOffset = recordOffset * 48 // 24 bytes = 48 hex chars
      if (byteOffset + 48 > hex.length) break

      const ownerHex = '0x' + hex.slice(byteOffset, byteOffset + 40)
      const saleCount = parseInt(hex.slice(byteOffset + 40, byteOffset + 42), 16)
      const colorInt = parseInt(hex.slice(byteOffset + 42, byteOffset + 48), 16)

      result[pixelId] = {
        owner: ownerHex,
        saleCount,
        currentPrice: 0n,
        color: colorInt > 0 ? uint24ToHex(colorInt) : '',
        label: '',
        url: '',
      }

      recordOffset++
    }
  }

  return result
}

/**
 * Fetch all pixel data from the contract in one batch read.
 *
 * Callers MUST pass the deployed contract's address and its grid
 * dimensions + bundled mask, since each map's contract is sized
 * independently (world 170x100, africa 127x134, europe 160x107). Use
 * `useCurrentMapMeta()` to resolve the active map's dims.
 */
export async function fetchAllPixelsFromContract(
  readContract: (args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) => Promise<unknown>,
  contractAddress: `0x${string}`,
  width: number,
  height: number,
  mask: Uint8Array,
  /** Called with the map's on-chain pricing config once it's read — the
   *  same values used to compute each pixel's currentPrice below. Lets
   *  callers (usePixelMap) surface halvingTime/initialPrice to the UI
   *  without a second config() round-trip. */
  onConfig?: (config: PriceConfig) => void,
): Promise<PixelView[]> {
  const batchData = await readContract({
    address: contractAddress,
    abi: MONDETO_ABI,
    functionName: 'getPixelBatch',
    args: [0, 0, width, height],
  }) as `0x${string}`

  const pixels = decodePixelBatch(batchData, 0, 0, width, height, width, height, mask)

  // Read pricing params from the contract — the constants in
  // src/constants/map.ts were placeholders from the v2 migration and
  // don't match what's actually deployed. config() returns:
  //   [width, height, halvingTime, initialPrice, minPrice, halvingStartTimestamp, feeRate]
  //
  // halvingStartTimestamp is 0 until the first pixel sale; pixelPrice()
  // handles that case internally by treating elapsed as 0, which yields
  // initialPrice for every unowned pixel — the correct pre-launch display.
  try {
    const cfg = (await readContract({
      address: contractAddress,
      abi: MONDETO_ABI,
      functionName: 'config',
      args: [],
    })) as readonly [number, number, bigint, bigint, bigint, bigint, bigint]
    const [, , halvingTime, initialPrice, minPrice, halvingStartTimestamp] = cfg
    const now = BigInt(Math.floor(Date.now() / 1000))
    const priceCfg = { initialPrice, minPrice, halvingStartTimestamp, halvingTime }
    onConfig?.(priceCfg)
    for (const px of pixels) {
      px.currentPrice = pixelPrice(px.saleCount, now, priceCfg)
    }
  } catch (e) {
    console.warn('Failed to read pricing config from contract:', e)
  }

  return pixels
}
