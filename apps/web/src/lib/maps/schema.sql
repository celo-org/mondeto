-- Mondeto launch storage: assignments + operator settings.
-- Run once against the Neon database provisioned via Vercel Marketplace.

create table if not exists assignments (
  address text primary key,
  map_id integer not null,
  assigned_at timestamptz default now()
);

create table if not exists settings (
  id integer primary key,
  data jsonb not null
);
