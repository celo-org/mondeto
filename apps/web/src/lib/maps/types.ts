/**
 * Mondeto — map assignment & leaderboards
 *
 * Dependency-free domain types. Pixel/price data is expected to be hydrated
 * from the on-chain contracts upstream (one contract per map). This module is
 * pure: no chain calls, no I/O — so it is trivially testable.
 */

export type Address = string; // 0x-prefixed wallet address (lowercased by callers)
export type MapId = number; // index of the deployed map contract: 0, 1, 2, ...

export interface MapMeta {
  id: MapId;
  /** Whether this map is live and accepting new users. */
  open: boolean;
}

export interface PixelState {
  /** Pixel index within the map (contract pixel id). */
  id: number;
  x: number;
  y: number;
  /** null = never bought / unowned. */
  owner: Address | null;
  /** Current price in USDT per the contract's pricing curve at read time. */
  currentPrice: number;
  /** Ocean/water pixels are not sellable and are excluded from all metrics. */
  isLand: boolean;
  /**
   * Unix seconds when the current owner acquired this pixel (subgraph
   * `Pixel.lastSoldAt`). Optional — present only when a board is enriched with
   * subgraph timestamps for the exact "reached it first" tie-break. Absent for
   * snapshot-only reads, in which case boards fall back to the address tie-break.
   */
  acquiredAt?: number;
}

export interface MapSnapshot {
  meta: MapMeta;
  /** All pixels for the map (land + water). Water is filtered internally. */
  pixels: PixelState[];
}

/**
 * Sticky assignment store. Injectable; both tests and production use the
 * in-memory impl, with a deterministic-hash fallback when no record exists.
 */
export interface AssignmentStore {
  get(address: Address): MapId | null;
  set(address: Address, mapId: MapId): void;
}

export interface LeaderEntry {
  address: Address;
  value: number;
  /**
   * Optional tie-break key: for the AREA board this is `lastGainAt` (the unix
   * timestamp of the wallet's most recent count-increasing buy). On a `value`
   * tie the SMALLER tiebreak ranks higher — whoever reached the count first.
   * Boards without a time signal (EMPIRE/TYCOONS) omit it and fall back to the
   * deterministic address ordering.
   */
  tiebreak?: number;
}

export interface OpenNextDecision {
  open: boolean;
  /** Human-readable why, for logging/ops dashboards. */
  reason: string;
  /** The map new users are currently funneled into (freshest open map), or null. */
  freshestOpenMapId: MapId | null;
  freshestOpenMapAvgPrice: number | null;
}
