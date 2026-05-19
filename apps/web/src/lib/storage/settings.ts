/**
 * Mondeto — settings helpers
 *
 * Two keys back the operator-tunable launch state:
 *
 *   `open_next_threshold` (number)
 *     The average-price signal that flips `shouldOpenNextMap()` from "stay"
 *     to "open another". Default 2 — the $2 figure recorded in the
 *     decision register. Operator can edit live via the Vercel data editor.
 *
 *   `revealed_map_ids` (number[])
 *     Which deployed map contracts the frontend treats as open. Day-one
 *     default is `[0]` — only the single contract live at launch. As more
 *     maps are revealed (manually, by the operator) this list grows.
 *
 * Defaults are returned when the row is absent, so a fresh database is
 * usable without seed scripts.
 */

import { eq } from "drizzle-orm";

import { getDb } from "./db";
import { settings } from "./schema";

const KEY_THRESHOLD = "open_next_threshold";
const KEY_REVEALED = "revealed_map_ids";

const DEFAULT_THRESHOLD = 2;
const DEFAULT_REVEALED_MAP_IDS: number[] = [0];

async function readValue(key: string): Promise<unknown> {
  const rows = await getDb()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  if (rows.length === 0) return null;
  return rows[0].value;
}

async function writeValue(key: string, value: unknown): Promise<void> {
  await getDb()
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function getThreshold(): Promise<number> {
  const v = await readValue(KEY_THRESHOLD);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return DEFAULT_THRESHOLD;
}

export async function setThreshold(n: number): Promise<void> {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`setThreshold: invalid threshold ${n}`);
  }
  await writeValue(KEY_THRESHOLD, n);
}

export async function getRevealedMapIds(): Promise<number[]> {
  const v = await readValue(KEY_REVEALED);
  if (
    Array.isArray(v) &&
    v.every((x) => typeof x === "number" && Number.isInteger(x) && x >= 0)
  ) {
    return v as number[];
  }
  return [...DEFAULT_REVEALED_MAP_IDS];
}

export async function setRevealedMapIds(ids: number[]): Promise<void> {
  if (
    !Array.isArray(ids) ||
    !ids.every((x) => Number.isInteger(x) && x >= 0)
  ) {
    throw new Error("setRevealedMapIds: ids must be non-negative integers");
  }
  // De-dup + sort to keep the stored value stable when the operator edits.
  const unique = Array.from(new Set(ids)).sort((a, b) => a - b);
  await writeValue(KEY_REVEALED, unique);
}
