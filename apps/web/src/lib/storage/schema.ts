/**
 * Mondeto — Postgres schema (Drizzle ORM)
 *
 * Two tables back the app-layer state that lives outside the smart contracts:
 *
 *   assignments  — wallet -> home map (sticky, set once)
 *   settings     — operator-tunable values (threshold, revealed maps)
 *
 * Day-one design is single-map (`revealed_map_ids = [0]`), but the schema is
 * already N-map ready. The operator edits `settings` rows directly via the
 * Vercel dashboard data editor; no custom admin UI ships for launch.
 */

import {
  jsonb,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * `assignments` — one row per wallet. The address is the primary key so we
 * cannot accidentally double-assign. `map_id` is the wallet's home map.
 * Once set, the row is immutable from the app's perspective; the
 * `PostgresAssignmentStore.set` path uses `ON CONFLICT DO NOTHING`.
 */
export const assignments = pgTable("assignments", {
  /** 0x-prefixed wallet address, lowercased by callers. */
  address: text("address").primaryKey(),
  /** Index of the deployed map contract (0, 1, ...). */
  mapId: integer("map_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * `settings` — single-row-per-key key/value store with JSONB values.
 *
 * Known keys:
 *   open_next_threshold  number   — avg-price signal for the open-next-map
 *                                    advisory (default 2).
 *   revealed_map_ids     number[] — which map ids the frontend treats as
 *                                    revealed/open (default [0]).
 *
 * Stored as JSONB so the operator can edit either a primitive number or
 * an array in the same column without altering the schema.
 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AssignmentRow = typeof assignments.$inferSelect;
export type NewAssignmentRow = typeof assignments.$inferInsert;
export type SettingsRow = typeof settings.$inferSelect;
export type NewSettingsRow = typeof settings.$inferInsert;
