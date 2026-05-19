# Storage setup — Postgres for assignments + settings

Mondeto stores two pieces of app-layer state outside the smart contracts:

- `assignments` — wallet → home map (sticky, set once per wallet).
- `settings` — operator-tunable values (`open_next_threshold`, `revealed_map_ids`).

Per ADR-5 the production database is provisioned through the Vercel
Marketplace (Neon). No custom admin UI ships for launch; the operator edits
the `settings` table directly via the Vercel dashboard's built-in data editor.

## 1. Provision a Neon database via the Vercel Marketplace

1. Open the Vercel project (`mondeto-fe` / web app).
2. Go to **Storage → Connect Store → Create New → Neon**.
3. Pick the free / hobby tier for staging or the appropriate paid tier for
   production. Region: choose one geographically close to the app's serverless
   regions (typically `us-east-1` or `eu-central-1`).
4. Vercel will install the Neon integration, create a database, and wire the
   connection string into the project's environment variables as
   `DATABASE_URL` automatically.

If you provision Neon outside the Marketplace, copy the *pooled* connection
string from the Neon console and paste it into the Vercel project's
**Settings → Environment Variables** as `DATABASE_URL` (Production +
Preview). The serverless driver `@neondatabase/serverless` works over
HTTP fetch, so pooling matters less than for `pg`, but the pooled string is
still the recommended default.

## 2. Local development

```bash
cp apps/web/.env.example apps/web/.env.local
# then edit apps/web/.env.local and paste your DATABASE_URL
```

Any Postgres URL the Neon driver understands will do (a local Postgres via
`postgres://...` works too). Without `DATABASE_URL` set, the app throws a
clear error at the first storage call — it does not silently degrade.

## 3. Create the tables

Drizzle migrations are deferred for v1: the schema is two tables and we keep
the operator flow path-of-least-resistance. Paste the SQL below into the
Vercel dashboard data editor (or `psql`):

```sql
CREATE TABLE IF NOT EXISTS assignments (
  address    TEXT        PRIMARY KEY,
  map_id     INTEGER     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Optional seed (day-one defaults — only needed if you want explicit rows
instead of relying on the in-code defaults of `2` and `[0]`):

```sql
INSERT INTO settings (key, value) VALUES
  ('open_next_threshold', '2'::jsonb),
  ('revealed_map_ids',    '[0]'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

When more maps are revealed (later in the launch cadence), the operator
updates the `revealed_map_ids` row from the Vercel data editor:

```sql
UPDATE settings
SET value = '[0,1]'::jsonb, updated_at = now()
WHERE key = 'revealed_map_ids';
```

## 4. Operator tasks via the Vercel dashboard

- **Reveal another map.** Edit the `revealed_map_ids` row in `settings`,
  append the new map's index. No deploy required.
- **Tune the open-next threshold.** Edit `open_next_threshold` in `settings`.
- **Inspect an assignment** (rare; debugging only). Filter `assignments` by
  the wallet address (lowercased). The row is sticky — never edit a `map_id`
  for a wallet that has been playing; that would orphan their UI default.

## 5. Manual smoke test

A unit test (`assignmentStore.test.ts`) exercises the sticky-write logic
against a mock DB. To smoke-test against the real Postgres:

```bash
cd apps/web
export DATABASE_URL='postgres://...'
pnpm exec tsx -e "
  import { PostgresAssignmentStore } from './src/lib/storage/assignmentStore';
  const s = new PostgresAssignmentStore();
  await s.set('0xtest', 0);
  console.log('round-trip:', await s.get('0xtest'));
  // a second set must NOT overwrite
  await s.set('0xtest', 99);
  console.log('after sticky write (should still be 0):', await s.get('0xtest'));
"
```

Then drop the test row:

```sql
DELETE FROM assignments WHERE address = '0xtest';
```
