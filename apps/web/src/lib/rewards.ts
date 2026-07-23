/**
 * Per-wallet campaign rewards, resolved at runtime — never committed to source.
 *
 * Source of truth is the Vercel Edge Config key `rewards`, written by the
 * private admin repo when a campaign pays out. Keeping it in Edge Config (like
 * the `campaign` key in lib/campaign.ts) means winnings can be published
 * instantly without a deploy, and payout amounts / winner lists never appear
 * in the public repo.
 *
 * Shape — a map of lowercased wallet address to that wallet's reward list:
 *   {
 *     "0xabc...": [
 *       { "campaignId": "launch-week-1", "amountUsd": "5", "board": "LAND", "rank": 3 }
 *     ]
 *   }
 *
 * The app only READS this. Until the key is set, every wallet resolves to an
 * empty list and the announcement UI renders nothing.
 */

export interface RewardEntry {
  /** Campaign the payout came from (also the session-dismissal key). */
  campaignId: string
  /** Payout in USD, as a display string (e.g. "5", "12.50"). */
  amountUsd: string
  /** Optional board the reward was won on: 'LAND' | 'EMPIRE' | 'TYCOONS'. */
  board?: string
  /** Optional final rank on that board. */
  rank?: number
  /** When the payout settled, ISO-8601 UTC. Optional — older entries (written
   *  before the admin repo stamped it) omit it, in which case recency falls
   *  back to array order. Written by the admin repo alongside the payout. */
  paidAt?: string
}

function coerceEntry(value: unknown): RewardEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.campaignId !== 'string' || v.campaignId === '') return null
  // amountUsd may arrive as a number or string in Edge Config — normalize.
  let amountUsd: string
  if (typeof v.amountUsd === 'string' && v.amountUsd !== '') amountUsd = v.amountUsd
  else if (typeof v.amountUsd === 'number' && Number.isFinite(v.amountUsd)) {
    amountUsd = String(v.amountUsd)
  } else return null
  const entry: RewardEntry = { campaignId: v.campaignId, amountUsd }
  if (typeof v.board === 'string' && v.board !== '') entry.board = v.board
  if (typeof v.rank === 'number' && Number.isInteger(v.rank) && v.rank > 0) {
    entry.rank = v.rank
  }
  if (typeof v.paidAt === 'string' && v.paidAt !== '') entry.paidAt = v.paidAt
  return entry
}

/**
 * The single most recent payout from a wallet's reward list — what the
 * announcement headlines (never a sum of several wins).
 *
 * Recency prefers the explicit `paidAt` timestamp (ISO-8601) in descending
 * order; an entry that carries a parseable timestamp always beats one that
 * doesn't. When neither entry is timestamped (or two share the same instant),
 * we fall back to array order and treat the later index as newer — the admin
 * repo appends new campaigns last, so the last element is the newest win.
 *
 * Returns null for an empty list.
 */
export function latestReward(rewards: RewardEntry[]): RewardEntry | null {
  if (rewards.length === 0) return null
  let best = rewards[0]
  let bestIdx = 0
  for (let i = 1; i < rewards.length; i++) {
    const r = rewards[i]
    const rt = Date.parse(r.paidAt ?? '')
    const bt = Date.parse(best.paidAt ?? '')
    const rHas = Number.isFinite(rt)
    const bHas = Number.isFinite(bt)
    let newer: boolean
    if (rHas && bHas) newer = rt > bt
    else if (rHas) newer = true
    else if (bHas) newer = false
    else newer = i > bestIdx // neither timestamped → later index wins
    if (newer) {
      best = r
      bestIdx = i
    }
  }
  return best
}

function coerceRewards(value: unknown, address: string): RewardEntry[] {
  if (typeof value !== 'object' || value === null) return []
  const table = value as Record<string, unknown>
  const list = table[address.toLowerCase()]
  if (!Array.isArray(list)) return []
  const out: RewardEntry[] = []
  for (const item of list) {
    const entry = coerceEntry(item)
    if (entry) out.push(entry)
  }
  return out
}

/**
 * Server-side resolve of a wallet's rewards. Edge Config only — no env or
 * hardcoded fallback, so an unset key simply means "no rewards". Never throws.
 */
export async function readRewardsServer(address: string): Promise<RewardEntry[]> {
  if (!process.env.EDGE_CONFIG) return []
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return []
  try {
    const { get } = await import('@vercel/edge-config')
    const value = await get('rewards')
    return coerceRewards(value, address)
  } catch {
    return []
  }
}
