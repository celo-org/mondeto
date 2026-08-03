/**
 * Mondeto — per-map leaderboards
 *
 * Three boards per map (auto-assign model => leaderboards must be per-map):
 *   1. mostPixels            — count of land pixels owned
 *   2. biggestConnectedArea  — largest single contiguous block owned
 *                              (4-way orthogonal adjacency)
 *   3. mostExpensivePixel    — highest-priced single pixel owned
 *
 * Designed to extend to campaign-scoped boards later (pass a pre-filtered
 * pixel subset, e.g. "pixels inside the France region", and these same
 * functions produce the campaign leaderboard).
 */

import type { Address, LeaderEntry, MapSnapshot, PixelState } from "./types";

/** Internal board keys. Re-exported from `hooks/useLeaderboard` for callers. */
export type LeaderboardTab = "AREA" | "EMPIRE" | "TYCOONS";

/**
 * The board names players actually see. Lives here, in a pure lib, so server
 * components (the FAQ) and tests can reach it without importing a
 * `'use client'` module.
 *
 * Note AREA renders as "LAND" — the key is internal and must never appear in
 * player-facing copy. The FAQ said "AREA" for months because this mapping was
 * trapped inside a client component; `__tests__/app/faq.test.ts` now guards it.
 */
export const BOARD_LABELS: Record<LeaderboardTab, string> = {
  AREA: "LAND",
  EMPIRE: "EMPIRE",
  TYCOONS: "TYCOONS",
};

function ownedLandPixels(map: MapSnapshot): PixelState[] {
  return map.pixels.filter((p) => p.isLand && p.owner !== null);
}

/**
 * Board comparator. Value descending; on a tie, the entry that reached that
 * value FIRST (smaller `tiebreak` / lastGainAt) ranks higher; finally address
 * ascending as a deterministic fallback (and for boards with no time signal).
 */
export function compareLeaderEntries(a: LeaderEntry, b: LeaderEntry): number {
  if (b.value !== a.value) return b.value - a.value;
  const at = a.tiebreak;
  const bt = b.tiebreak;
  if (at != null && bt != null && at !== bt) return at - bt;
  if (at != null && bt == null) return -1;
  if (at == null && bt != null) return 1;
  return a.address < b.address ? -1 : 1;
}

function rank(
  values: Map<Address, number>,
  limit: number,
  tiebreaks?: Map<Address, number | undefined>
): LeaderEntry[] {
  return [...values.entries()]
    .map(([address, value]) => ({ address, value, tiebreak: tiebreaks?.get(address) }))
    .sort(compareLeaderEntries)
    .slice(0, limit);
}

/**
 * Board 1 — who owns the most pixels on this map. Tie-break (when pixels carry
 * `acquiredAt`): the wallet whose most-recent still-owned acquisition is earliest
 * — i.e. who reached their current count first.
 */
export function leaderboardMostPixels(
  map: MapSnapshot,
  limit = 10
): LeaderEntry[] {
  const counts = new Map<Address, number>();
  const ts = new Map<Address, number | undefined>();
  for (const p of ownedLandPixels(map)) {
    const owner = p.owner as Address;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
    if (p.acquiredAt != null) {
      ts.set(owner, Math.max(ts.get(owner) ?? 0, p.acquiredAt));
    }
  }
  return rank(counts, limit, ts);
}

/**
 * Board 3 — whose single most expensive pixel is the priciest. Tie-break (when
 * pixels carry `acquiredAt`): who acquired that priciest pixel first.
 */
export function leaderboardMostExpensivePixel(
  map: MapSnapshot,
  limit = 10
): LeaderEntry[] {
  const best = new Map<Address, number>();
  const bestTs = new Map<Address, number | undefined>();
  for (const p of ownedLandPixels(map)) {
    const owner = p.owner as Address;
    if (p.currentPrice > (best.get(owner) ?? -Infinity)) {
      best.set(owner, p.currentPrice);
      bestTs.set(owner, p.acquiredAt);
    }
  }
  return rank(best, limit, bestTs);
}

/**
 * Board 2 — largest contiguous block of land owned by a single wallet.
 *
 * Adjacency is 4-way (up/down/left/right). Diagonals do NOT connect — this
 * matches how players intuitively read a "connected territory" on a grid and
 * keeps the metric defensible. A wallet's score is its single biggest
 * connected component, not its total pixel count (that's board 1).
 */
export function leaderboardBiggestConnectedArea(
  map: MapSnapshot,
  limit = 10
): LeaderEntry[] {
  const owned = ownedLandPixels(map);

  // (x,y) -> owner, for O(1) neighbour lookup; plus (x,y) -> acquiredAt.
  const grid = new Map<string, Address>();
  const tsGrid = new Map<string, number>();
  const key = (x: number, y: number) => `${x}:${y}`;
  for (const p of owned) {
    grid.set(key(p.x, p.y), p.owner as Address);
    if (p.acquiredAt != null) tsGrid.set(key(p.x, p.y), p.acquiredAt);
  }

  const visited = new Set<string>();
  const bestComponent = new Map<Address, number>();
  // Tie-break: when a wallet's biggest block reached its CURRENT size — i.e. the
  // most recent acquisition among the pixels that make it up (earlier wins).
  const bestTs = new Map<Address, number | undefined>();

  for (const p of owned) {
    const startKey = key(p.x, p.y);
    if (visited.has(startKey)) continue;

    const owner = p.owner as Address;
    // BFS over same-owner orthogonal neighbours, tracking the newest member.
    let size = 0;
    let compTs = 0;
    let compHasTs = false;
    const queue: Array<[number, number]> = [[p.x, p.y]];
    visited.add(startKey);

    while (queue.length > 0) {
      const [cx, cy] = queue.shift() as [number, number];
      size += 1;
      const ct = tsGrid.get(key(cx, cy));
      if (ct != null) {
        compTs = Math.max(compTs, ct);
        compHasTs = true;
      }
      const neighbours: Array<[number, number]> = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];
      for (const [nx, ny] of neighbours) {
        const nk = key(nx, ny);
        if (visited.has(nk)) continue;
        if (grid.get(nk) === owner) {
          visited.add(nk);
          queue.push([nx, ny]);
        }
      }
    }

    if (size > (bestComponent.get(owner) ?? 0)) {
      bestComponent.set(owner, size);
      bestTs.set(owner, compHasTs ? compTs : undefined);
    }
  }

  return rank(bestComponent, limit, bestTs);
}

/* ------------------------------------------------------------------ *
 * Rank proximity — where a player sits on a board and how far the next
 * rank up is. Powers the "N PX FROM #K" nudges on /ranks and the profile
 * RANK card.
 * ------------------------------------------------------------------ */

export interface RankGap {
  /** 1-based position of the player on the board. */
  rank: number;
  /** The player's raw board value (px count, block size, price, share). */
  value: number;
  /**
   * How much MORE the entry one rank above holds (their value minus the
   * player's). `null` for rank 1 — nobody is above. Can be 0 when the two
   * are value-tied and only the deterministic address tiebreak separates
   * them.
   */
  gap: number | null;
}

/**
 * Locate `address` on a ranked board and measure the distance to the rank
 * above. Address comparison is case-insensitive (boards may carry
 * checksummed or lowercase addresses). Returns `null` when the player is
 * not on the board at all.
 */
export function rankGap(
  entries: LeaderEntry[],
  address: string
): RankGap | null {
  const target = address.toLowerCase();
  const idx = entries.findIndex((e) => e.address.toLowerCase() === target);
  if (idx < 0) return null;
  return {
    rank: idx + 1,
    value: entries[idx].value,
    gap: idx === 0 ? null : entries[idx - 1].value - entries[idx].value,
  };
}

/** Convenience: all three boards for a map in one call. */
export function allLeaderboards(map: MapSnapshot, limit = 10) {
  return {
    mostPixels: leaderboardMostPixels(map, limit),
    biggestConnectedArea: leaderboardBiggestConnectedArea(map, limit),
    mostExpensivePixel: leaderboardMostExpensivePixel(map, limit),
  };
}

/* ------------------------------------------------------------------ *
 * GLOBAL leaderboards — same three metrics, aggregated across maps.
 *
 * Connectivity NEVER crosses maps (each map is a separate canvas), so the
 * global "biggest connected area" is each player's single best component on
 * ANY one map — not the sum of their territories across maps.
 * ------------------------------------------------------------------ */

function mergeMax(boards: LeaderEntry[][], limit: number): LeaderEntry[] {
  const best = new Map<Address, number>();
  const bestTs = new Map<Address, number | undefined>();
  for (const board of boards) {
    for (const e of board) {
      if (e.value > (best.get(e.address) ?? -Infinity)) {
        best.set(e.address, e.value);
        bestTs.set(e.address, e.tiebreak); // carry the winning board's tie-break
      }
    }
  }
  return rank(best, limit, bestTs);
}

function mergeSum(boards: LeaderEntry[][], limit: number): LeaderEntry[] {
  const total = new Map<Address, number>();
  const ts = new Map<Address, number | undefined>();
  for (const board of boards) {
    for (const e of board) {
      total.set(e.address, (total.get(e.address) ?? 0) + e.value);
      if (e.tiebreak != null) ts.set(e.address, Math.max(ts.get(e.address) ?? 0, e.tiebreak));
    }
  }
  return rank(total, limit, ts);
}

/**
 * Global board 1 — total land pixels owned across every map.
 *
 * @deprecated Raw pixel sums are unfair across different-sized maps (Africa
 * has ~8,800 claimable land pixels, World ~5,600), so this just rewards
 * whoever plays the biggest map. The UI ranks the global AREA board with
 * `globalTerritoryShare` instead. Kept for any caller that still wants the
 * raw cross-map count.
 */
export function globalMostPixels(maps: MapSnapshot[], limit = 10): LeaderEntry[] {
  // Per-map full boards (limit large enough to not truncate before summing).
  const per = maps.map((m) => leaderboardMostPixels(m, Number.MAX_SAFE_INTEGER));
  return mergeSum(per, limit);
}

/**
 * Global AREA board (normalized) — sum of per-map ownership fractions.
 *
 * For each map a wallet's contribution is `ownedLand / claimableLand`, so a
 * map's size cancels out: owning 10% of the World map and 10% of Africa both
 * count as 0.10. Summing the fractions across maps gives a size-independent
 * "territory dominance" score (0..N for N maps). Render the value as a
 * percentage. Claimable land is derived from the snapshot itself
 * (`pixels.filter(isLand)`), matching `getMaskData(slug).landCount`.
 *
 * This is the fair cross-map answer to the normalization problem — a small
 * but dominant holding beats a larger raw count on a bigger board.
 */
export function globalTerritoryShare(
  maps: MapSnapshot[],
  limit = 10
): LeaderEntry[] {
  const share = new Map<Address, number>();
  for (const m of maps) {
    const land = m.pixels.filter((p) => p.isLand);
    const total = land.length;
    if (total === 0) continue;
    const counts = new Map<Address, number>();
    for (const p of land) {
      if (p.owner !== null) {
        counts.set(p.owner, (counts.get(p.owner) ?? 0) + 1);
      }
    }
    for (const [addr, c] of counts) {
      share.set(addr, (share.get(addr) ?? 0) + c / total);
    }
  }
  return rank(share, limit);
}

/** Global board 3 — single most expensive pixel owned anywhere. */
export function globalMostExpensivePixel(
  maps: MapSnapshot[],
  limit = 10
): LeaderEntry[] {
  const per = maps.map((m) =>
    leaderboardMostExpensivePixel(m, Number.MAX_SAFE_INTEGER)
  );
  return mergeMax(per, limit);
}

/** Global board 2 — biggest single contiguous block on ANY one map. */
export function globalBiggestConnectedArea(
  maps: MapSnapshot[],
  limit = 10
): LeaderEntry[] {
  const per = maps.map((m) =>
    leaderboardBiggestConnectedArea(m, Number.MAX_SAFE_INTEGER)
  );
  return mergeMax(per, limit);
}

/** Convenience: all three global boards in one call. AREA is the raw total
 *  pixels owned across all maps (an intuitive count, matching the local board
 *  and the EMPIRE board) rather than the size-normalized territory share. */
export function allGlobalLeaderboards(maps: MapSnapshot[], limit = 10) {
  return {
    mostPixels: globalMostPixels(maps, limit),
    biggestConnectedArea: globalBiggestConnectedArea(maps, limit),
    mostExpensivePixel: globalMostExpensivePixel(maps, limit),
  };
}
