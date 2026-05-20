# Mondeto operator runbook

Short ops note for the launch period. Mondeto ships with 6 identical maps
pre-deployed. Only one is revealed at launch; the operator reveals the next
one when the freshest open map starts to mature. The `/analytics` page
surfaces the advisory that tells you when to do it.

## What the advisory means

`/analytics` shows an OPERATOR ADVISORY card at the bottom with one of two
states:

- **HEALTHY** (green pill): the freshest open map's average per-pixel price
  is still under the threshold. No action needed.
- **OPEN NEXT MAP** (yellow pill): the freshest open map's average per-pixel
  price has crossed the threshold (default $2.00). Time to reveal another
  map.

The card also shows:

- `freshest open map` — the map new players currently funnel into.
- `avg price` — average per-pixel price on that map, in USD.
- `threshold` — the trip point. Default $2.00.
- `reason` — the underlying comparison, for the log.

Below the card is the PER MAP table: one row per revealed map with
`% claimed` and `avg $`. Use this to sanity-check the advisory before
revealing.

## What to do when it flips to OPEN NEXT MAP

1. Open the PER MAP table on `/analytics` and confirm the freshest open map
   is genuinely full (high `% claimed`, avg price near or above threshold).
2. Reveal the next map. Two paths, depending on what's wired up:

   **Path A — settings table (preferred once Agent A's settings store is
   live):** open the `revealedMapIds` row in the Vercel dashboard data
   editor and append the next map id (e.g. `[0]` -> `[0, 1]`). Save. The
   front end picks up the new id on the next session-cache miss (~60s).

   **Path B — code flip (stopgap while the settings store isn't merged):**
   in `apps/web/src/lib/maps/contracts.ts`, flip `revealed: true` on the
   next map's entry. Open a tiny PR, merge, and let Vercel redeploy.

3. Watch `/analytics` for a few minutes. The advisory should flip back to
   HEALTHY once the new map registers as the freshest open one.
4. Announce the new map drop in the usual channels.

## How to override the threshold

The default is $2.00. To use a different value:

- **Preferred (settings store, once merged):** edit the threshold row in
  the Vercel dashboard data editor. The advisory picks it up on the next
  refresh.
- **Stopgap (env override):** set
  `NEXT_PUBLIC_MAP_THRESHOLD_USD=<value>` in the Vercel project's env vars
  and redeploy. Any positive number works; non-numeric values fall back to
  $2.00.

## Notes

- The advisory caches in session storage for 60 seconds, so a fresh tab
  triggers a fresh on-chain read; refreshes within 60s reuse the cache.
- The advisory is a hint, not a hard rule. You can reveal a map early on
  marketing cadence regardless of the advisory state.
- This is a manual flow on purpose for the launch window. Once we trust
  the signal, the automated monitoring agent in the backlog will take it
  over.
