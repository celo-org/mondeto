import { describe, it, expect } from "vitest";
import {
  leaderboardMostPixels,
  leaderboardMostExpensivePixel,
  leaderboardBiggestConnectedArea,
  allLeaderboards,
} from "@/lib/maps/leaderboards";
import type { MapSnapshot, PixelState } from "@/lib/maps/types";

function px(
  x: number,
  y: number,
  owner: string | null,
  price = 1,
  isLand = true
): PixelState {
  return { id: y * 1000 + x, x, y, owner, currentPrice: price, isLand };
}

function map(pixels: PixelState[]): MapSnapshot {
  return { meta: { id: 0, open: true }, pixels };
}

describe("leaderboardMostPixels", () => {
  it("counts owned land pixels and ranks desc", () => {
    const m = map([
      px(0, 0, "0xA"),
      px(1, 0, "0xA"),
      px(2, 0, "0xB"),
      px(3, 0, null), // unowned
      px(4, 0, "0xB", 1, false), // water, ignored
    ]);
    expect(leaderboardMostPixels(m)).toEqual([
      { address: "0xA", value: 2 },
      { address: "0xB", value: 1 },
    ]);
  });

  it("breaks value ties by address ascending (deterministic)", () => {
    const m = map([px(0, 0, "0xB"), px(1, 0, "0xA")]);
    expect(leaderboardMostPixels(m).map((e) => e.address)).toEqual([
      "0xA",
      "0xB",
    ]);
  });

  it("respects the limit", () => {
    const m = map([
      px(0, 0, "0xA"),
      px(1, 0, "0xA"),
      px(2, 0, "0xB"),
      px(3, 0, "0xC"),
    ]);
    expect(leaderboardMostPixels(m, 1)).toEqual([{ address: "0xA", value: 2 }]);
  });

  it("is empty for a map with no owned pixels", () => {
    expect(leaderboardMostPixels(map([px(0, 0, null)]))).toEqual([]);
  });
});

describe("leaderboardMostExpensivePixel", () => {
  it("ranks by each owner's single priciest pixel", () => {
    const m = map([
      px(0, 0, "0xA", 2),
      px(1, 0, "0xA", 9), // A's best
      px(2, 0, "0xB", 5),
      px(3, 0, "0xB", 1),
    ]);
    expect(leaderboardMostExpensivePixel(m)).toEqual([
      { address: "0xA", value: 9 },
      { address: "0xB", value: 5 },
    ]);
  });
});

describe("leaderboardBiggestConnectedArea", () => {
  it("scores a single solid block as its full size", () => {
    // 0xA owns a 2x2 block; 0xB owns one isolated pixel.
    const m = map([
      px(0, 0, "0xA"),
      px(1, 0, "0xA"),
      px(0, 1, "0xA"),
      px(1, 1, "0xA"),
      px(5, 5, "0xB"),
    ]);
    expect(leaderboardBiggestConnectedArea(m)).toEqual([
      { address: "0xA", value: 4 },
      { address: "0xB", value: 1 },
    ]);
  });

  it("does NOT connect diagonally (4-way only)", () => {
    // Two pixels touching only at a corner => two components of size 1.
    const m = map([px(0, 0, "0xA"), px(1, 1, "0xA")]);
    expect(leaderboardBiggestConnectedArea(m)).toEqual([
      { address: "0xA", value: 1 },
    ]);
  });

  it("scores the BIGGEST component, not total pixels owned", () => {
    // 0xA owns a connected run of 3 plus a far-away single => score 3, not 4.
    const m = map([
      px(0, 0, "0xA"),
      px(1, 0, "0xA"),
      px(2, 0, "0xA"),
      px(9, 9, "0xA"),
    ]);
    expect(leaderboardBiggestConnectedArea(m)).toEqual([
      { address: "0xA", value: 3 },
    ]);
  });

  it("handles an L-shaped contiguous region", () => {
    // L: (0,0)-(0,1)-(0,2)-(1,2) all connected => size 4.
    const m = map([
      px(0, 0, "0xA"),
      px(0, 1, "0xA"),
      px(0, 2, "0xA"),
      px(1, 2, "0xA"),
    ]);
    expect(leaderboardBiggestConnectedArea(m)).toEqual([
      { address: "0xA", value: 4 },
    ]);
  });

  it("does not let a different owner bridge two regions", () => {
    // 0xA . 0xA  -> the middle is 0xB, so A is two size-1 components.
    const m = map([px(0, 0, "0xA"), px(1, 0, "0xB"), px(2, 0, "0xA")]);
    const r = leaderboardBiggestConnectedArea(m);
    expect(r.find((e) => e.address === "0xA")!.value).toBe(1);
    expect(r.find((e) => e.address === "0xB")!.value).toBe(1);
  });

  it("ignores water even if it sits between owned land", () => {
    // (0,0)A  (1,0)A-but-water  (2,0)A  => water breaks the chain.
    const m = map([
      px(0, 0, "0xA"),
      px(1, 0, "0xA", 1, false),
      px(2, 0, "0xA"),
    ]);
    expect(leaderboardBiggestConnectedArea(m)).toEqual([
      { address: "0xA", value: 1 },
    ]);
  });
});

describe("allLeaderboards", () => {
  it("returns all three boards together", () => {
    const m = map([
      px(0, 0, "0xA", 3),
      px(1, 0, "0xA", 8),
      px(5, 5, "0xB", 2),
    ]);
    const r = allLeaderboards(m);
    expect(r.mostPixels[0]).toEqual({ address: "0xA", value: 2 });
    expect(r.biggestConnectedArea[0]).toEqual({ address: "0xA", value: 2 });
    expect(r.mostExpensivePixel[0]).toEqual({ address: "0xA", value: 8 });
  });
});

import {
  globalMostPixels,
  globalMostExpensivePixel,
  globalBiggestConnectedArea,
  globalTerritoryShare,
  allGlobalLeaderboards,
} from "@/lib/maps/leaderboards";

function namedMap(id: number, pixels: PixelState[]): MapSnapshot {
  return { meta: { id, open: true }, pixels };
}

/** Build a map with `total` land pixels, assigning the first `owned` to
 *  `owner` and the rest to null (unowned). */
function landMap(
  id: number,
  total: number,
  owner: string,
  owned: number,
): MapSnapshot {
  const pixels: PixelState[] = [];
  for (let i = 0; i < total; i++) {
    pixels.push(px(i, 0, i < owned ? owner : null));
  }
  return namedMap(id, pixels);
}

describe("global leaderboards", () => {
  it("globalMostPixels sums a player's pixels across all maps", () => {
    const mapA = namedMap(0, [px(0, 0, "0xA"), px(1, 0, "0xA"), px(2, 0, "0xB")]);
    const mapB = namedMap(1, [px(0, 0, "0xA"), px(1, 0, "0xB"), px(2, 0, "0xB")]);
    // A: 2 + 1 = 3 ; B: 1 + 2 = 3 -> tie, address asc
    expect(globalMostPixels([mapA, mapB])).toEqual([
      { address: "0xA", value: 3 },
      { address: "0xB", value: 3 },
    ]);
  });

  it("globalMostExpensivePixel takes the max single pixel anywhere", () => {
    const mapA = namedMap(0, [px(0, 0, "0xA", 4)]);
    const mapB = namedMap(1, [px(0, 0, "0xA", 11), px(1, 0, "0xB", 7)]);
    expect(globalMostExpensivePixel([mapA, mapB])).toEqual([
      { address: "0xA", value: 11 },
      { address: "0xB", value: 7 },
    ]);
  });

  it("global connected area does NOT sum across maps (best single block)", () => {
    // 0xA: connected run of 3 on map A, connected run of 4 on map B.
    const mapA = namedMap(0, [
      px(0, 0, "0xA"),
      px(1, 0, "0xA"),
      px(2, 0, "0xA"),
    ]);
    const mapB = namedMap(1, [
      px(0, 0, "0xA"),
      px(1, 0, "0xA"),
      px(2, 0, "0xA"),
      px(3, 0, "0xA"),
    ]);
    // global = max(3, 4) = 4, NOT 7
    expect(globalBiggestConnectedArea([mapA, mapB])).toEqual([
      { address: "0xA", value: 4 },
    ]);
  });

  it("allGlobalLeaderboards uses normalized share for AREA", () => {
    // mapA: 2 land, both 0xA -> share 1.0 ; mapB: 1 land, 0xB -> share 1.0.
    const mapA = namedMap(0, [px(0, 0, "0xA", 9), px(1, 0, "0xA", 2)]);
    const mapB = namedMap(1, [px(0, 0, "0xB", 3)]);
    const r = allGlobalLeaderboards([mapA, mapB]);
    // AREA is now territory share (fraction), tie at 1.0 -> address asc.
    expect(r.mostPixels[0].address).toBe("0xA");
    expect(r.mostPixels[0].value).toBeCloseTo(1, 6);
    expect(r.mostExpensivePixel[0]).toEqual({ address: "0xA", value: 9 });
    expect(r.biggestConnectedArea[0]).toEqual({ address: "0xA", value: 2 });
  });
});

describe("globalTerritoryShare (normalized AREA)", () => {
  it("a dominant share on a small map beats a larger raw count on a big map", () => {
    // 0xA owns 6 of 10 (0.60). 0xB owns 12 of 100 (0.12) — more raw pixels,
    // but a smaller slice of its board, so A must rank first.
    const small = landMap(0, 10, "0xA", 6);
    const big = landMap(1, 100, "0xB", 12);
    const board = globalTerritoryShare([small, big]);
    expect(board[0].address).toBe("0xA");
    expect(board[0].value).toBeCloseTo(0.6, 6);
    expect(board[1].address).toBe("0xB");
    expect(board[1].value).toBeCloseTo(0.12, 6);
  });

  it("sums a player's ownership fraction across maps", () => {
    // 0xA owns 0.5 of map0 and 0.25 of map1 -> 0.75 total.
    const m0 = landMap(0, 8, "0xA", 4); // 0.5
    const m1 = landMap(1, 8, "0xA", 2); // 0.25
    const board = globalTerritoryShare([m0, m1]);
    expect(board[0].address).toBe("0xA");
    expect(board[0].value).toBeCloseTo(0.75, 6);
  });

  it("skips empty maps without producing NaN", () => {
    const empty = namedMap(0, [px(0, 0, null)]);
    const real = landMap(1, 4, "0xA", 1); // 0.25
    const board = globalTerritoryShare([empty, real]);
    expect(board).toEqual([{ address: "0xA", value: 0.25 }]);
  });
});

import { rankGap } from "@/lib/maps/leaderboards";
import type { LeaderEntry } from "@/lib/maps/types";

describe("rankGap", () => {
  const board: LeaderEntry[] = [
    { address: "0xAAA", value: 50 },
    { address: "0xBBB", value: 30 },
    { address: "0xCCC", value: 12 },
  ];

  it("locates a mid-board player and measures the gap to the rank above", () => {
    expect(rankGap(board, "0xCCC")).toEqual({ rank: 3, value: 12, gap: 18 });
  });

  it("returns a null gap for rank 1 (nobody above)", () => {
    expect(rankGap(board, "0xAAA")).toEqual({ rank: 1, value: 50, gap: null });
  });

  it("reports a zero gap for value ties (address tiebreak splits ranks)", () => {
    // Same value, ranked by address asc — the lower-ranked twin is 0 away.
    const tied: LeaderEntry[] = [
      { address: "0xA", value: 10 },
      { address: "0xB", value: 10 },
    ];
    expect(rankGap(tied, "0xB")).toEqual({ rank: 2, value: 10, gap: 0 });
  });

  it("returns null for a player not on the board", () => {
    expect(rankGap(board, "0xDDD")).toBeNull();
    expect(rankGap([], "0xAAA")).toBeNull();
  });

  it("matches addresses case-insensitively (checksummed vs lowercase)", () => {
    const checksummed: LeaderEntry[] = [
      { address: "0xAbCd000000000000000000000000000000000001", value: 9 },
      { address: "0xabcd000000000000000000000000000000000002", value: 4 },
    ];
    expect(
      rankGap(checksummed, "0xabcd000000000000000000000000000000000001"),
    ).toEqual({ rank: 1, value: 9, gap: null });
    expect(
      rankGap(checksummed, "0xABCD000000000000000000000000000000000002"),
    ).toEqual({ rank: 2, value: 4, gap: 5 });
  });

  it("measures against the immediate rank above, not the leader", () => {
    expect(rankGap(board, "0xBBB")).toEqual({ rank: 2, value: 30, gap: 20 });
  });
});
