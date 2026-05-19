/**
 * Mondeto — Postgres-backed AssignmentStore
 *
 * Mirrors the shape of the pure `AssignmentStore` interface in
 * `lib/maps/types.ts` but is async because every operation crosses a
 * network boundary. Callers in API routes await both methods.
 *
 * Stickiness is enforced at the storage layer: `set` uses
 * `INSERT ... ON CONFLICT (address) DO NOTHING`, so an accidental second
 * call for the same wallet never overwrites the home map. Migration (the
 * deferred ADR-3 path) would go through a separate, explicit method.
 */

import { eq } from "drizzle-orm";

import type { Address, MapId } from "../maps/types";

import { getDb } from "./db";
import { assignments } from "./schema";

export interface AsyncAssignmentStore {
  get(address: Address): Promise<MapId | null>;
  /**
   * Sticky insert. Returns the resulting home map for `address`:
   * the just-inserted `mapId` for new rows, or the previously-stored value
   * if a row already existed. Never overwrites.
   */
  set(address: Address, mapId: MapId): Promise<MapId>;
}

/** Lowercased to match the convention enforced in `assignment.ts`. */
function normalize(address: Address): Address {
  return address.toLowerCase();
}

export class PostgresAssignmentStore implements AsyncAssignmentStore {
  /**
   * Optional injection point for tests. In production we lazily resolve via
   * `getDb()` so unit tests that don't touch storage need no env var.
   */
  constructor(private readonly db: ReturnType<typeof getDb> = getDb()) {}

  async get(address: Address): Promise<MapId | null> {
    const rows = await this.db
      .select({ mapId: assignments.mapId })
      .from(assignments)
      .where(eq(assignments.address, normalize(address)))
      .limit(1);
    if (rows.length === 0) return null;
    return rows[0].mapId;
  }

  async set(address: Address, mapId: MapId): Promise<MapId> {
    const addr = normalize(address);
    await this.db
      .insert(assignments)
      .values({ address: addr, mapId })
      .onConflictDoNothing({ target: assignments.address });

    // Read back the persisted value. If a race or a previous assignment
    // existed, this returns the value we should respect (sticky), not the
    // one we just attempted to insert.
    const persisted = await this.get(addr);
    if (persisted === null) {
      // Should not happen: insert with DO NOTHING + select returned null.
      throw new Error(
        `PostgresAssignmentStore.set: failed to persist assignment for ${addr}`
      );
    }
    return persisted;
  }
}
