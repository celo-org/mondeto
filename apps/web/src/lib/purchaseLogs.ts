import { parseAbiItem } from 'viem'
import { fallbackReadClient } from '@/lib/chain'
import { MONDETO_ABI } from '@/lib/contract'

/**
 * Shared server-side scanner for `PixelsPurchased` history.
 *
 * Both P&L (/api/pnl) and analytics (/api/analytics) reconstruct their numbers
 * from the full purchase-event log, and both were silently returning zero
 * because they scanned in 50k-block windows: public Celo RPCs (Forno, dRPC)
 * REJECT `eth_getLogs` windows larger than ~5k blocks, so every chunk failed.
 * Keeping the chunk size + parallelism in one place fixes that gotcha once and
 * stops the two callers drifting apart.
 *
 * Runs on Vercel's network (never the phone) so MiniPay's constrained RPC
 * isn't in the path. Lightweight live-read stand-in for the Envio indexer.
 */

// Multi-token PixelsPurchased — `token` is the second indexed parameter as of
// contract v2.
export const PURCHASE_EVENT = parseAbiItem(
  'event PixelsPurchased(address indexed buyer, address indexed token, uint256[] ids, uint256 totalCost)',
)

// Public Celo RPCs reject eth_getLogs windows larger than ~5k blocks (verified:
// 50k and 10k fail, 5k succeeds). Lean on parallelism to keep the many-chunk
// scan fast.
const CHUNK_BLOCKS = 5_000n
const MAX_PARALLEL = 20

export type PurchaseLog = Awaited<
  ReturnType<typeof fallbackReadClient.getLogs<typeof PURCHASE_EVENT>>
>[number]

export interface PurchaseScan {
  logs: PurchaseLog[]
  failedChunks: number
  totalChunks: number
}

/**
 * Fetch every `PixelsPurchased` log for `address` in [fromBlock, toBlock],
 * chunked to stay within the RPC window limit. A failed chunk is skipped (its
 * count is returned) rather than failing the whole scan, so one flaky request
 * doesn't zero the result.
 */
export async function scanPurchaseLogs(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<PurchaseScan> {
  const ranges: Array<{ from: bigint; to: bigint }> = []
  for (let start = fromBlock; start <= toBlock; start += CHUNK_BLOCKS) {
    const end = start + CHUNK_BLOCKS - 1n > toBlock ? toBlock : start + CHUNK_BLOCKS - 1n
    ranges.push({ from: start, to: end })
  }

  const logs: PurchaseLog[] = []
  let failedChunks = 0
  for (let i = 0; i < ranges.length; i += MAX_PARALLEL) {
    const batch = ranges.slice(i, i + MAX_PARALLEL)
    const results = await Promise.allSettled(
      batch.map((r) =>
        fallbackReadClient.getLogs({
          address,
          event: PURCHASE_EVENT,
          fromBlock: r.from,
          toBlock: r.to,
        }),
      ),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') logs.push(...r.value)
      else failedChunks++
    }
  }

  return { logs, failedChunks, totalChunks: ranges.length }
}

// Normalize a token amount to 6 decimals (the unit `formatUSDT` renders), so
// mixed-token totals (e18 USDm vs e6 USDC) sum in one magnitude.
export function toMicrocents(cost: bigint, decimals: number): bigint {
  if (decimals === 6) return cost
  if (decimals > 6) return cost / 10n ** BigInt(decimals - 6)
  return cost * 10n ** BigInt(6 - decimals)
}

// Safety margin when estimating the first-sale block from the contract clock.
// Celo L2 is ~1s/block, so seconds since the first sale ≈ blocks; overestimating
// how far back to scan is safe.
const SAFETY_BUFFER_BLOCKS = 100_000n

/**
 * Estimate the block to start scanning from so a scan covers the whole purchase
 * history without walking back to genesis. Uses the contract's own
 * `halvingStartTimestamp` (set on the first non-empty buy). Returns `null` when
 * the map has never been bought — nothing to scan.
 */
export async function estimateHistoryFromBlock(
  address: `0x${string}`,
  currentBlock: bigint,
): Promise<bigint | null> {
  const [halvingStartTs, head] = await Promise.all([
    fallbackReadClient.readContract({
      address,
      abi: MONDETO_ABI,
      functionName: 'halvingStartTimestamp',
    }) as Promise<bigint>,
    fallbackReadClient.getBlock({ blockNumber: currentBlock }),
  ])
  if (halvingStartTs === 0n) return null
  const secondsSinceStart = head.timestamp - halvingStartTs
  const estimatedBlocks = secondsSinceStart + SAFETY_BUFFER_BLOCKS
  return currentBlock > estimatedBlocks ? currentBlock - estimatedBlocks : 0n
}

export interface NormalizedPurchaseScan extends PurchaseScan {
  // Payment-token address (lowercase) → its ERC-20 decimals, for `toMicrocents`.
  tokenDecimals: Map<string, number>
}

/**
 * Scan purchase logs for `address`, resolve each payment token's decimals, and
 * return the logs **sorted chronologically** (block, then logIndex) so an
 * ownership replay reflects real purchase order. Shared by /api/pnl and
 * /api/analytics — both reconstruct their numbers by replaying this history.
 */
export async function scanNormalizedPurchases(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<NormalizedPurchaseScan> {
  const { logs, failedChunks, totalChunks } = await scanPurchaseLogs(address, fromBlock, toBlock)

  // Chronological order so a running owner-of map reflects real purchase order.
  logs.sort((a, b) => {
    const ab = a.blockNumber ?? 0n
    const bb = b.blockNumber ?? 0n
    if (ab !== bb) return ab < bb ? -1 : 1
    return (a.logIndex ?? 0) - (b.logIndex ?? 0)
  })

  // Look up each payment token's decimals for normalization.
  const tokenDecimals = new Map<string, number>()
  const uniqueTokens = new Set<string>()
  for (const log of logs) uniqueTokens.add((log.args.token as string).toLowerCase())
  await Promise.all(
    [...uniqueTokens].map(async (token) => {
      try {
        const [, dec] = (await fallbackReadClient.readContract({
          address,
          abi: MONDETO_ABI,
          functionName: 'tokenConfig',
          args: [token as `0x${string}`],
        })) as readonly [boolean, number]
        tokenDecimals.set(token, Number(dec))
      } catch {
        tokenDecimals.set(token, 6)
      }
    }),
  )

  return { logs, tokenDecimals, failedChunks, totalChunks }
}
