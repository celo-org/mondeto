/**
 * Mondeto — map assignment, referral placement & migration
 *
 * Model: every wallet has ONE "home map" — where the UI drops them by default
 * and where load-balancing places them. The home pointer is:
 *   - set on first visit (referral target if valid+open, else freshest open map)
 *   - changed ONLY by an explicit migrate() call (surfaced at new-map events)
 *
 * The home pointer does NOT restrict ownership. Players can browse/buy on any
 * map; leaderboards are derived from on-chain ownership, so a migrated player
 * keeps their standing everywhere they still own pixels. This module is pure.
 */

import type {
  Address,
  AssignmentStore,
  MapId,
  MapSnapshot,
  OpenNextDecision,
} from "./types";

/** Mean current price across LAND pixels only. 0 for an empty/all-water map. */
export function averagePrice(map: MapSnapshot): number {
  let sum = 0;
  let n = 0;
  for (const p of map.pixels) {
    if (!p.isLand) continue;
    sum += p.currentPrice;
    n += 1;
  }
  return n === 0 ? 0 : sum / n;
}

/**
 * Deterministic 32-bit FNV-1a hash. Spreads users across equally-fresh maps
 * at launch without a stampede. Stable per address => placement never flickers.
 */
export function hashAddress(address: Address): number {
  let h = 0x811c9dc5;
  const s = address.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function openMaps(maps: MapSnapshot[]): MapSnapshot[] {
  return maps.filter((m) => m.meta.open);
}

function findMap(maps: MapSnapshot[], id: MapId): MapSnapshot | undefined {
  return maps.find((m) => m.meta.id === id);
}

export interface AssignOptions {
  /**
   * Maps within this absolute USDT band of the cheapest are "equally fresh"
   * and load-balanced by address hash (prevents a launch stampede onto map 0).
   */
  balanceEpsilon?: number;
  /**
   * From a `?ref=` / `?map=` link. If this map exists AND is open, a brand-new
   * user is placed here (friends land together). Invalid/closed => ignored,
   * falls back to freshest. Never overrides an EXISTING assignment.
   */
  referredMapId?: MapId;
}

const DEFAULT_BALANCE_EPSILON = 0.01;

/**
 * Resolve a wallet's home map.
 *
 * - Already has a home  -> returned unchanged (auto-assignment is sticky;
 *   only migrate() moves an existing user).
 * - Brand-new + valid referral to an open map -> placed there.
 * - Brand-new otherwise -> freshest open map, hash-balanced among ties.
 *
 * Throws only if there is no open map at all (caller must keep >=1 open).
 */
export function assignUserToMap(
  address: Address,
  maps: MapSnapshot[],
  store: AssignmentStore,
  opts: AssignOptions = {}
): MapId {
  const existing = store.get(address);
  if (existing !== null) return existing;

  // Referral placement (new users only).
  if (opts.referredMapId !== undefined) {
    const ref = findMap(maps, opts.referredMapId);
    if (ref && ref.meta.open) {
      store.set(address, ref.meta.id);
      return ref.meta.id;
    }
    // invalid/closed referral -> silently fall through to freshest
  }

  const open = openMaps(maps);
  if (open.length === 0) {
    throw new Error("assignUserToMap: no open map available");
  }

  const epsilon = opts.balanceEpsilon ?? DEFAULT_BALANCE_EPSILON;
  const priced = open.map((m) => ({ id: m.meta.id, avg: averagePrice(m) }));
  const minAvg = Math.min(...priced.map((p) => p.avg));

  const candidates = priced
    .filter((p) => p.avg <= minAvg + epsilon)
    .sort((a, b) => a.id - b.id);

  const pick = candidates[hashAddress(address) % candidates.length].id;
  store.set(address, pick);
  return pick;
}

/**
 * Explicitly move a player's home to another open map (the "migrate in" action
 * at a new-map event). Unlike assignment this DOES overwrite an existing home.
 *
 * On-chain ownership is untouched: the player keeps every pixel they already
 * own on the old map and still appears on that map's board (and the global
 * board) for as long as they own there. Migration only changes default
 * placement, not competitive standing.
 *
 * Throws if the target map does not exist or is closed.
 */
export function migrateUser(
  address: Address,
  targetMapId: MapId,
  maps: MapSnapshot[],
  store: AssignmentStore
): MapId {
  const target = findMap(maps, targetMapId);
  if (!target) {
    throw new Error(`migrateUser: map ${targetMapId} does not exist`);
  }
  if (!target.meta.open) {
    throw new Error(`migrateUser: map ${targetMapId} is closed`);
  }
  store.set(address, targetMapId);
  return targetMapId;
}

export interface OpenNextOptions {
  /**
   * When the FRESHEST open map's average price reaches this, even the cheapest
   * map new users land on is "mature" => fresh capacity needed. This is the
   * automatic signal; ops may also open a map manually on a marketing schedule
   * (just flip meta.open) — that path doesn't need this function.
   */
  averagePriceThreshold: number;
}

/**
 * Sequential active-map pointer: the map new wallets get assigned to.
 *
 * Lowest-id map whose average price is below the threshold (i.e. the
 * "current frontier"). Once a map crosses the threshold, the pointer moves
 * to the next map and new wallets land there. If every registered map has
 * crossed, the highest-id map gets newcomers (rare — adding more contracts
 * to the registry resolves it).
 *
 * Existing wallets are unaffected by pointer movement; their home is read
 * from the AssignmentStore (persisted to localStorage) and only computed
 * via this function on a first-ever visit.
 */
export function activeMapId(
  perMap: { id: MapId; avgPriceUsd: number }[],
  thresholdUsd: number,
): MapId {
  if (perMap.length === 0) {
    throw new Error('activeMapId: no maps available')
  }
  const sorted = [...perMap].sort((a, b) => a.id - b.id)
  const next = sorted.find((m) => m.avgPriceUsd < thresholdUsd)
  return next ? next.id : sorted[sorted.length - 1].id
}

/** Advisory: should another map be opened now? (auto signal; manual is fine too) */
export function shouldOpenNextMap(
  maps: MapSnapshot[],
  opts: OpenNextOptions
): OpenNextDecision {
  const open = openMaps(maps);

  if (open.length === 0) {
    return {
      open: true,
      reason: "no open map (bootstrap)",
      freshestOpenMapId: null,
      freshestOpenMapAvgPrice: null,
    };
  }

  let freshest = open[0];
  let freshestAvg = averagePrice(freshest);
  for (const m of open) {
    const a = averagePrice(m);
    if (a < freshestAvg || (a === freshestAvg && m.meta.id < freshest.meta.id)) {
      freshest = m;
      freshestAvg = a;
    }
  }

  const shouldOpen = freshestAvg >= opts.averagePriceThreshold;
  return {
    open: shouldOpen,
    reason: shouldOpen
      ? `freshest open map ${freshest.meta.id} avg ${freshestAvg.toFixed(
          4
        )} >= threshold ${opts.averagePriceThreshold}`
      : `freshest open map ${freshest.meta.id} avg ${freshestAvg.toFixed(
          4
        )} < threshold ${opts.averagePriceThreshold}`,
    freshestOpenMapId: freshest.meta.id,
    freshestOpenMapAvgPrice: freshestAvg,
  };
}
