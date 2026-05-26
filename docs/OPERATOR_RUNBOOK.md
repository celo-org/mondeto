# Mondeto operator runbook

Mondeto runs multiple identical map contracts and **auto-advances** the active map (the one new wallets land on) when its average pixel price crosses the threshold. There is no manual reveal step in production. The `/analytics` page surfaces the same data the auto-advance reads, so you can see what's happening and override the threshold if needed.

## Tuning the auto-advance threshold

The single knob is `NEXT_PUBLIC_MAP_THRESHOLD_USD`. Default is **$2.00**, defined in `apps/web/src/hooks/useShouldOpenNextMap.ts::DEFAULT_THRESHOLD_USD`.

- **Where to set it:** Vercel → Project → Settings → Environment Variables. Add `NEXT_PUBLIC_MAP_THRESHOLD_USD=<value>`, scope to Production / Preview / `staging` branch as appropriate, then trigger a redeploy.
- **Symptoms and the fix:**
  - *Maps are advancing too fast* (the active map flips before it feels "filled") → raise to `3` or `4`.
  - *Map 0 is overcrowded and new users aren't moving on* → lower toward `1`.
  - *Staging needs to exercise the rollover quickly* → set to `0.1` on the `staging` branch scope only; the active pointer will move on the first sale or two.
- Any positive number works; non-numeric values silently fall back to $2.00.

## What the `/analytics` advisory means

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

## What happens when it flips to OPEN NEXT MAP

Nothing manual. The advisory is informational — the assignment hook reads the same per-map prices and moves the active pointer to the next id automatically. Use the card to confirm the new map is registering as the active one, and announce the drop.

If you ever need to add a new contract to the rotation, add a one-line entry to `PRODUCTION_MAPS` in `apps/web/src/lib/maps/contracts.ts` and merge. The active-pointer mechanism picks it up on the next deploy; no other code change required.

## Notes

- The advisory caches in session storage for 60 seconds, so a fresh tab
  triggers a fresh on-chain read; refreshes within 60s reuse the cache.
- The advisory is a hint, not a hard rule. You can reveal a map early on
  marketing cadence regardless of the advisory state.
- This is a manual flow on purpose for the launch window. Once we trust
  the signal, the automated monitoring agent in the backlog will take it
  over.
