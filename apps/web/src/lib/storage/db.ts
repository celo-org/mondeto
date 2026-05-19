/**
 * Mondeto — Postgres client (Neon serverless driver + Drizzle)
 *
 * The app uses `@neondatabase/serverless` because the production database is
 * provisioned through the Vercel Marketplace (Neon). The serverless driver
 * works over HTTP fetch, which is what Next.js edge/serverless runtimes
 * need. For local dev a standard Postgres URL (incl. neon://) is supported
 * by the same driver.
 *
 * `DATABASE_URL` must be set; we fail loudly rather than silently degrading,
 * because the assignment store backs sticky home-map placement and a
 * misconfigured deploy would silently lose the stickiness guarantee.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.length === 0) {
    throw new Error(
      "DATABASE_URL is not set. Provision a Neon database via the Vercel " +
        "Marketplace and add DATABASE_URL to the project's environment " +
        "variables. See docs/STORAGE_SETUP.md."
    );
  }
  return url;
}

/**
 * Lazily-constructed Drizzle client. We avoid building the client at module
 * import time so unit tests that never touch the DB don't need
 * `DATABASE_URL`. Production routes that touch storage call `getDb()` at
 * request time, by which point env vars are populated.
 */
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db !== null) return _db;
  const sql = neon(getConnectionString());
  _db = drizzle(sql, { schema });
  return _db;
}

/** Test-only: reset the cached client (e.g. between mocked tests). */
export function _resetDbForTests(): void {
  _db = null;
}
