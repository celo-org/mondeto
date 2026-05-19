/**
 * Mondeto — map assignment & leaderboards
 * Lena · DevRel Lead, Celo Core Co · 2026-05-15
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
}

export interface MapSnapshot {
  meta: MapMeta;
  /** All pixels for the map (land + water). Water is filtered internally. */
  pixels: PixelState[];
}

/**
 * Sticky assignment store. Injectable so tests use an in-memory impl and
 * production can back it with Postgres / KV — the module does not care.
 *
 * The interface is async because the production adapter is network-bound
 * (Postgres). In-memory implementations resolve synchronously via Promise
 * wrappers, so test ergonomics stay light.
 */
export interface AssignmentStore {
  get(address: Address): Promise<MapId | null>;
  set(address: Address, mapId: MapId): Promise<void>;
}

export interface LeaderEntry {
  address: Address;
  value: number;
}

export interface OpenNextDecision {
  open: boolean;
  /** Human-readable why, for logging/ops dashboards. */
  reason: string;
  /** The map new users are currently funneled into (freshest open map), or null. */
  freshestOpenMapId: MapId | null;
  freshestOpenMapAvgPrice: number | null;
}
