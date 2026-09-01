import { fallbackReadClient } from '@/lib/chain'

/**
 * Find the block a campaign window opened or closed at.
 *
 * A campaign is scheduled in wall-clock time (`startsAt` / `endsAt`), but the
 * subgraph can only be pinned to a block. Something has to translate, and it
 * has to be exact rather than estimated: the block chosen here is what the
 * board ranks from and, in the payout's case, what money is paid against.
 *
 * Celo's ~1s block time makes a linear estimate tempting, but block times drift
 * and a window boundary landing a few hundred blocks off silently changes who
 * is in the window. `lib/purchaseLogs.ts` estimates for a *scan start*, where
 * being early is harmless — that trade doesn't hold here.
 *
 * Server-side only. This is ~25-30 sequential RPC round trips; it belongs
 * behind a route with room in its `maxDuration`, never in a client component.
 */

/**
 * The highest block whose timestamp is at or before `timestampSec`.
 *
 * Anchored on "at or before" so a window boundary can never include a block
 * that hadn't happened yet: the closing read sees exactly the state as of the
 * deadline, and the opening read sees the state the instant it began.
 *
 * Returns `0n` when the target predates the chain's first block, and the head
 * block when it is in the future — both saturate rather than throwing, so a
 * campaign scheduled with a sloppy boundary still produces a usable window.
 */
export async function blockAtTimestamp(timestampSec: bigint): Promise<bigint> {
  const head = await fallbackReadClient.getBlock({ blockTag: 'latest' })
  if (timestampSec >= head.timestamp) return head.number

  const first = await fallbackReadClient.getBlock({ blockNumber: 0n })
  if (timestampSec <= first.timestamp) return 0n

  // Invariant: lo is at-or-before the target, hi is after it. Every iteration
  // halves the gap, so this terminates in ~log2(head) ≈ 25-30 reads on Celo.
  let lo = 0n
  let hi = head.number

  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n
    const block = await fallbackReadClient.getBlock({ blockNumber: mid })
    if (block.timestamp <= timestampSec) lo = mid
    else hi = mid
  }

  return lo
}
