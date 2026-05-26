import { LAND_MASK as STATIC_MASK } from '@/data/landMask'
import { WIDTH, TOTAL_PIXELS } from '@/constants/map'

// Live mask from contract (populated by fetchLandMaskFromContract)
let liveMask: Uint8Array | null = null

export function isLand(id: number): boolean {
  const mask = liveMask ?? STATIC_MASK
  return mask[id] === 1
}

export function isLandXY(x: number, y: number): boolean {
  const mask = liveMask ?? STATIC_MASK
  return mask[y * WIDTH + x] === 1
}

/**
 * Fetch the land mask from the deployed contract.
 * Reads all 67 uint256 words via landMask(i) and decodes the bit-packed format.
 * Call once at app startup. Falls back to static mask on failure.
 */
export async function fetchLandMaskFromContract(
  readContract: (args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) => Promise<unknown>,
  contractAddress: `0x${string}`,
  abi: readonly unknown[],
): Promise<void> {
  try {
    const wordCount = Math.ceil(TOTAL_PIXELS / 256)
    const mask = new Uint8Array(TOTAL_PIXELS)

    // Try getLandMask() first (single call), fall back to per-word reads
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

    // Decode bit-packed words into per-pixel boolean array
    for (let pixelId = 0; pixelId < TOTAL_PIXELS; pixelId++) {
      const wordIdx = Math.floor(pixelId / 256)
      const bitIdx = pixelId % 256
      if (wordIdx < words.length && (words[wordIdx] >> BigInt(bitIdx)) & 1n) {
        mask[pixelId] = 1
      }
    }

    liveMask = mask
  } catch (e) {
    console.warn('Failed to fetch land mask from contract, using static fallback:', e)
  }
}
