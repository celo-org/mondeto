import { describe, it, expect } from "vitest";
import {
  averagePrice,
  hashAddress,
  assignUserToMap,
  shouldOpenNextMap,
  activeMapId,
} from "@/lib/maps/assignment";
import type { AssignmentStore, MapId, MapSnapshot, PixelState } from "@/lib/maps/types";

function px(
  id: number,
  x: number,
  y: number,
  price: number,
  owner: string | null = null,
  isLand = true
): PixelState {
  return { id, x, y, currentPrice: price, owner, isLand };
}

function makeMap(id: number, open: boolean, prices: number[]): MapSnapshot {
  return {
    meta: { id, open },
    pixels: prices.map((pr, i) => px(i, i, 0, pr)),
  };
}

class MemStore implements AssignmentStore {
  private m = new Map<string, MapId>();
  get(a: string) {
    return this.m.has(a) ? (this.m.get(a) as MapId) : null;
  }
  set(a: string, id: MapId) {
    this.m.set(a, id);
  }
  size() {
    return this.m.size;
  }
}

describe("averagePrice", () => {
  it("averages land pixels only", () => {
    const map: MapSnapshot = {
      meta: { id: 0, open: true },
      pixels: [px(0, 0, 0, 1), px(1, 1, 0, 3), px(2, 2, 0, 999, null, false)],
    };
    expect(averagePrice(map)).toBe(2); // water (999) excluded
  });

  it("is 0 for an all-water / empty map", () => {
    expect(averagePrice({ meta: { id: 0, open: true }, pixels: [] })).toBe(0);
    expect(
      averagePrice({
        meta: { id: 0, open: true },
        pixels: [px(0, 0, 0, 5, null, false)],
      })
    ).toBe(0);
  });
});

describe("hashAddress", () => {
  it("is stable and case-insensitive", () => {
    expect(hashAddress("0xABC")).toBe(hashAddress("0xabc"));
  });
  it("differs across addresses (spreads load)", () => {
    const a = hashAddress("0x1111111111111111111111111111111111111111");
    const b = hashAddress("0x2222222222222222222222222222222222222222");
    expect(a).not.toBe(b);
  });
});

describe("assignUserToMap", () => {
  it("returns the existing assignment (sticky, never reassigned)", () => {
    const store = new MemStore();
    store.set("0xuser", 3);
    const maps = [makeMap(0, true, [0.003]), makeMap(3, true, [5])];
    expect(assignUserToMap("0xuser", maps, store)).toBe(3); // stays on 3 even though 0 is fresher
  });

  it("assigns a new user to the freshest open map", () => {
    const store = new MemStore();
    const maps = [
      makeMap(0, true, [4, 4, 4]), // mature
      makeMap(1, true, [0.003, 0.003]), // freshest
      makeMap(2, true, [1, 1]),
    ];
    expect(assignUserToMap("0xnew", maps, store)).toBe(1);
  });

  it("never assigns to a closed map", () => {
    const store = new MemStore();
    const maps = [
      makeMap(0, false, [0.001]), // fresher but closed
      makeMap(1, true, [2, 2]),
    ];
    expect(assignUserToMap("0xnew", maps, store)).toBe(1);
  });

  it("throws when no map is open", () => {
    const store = new MemStore();
    const maps = [makeMap(0, false, [1]), makeMap(1, false, [1])];
    expect(() => assignUserToMap("0xnew", maps, store)).toThrow(/no open map/);
  });

  it("spreads launch users across equally-fresh maps (no stampede)", () => {
    const store = new MemStore();
    // Six brand-new maps, all at initial price -> within balanceEpsilon.
    const maps = Array.from({ length: 6 }, (_, i) =>
      makeMap(i, true, [0.003, 0.003, 0.003])
    );
    const buckets = new Map<number, number>();
    for (let i = 0; i < 6000; i++) {
      const addr = "0x" + i.toString(16).padStart(40, "0");
      const m = assignUserToMap(addr, maps, store);
      buckets.set(m, (buckets.get(m) ?? 0) + 1);
    }
    // All six maps used, and no single map got the whole crowd.
    expect(buckets.size).toBe(6);
    for (const count of buckets.values()) {
      expect(count).toBeGreaterThan(6000 / 6 / 3); // each gets a fair-ish share
    }
  });

  it("is deterministic: same address always lands on the same map", () => {
    const maps = Array.from({ length: 6 }, (_, i) =>
      makeMap(i, true, [0.003])
    );
    const a = assignUserToMap("0xdeadbeef", maps, new MemStore());
    const b = assignUserToMap("0xdeadbeef", maps, new MemStore());
    expect(a).toBe(b);
  });
});

describe("shouldOpenNextMap", () => {
  const opts = { averagePriceThreshold: 0.5 };

  it("bootstraps when nothing is open", () => {
    const d = shouldOpenNextMap([makeMap(0, false, [1])], opts);
    expect(d.open).toBe(true);
    expect(d.reason).toMatch(/bootstrap/);
  });

  it("does NOT open while the freshest map is still cheap", () => {
    const maps = [makeMap(0, true, [5, 5]), makeMap(1, true, [0.01, 0.02])];
    const d = shouldOpenNextMap(maps, opts);
    expect(d.open).toBe(false);
    expect(d.freshestOpenMapId).toBe(1);
  });

  it("opens once even the freshest open map crosses the threshold", () => {
    const maps = [makeMap(0, true, [6, 6]), makeMap(1, true, [0.6, 0.6])];
    const d = shouldOpenNextMap(maps, opts);
    expect(d.open).toBe(true);
    expect(d.freshestOpenMapId).toBe(1);
    expect(d.freshestOpenMapAvgPrice).toBeCloseTo(0.6);
  });

  it("ignores closed maps when finding the freshest", () => {
    const maps = [
      makeMap(0, false, [0.001]), // freshest overall but CLOSED
      makeMap(1, true, [0.7, 0.7]),
    ];
    const d = shouldOpenNextMap(maps, opts);
    expect(d.freshestOpenMapId).toBe(1);
    expect(d.open).toBe(true);
  });
});

import { migrateUser } from "@/lib/maps/assignment";

describe("referral placement", () => {
  it("places a brand-new user on a valid open referred map", () => {
    const store = new MemStore();
    const maps = [makeMap(0, true, [0.003]), makeMap(5, true, [3, 3])];
    expect(
      assignUserToMap("0xfriend", maps, store, { referredMapId: 5 })
    ).toBe(5); // honored even though map 0 is fresher
  });

  it("ignores a closed/invalid referral and falls back to freshest", () => {
    const store = new MemStore();
    const maps = [makeMap(0, true, [0.003]), makeMap(5, false, [3])];
    expect(
      assignUserToMap("0xfriend", maps, store, { referredMapId: 5 })
    ).toBe(0);
    expect(
      assignUserToMap("0xother", maps, store, { referredMapId: 99 })
    ).toBe(0);
  });

  it("never lets a referral override an existing home", () => {
    const store = new MemStore();
    store.set("0xexisting", 1);
    const maps = [makeMap(0, true, [0.003]), makeMap(1, true, [9])];
    expect(
      assignUserToMap("0xexisting", maps, store, { referredMapId: 0 })
    ).toBe(1);
  });
});

describe("migrateUser", () => {
  it("overwrites an existing home to an open target", () => {
    const store = new MemStore();
    store.set("0xp", 0);
    const maps = [makeMap(0, true, [5]), makeMap(7, true, [0.003])];
    expect(migrateUser("0xp", 7, maps, store)).toBe(7);
    expect(store.get("0xp")).toBe(7);
  });

  it("refuses to migrate to a closed or missing map", () => {
    const store = new MemStore();
    const maps = [makeMap(0, true, [1]), makeMap(7, false, [0.003])];
    expect(() => migrateUser("0xp", 7, maps, store)).toThrow(/closed/);
    expect(() => migrateUser("0xp", 42, maps, store)).toThrow(/does not exist/);
  });
});

describe("activeMapId", () => {
  const THRESHOLD = 2;

  it("returns the lowest id whose avg is below threshold", () => {
    const perMap = [
      { id: 0, avgPriceUsd: 3 },
      { id: 1, avgPriceUsd: 0.5 },
      { id: 2, avgPriceUsd: 0 },
    ];
    expect(activeMapId(perMap, THRESHOLD)).toBe(1);
  });

  it("returns id 0 when the first map is fresh", () => {
    const perMap = [
      { id: 0, avgPriceUsd: 0.1 },
      { id: 1, avgPriceUsd: 0 },
    ];
    expect(activeMapId(perMap, THRESHOLD)).toBe(0);
  });

  it("falls back to the highest id when every map has crossed", () => {
    const perMap = [
      { id: 0, avgPriceUsd: 5 },
      { id: 1, avgPriceUsd: 4 },
      { id: 2, avgPriceUsd: 3 },
    ];
    expect(activeMapId(perMap, THRESHOLD)).toBe(2);
  });

  it("is order-insensitive on input", () => {
    const perMap = [
      { id: 2, avgPriceUsd: 0 },
      { id: 0, avgPriceUsd: 3 },
      { id: 1, avgPriceUsd: 3 },
    ];
    expect(activeMapId(perMap, THRESHOLD)).toBe(2);
  });

  it("throws on empty input", () => {
    expect(() => activeMapId([], THRESHOLD)).toThrow(/no maps/);
  });
});
