import { compareLeaderEntries } from '@/lib/maps/leaderboards'
import type { Address, LeaderEntry } from '@/lib/maps/types'

/**
 * The CAMPAIGN board: who grew the most inside a campaign's window.
 *
 * Every other board is cumulative at a single block — LAND, EMPIRE and TYCOONS
 * all answer "who holds the most right now", so a one-day campaign re-crowns
 * whoever was already on top before it started. This one ranks movement inside
 * the window instead, so it changes from campaign to campaign.
 *
 * **This must rank identically to the payout snapshot** (celo-org/mondeto-admin#51).
 * The two are computed in different repos from the same subgraph, and #48 is
 * what happens when they drift: a player is shown one order and paid another.
 * The ordering itself is not reimplemented here — it goes through the shared
 * `compareLeaderEntries`, the same comparator every board already uses. Only
 * the value and the tie-break key are specific to this board.
 */

/** One wallet's `ownerMapStats` row, read at a pinned block. */
export interface OwnerStatsRow {
  address: string
  pixelCount: number
  /** Unix seconds of the wallet's most recent count-increasing buy. */
  lastGainAt: string
}

/**
 * Rank net pixel gain between two pinned blocks.
 *
 * `netGain = pixelCount(end) − pixelCount(start)`, with a wallet absent at the
 * start treated as 0 — a player who arrived mid-window is competing on the same
 * terms as everyone else.
 *
 * Net rather than gross, deliberately. Gross "pixels bought" rewards churn: a
 * pixel bought, raided and re-bought counts three times, and it is farmable by
 * cycling your own pixels. Net gain is also what a player watches move on the
 * board, so the number that pays matches the number they saw.
 *
 * **Only `netGain > 0` ranks.** That is the payout rule, and the board has to
 * match it. A wallet that broke even or went backwards is not ranked here — the
 * UI surfaces its standing separately rather than dropping it silently, because
 * a raided player *will* go negative and needs to see why.
 *
 * The tie-break is `lastGainAt` **at the end block**, which genuinely means
 * "reached their final gain first": `netGain > 0` implies at least one
 * count-increasing buy inside the window, so the end-block value always falls
 * inside it. It also arrives in rows we already fetch — no extra query.
 */
export function netGainEntries(
  startRows: readonly OwnerStatsRow[],
  endRows: readonly OwnerStatsRow[],
): LeaderEntry[] {
  const startCounts = new Map<string, number>()
  for (const row of startRows) {
    startCounts.set(row.address.toLowerCase(), row.pixelCount)
  }

  const entries: LeaderEntry[] = []
  for (const row of endRows) {
    const address = row.address.toLowerCase()
    const netGain = row.pixelCount - (startCounts.get(address) ?? 0)
    if (netGain <= 0) continue
    entries.push({
      address: address as Address,
      value: netGain,
      tiebreak: Number(row.lastGainAt),
    })
  }

  return entries.sort(compareLeaderEntries)
}

/**
 * One wallet's movement in the window, ranked or not.
 *
 * Separate from {@link netGainEntries} because the board only ranks winners
 * while the player still has to be told what happened to them. A wallet raided
 * down to −3 is absent from every entry above and would otherwise vanish from
 * the screen with no explanation, which reads as a bug rather than as the
 * mechanic working.
 *
 * **Net only, and that is a data limit rather than a choice.** Two pinned
 * `pixelCount` reads cannot be decomposed into gains and losses: a wallet
 * ending +12 may have bought twelve and lost none, or bought fifteen and been
 * raided for three, and the pair of counts is identical in both cases. The
 * gross split needs per-event history in the window — which is exactly the
 * `pixelsGained` / `pixelsLost` pair sketched in celo-org/mondeto#201. Until
 * that lands, the UI can show the movement but not its composition.
 */
export interface OwnStanding {
  /** `pixelCount(end) − pixelCount(start)`. Negative when raided. */
  netGain: number
  /** Whether this wallet ranks on the board (only positive movement does). */
  ranks: boolean
}

/**
 * A wallet's own movement across the window, whether or not it ranks.
 *
 * Derived from the same two pinned reads as the board, so the standing shown
 * to a player can never disagree with the ordering they are looking at.
 */
export function ownStanding(
  address: string,
  startRows: readonly OwnerStatsRow[],
  endRows: readonly OwnerStatsRow[],
): OwnStanding {
  const target = address.toLowerCase()
  const countAt = (rows: readonly OwnerStatsRow[]) =>
    rows.find((r) => r.address.toLowerCase() === target)?.pixelCount ?? 0

  const netGain = countAt(endRows) - countAt(startRows)
  return { netGain, ranks: netGain > 0 }
}
