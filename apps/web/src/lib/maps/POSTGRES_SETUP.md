# Postgres setup (operator)

Mondeto's launch storage is a single Postgres database holding two tables:

- `assignments` — one row per wallet, recording the sticky "home map".
- `settings` — one row (id = 1) holding operator-controlled settings as
  JSON: `thresholdUsd` (advisory threshold for opening the next map) and
  `revealedMapIds` (which map ids are revealed in the UI).

There is no custom admin UI for day one. All edits happen via the Vercel
data editor. See ADR-5 in `docs/DESIGN_DECISION_LOG.md`.

## 1. Provision the database (Neon via Vercel Marketplace)

1. Open the Vercel dashboard → the Mondeto project.
2. Storage tab → Create Database → Marketplace → Neon.
3. Region: pick one close to the Vercel deployment region.
4. Connect the database to the Mondeto project. Vercel populates these
   env vars automatically on every deployment:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
   - `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`

   The app only requires `POSTGRES_URL`; the rest is included because the
   Vercel integration installs them as a set.
5. Redeploy the Mondeto Vercel project so the new env vars are present at
   runtime.

For local development, copy the connection string from the Neon dashboard
into `apps/web/.env.local` as `POSTGRES_URL=...`.

## 2. Create the tables

In the Vercel dashboard for the Neon database, open the SQL Editor and
paste:

```sql
create table if not exists assignments (
  address text primary key,
  map_id integer not null,
  assigned_at timestamptz default now()
);

create table if not exists settings (
  id integer primary key,
  data jsonb not null
);
```

(Identical to `apps/web/src/lib/maps/schema.sql`.)

Optionally seed the settings row with the defaults so the data editor has
something to edit:

```sql
insert into settings (id, data)
values (1, '{"thresholdUsd": 2, "revealedMapIds": [0]}'::jsonb)
on conflict (id) do nothing;
```

The app falls back to `{ thresholdUsd: 2, revealedMapIds: [0] }` when the
row is missing, so this step is optional but convenient.

## 3. Operator edits

All edits use the Vercel dashboard → Neon → Data tab.

### Reveal another map

Edit the `settings` row (id = 1). Change `data` to, for example:

```json
{ "thresholdUsd": 2, "revealedMapIds": [0, 1] }
```

The next page render picks the new list up.

### Move the open-next threshold

Same row, change `thresholdUsd`:

```json
{ "thresholdUsd": 5, "revealedMapIds": [0, 1] }
```

### Move a wallet to a different home map (rare)

The `assignments` table is sticky by design. To re-home a wallet (only do
this if a player explicitly asks):

```sql
update assignments
set map_id = 3
where address = '0xabc...';
```

Address values are stored lowercase. The app lowercases on read, so the
WHERE clause must be lowercase too.

## 4. Migrations

Migrations stay file-based and dead simple: edit
`apps/web/src/lib/maps/schema.sql` and run it through the Vercel SQL
editor on the existing database. There is no migration runner because
the schema is two tables and one JSON blob.
