/**
 * PostgresAssignmentStore — sticky-behavior tests with a mock DB.
 *
 * We mock the Drizzle client surface used by the store: `.select(...)` and
 * `.insert(...)` chains. The mock backs a plain Map<address, mapId> so we
 * can assert the ON CONFLICT DO NOTHING semantics without spinning up
 * Postgres.
 */

import { describe, it, expect, beforeEach } from "vitest";

import { PostgresAssignmentStore } from "@/lib/storage/assignmentStore";

type Row = { address: string; mapId: number };

// Minimal in-memory stand-in for the Drizzle client. Only the methods the
// store actually uses are implemented; everything else is a no-op.
function makeMockDb(initial: Row[] = []) {
  const rows = new Map<string, Row>(initial.map((r) => [r.address, r]));
  let captured: { address: string } | null = null;

  const select = () => ({
    from: () => ({
      where: (predicate: { _address: string }) => ({
        limit: async (_n: number) => {
          const r = rows.get(predicate._address);
          return r ? [{ mapId: r.mapId }] : [];
        },
      }),
    }),
  });

  const insert = () => ({
    values: (v: Row) => {
      captured = { address: v.address };
      return {
        onConflictDoNothing: async () => {
          if (!rows.has(v.address)) rows.set(v.address, v);
        },
      };
    },
  });

  // The eq() helper from drizzle returns an opaque predicate. We monkey-
  // patch its identity by hijacking the where() call above to read off the
  // address that the store passed. The store always uses eq(address, X),
  // so we re-extract X here via the only thing we have: the value of the
  // last `eq()` call. We achieve that by stubbing the module's eq.
  return { rows, select, insert, getCaptured: () => captured };
}

// Stub out the modules the store imports so the mock above can intercept.
// We mock `getDb` to return our chainable mock and `drizzle-orm`'s `eq` so
// the predicate carries the address through.
import { vi } from "vitest";

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, v: string) => ({ _address: v }),
}));

vi.mock("@/lib/storage/db", () => {
  // We rebuild the mock per-test via the factory below; this default is
  // overwritten by each test that needs deterministic state.
  return {
    getDb: () => (globalThis as { __mondetoDb?: unknown }).__mondetoDb,
    _resetDbForTests: () => {
      delete (globalThis as { __mondetoDb?: unknown }).__mondetoDb;
    },
  };
});

function installMockDb(initial: Row[] = []) {
  const mock = makeMockDb(initial);
  (globalThis as { __mondetoDb?: unknown }).__mondetoDb = mock;
  return mock;
}

describe("PostgresAssignmentStore", () => {
  beforeEach(() => {
    delete (globalThis as { __mondetoDb?: unknown }).__mondetoDb;
  });

  it("get returns null for an unknown address", async () => {
    installMockDb();
    const store = new PostgresAssignmentStore();
    expect(await store.get("0xabc")).toBeNull();
  });

  it("set inserts and returns the new mapId for a fresh address", async () => {
    const mock = installMockDb();
    const store = new PostgresAssignmentStore();
    const result = await store.set("0xABC", 3);
    expect(result).toBe(3);
    // address is lowercased before persistence
    expect(mock.rows.get("0xabc")?.mapId).toBe(3);
  });

  it("set is sticky: a second write does NOT overwrite the existing assignment", async () => {
    const mock = installMockDb([{ address: "0xabc", mapId: 1 }]);
    const store = new PostgresAssignmentStore();
    const result = await store.set("0xabc", 5);
    // The function returns the persisted value (1), not the attempted (5).
    expect(result).toBe(1);
    expect(mock.rows.get("0xabc")?.mapId).toBe(1);
  });

  it("get is case-insensitive via address normalization", async () => {
    installMockDb([{ address: "0xabc", mapId: 7 }]);
    const store = new PostgresAssignmentStore();
    expect(await store.get("0xABC")).toBe(7);
    expect(await store.get("0xAbC")).toBe(7);
  });

  it("set then get round-trips", async () => {
    installMockDb();
    const store = new PostgresAssignmentStore();
    await store.set("0xdeadbeef", 2);
    expect(await store.get("0xdeadbeef")).toBe(2);
  });
});
