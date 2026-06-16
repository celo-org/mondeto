/**
 * Per-map land-mask lookups.
 *
 * `isLand(id, mask)` checks the bit-packed Uint8Array (1 = land, 0 = water)
 * returned by `getMaskData(slug)` in `@/lib/maps/masks`. Components should
 * source the mask from `useCurrentMapMeta()` instead of importing a global.
 *
 * `fetchLandMaskFromContract` is kept for the dev/test-contract page,
 * which reads the on-chain mask for an arbitrary deployed contract to
 * cross-check the bundled mask against the deployed bytes.
 */

export function isLand(id: number, mask: Uint8Array): boolean {
  return mask[id] === 1
}

export function isLandXY(
  x: number,
  y: number,
  width: number,
  mask: Uint8Array,
): boolean {
  return mask[y * width + x] === 1
}

/**
 * Fetch the land mask from a deployed contract. Returns the unpacked
 * Uint8Array. Falls back to throwing on failure — callers can decide
 * whether to use the bundled mask instead.
 */
export async function fetchLandMaskFromContract(
  readContract: (args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) => Promise<unknown>,
  contractAddress: `0x${string}`,
  abi: readonly unknown[],
  width: number,
  height: number,
): Promise<Uint8Array> {
  const totalPixels = width * height
  const wordCount = Math.ceil(totalPixels / 256)
  const mask = new Uint8Array(totalPixels)

  let words: bigint[]
  try {
    const result = await readContract({
      address: contractAddress,
      abi,
      functionName: 'getLandMask',
      args: [],
    }) as bigint[]
    words = result
  } catch {
    const promises = Array.from({ length: wordCount }, (_, i) =>
      readContract({
        address: contractAddress,
        abi,
        functionName: 'landMask',
        args: [BigInt(i)],
      }) as Promise<bigint>
    )
    words = await Promise.all(promises)
  }

  for (let pixelId = 0; pixelId < totalPixels; pixelId++) {
    const wordIdx = Math.floor(pixelId / 256)
    const bitIdx = pixelId % 256
    if (wordIdx < words.length && (words[wordIdx] >> BigInt(bitIdx)) & 1n) {
      mask[pixelId] = 1
    }
  }
  return mask
}
