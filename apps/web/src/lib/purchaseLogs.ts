import { parseAbiItem } from 'viem'
import { fallbackReadClient } from '@/lib/chain'

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
