# Leaderboards & rewards roadmap

How ranking and rewards evolve as Mondeto grows from a handful of maps
(World, Africa, Europe) toward many continent and country maps.

## Guiding rule

**The pixel-sale treasury is never shared with players.** Treasury funds the
project. Player rewards come from **status**, **in-game perks**, and
**externally-funded reward campaigns** — never from redistributing pixel
revenue. This keeps the economics clean and avoids treating the game as a
yield/payout product.

## How the leaderboard works today

- **Per-map boards** (the heart): each map ranks its own players on three
  metrics — LAND (most pixels), EMPIRE (biggest connected block), TYCOONS
  (most valuable single pixel). Within one map, raw counts are already fair.
- **Combined global board**: a normalized cross-map board. LAND is ranked by
  **share of board owned** (sum of each map's `owned / claimable` fraction),
  not raw pixel counts — so a small-but-dominant holding on Africa (8.8k
  claimable) is comparable to a holding on World (5.6k claimable). EMPIRE and
  TYCOONS take a player's single best across maps (empires never merge across
  separate canvases).
- **Data source**: computed client-side from `getPixelBatch` snapshots of each
  revealed map, cached 30s in `sessionStorage` (`lib/maps/snapshots.ts`). No
  indexer. Fine for ~3–5 maps.

## Reward phases

### Phase 1 — Cosmetic / status (now)

- **Ruler of <map>**: the rank-1 LAND holder of each map. Shown as a live
  `RULER` badge on the leaderboard row and a `RULER OF <MAP>` badge on the
  player's profile (one per map ruled). Gender-neutral by design — a leader may
  be a king, queen, empress, … Sourced from `useMapRulers` so the badge can't
  drift from the board.
- Pure bragging rights, zero cost, instant. This is what most territory games
  (r/place flags, territorial.io clans) lean on.
- Future cosmetic adds: colored name for current leaders, a crown on the map
  switcher / atlas next to maps a player rules.

### Phase 2 — In-game perks (slow add)

Perks for map leaders / top ranks, funded by game mechanics rather than cash:

- **Fee rebate**: leaders pay a reduced protocol fee for a window.
- **Free-claim allowance**: top-N get a small number of free claims per period.
- **Early access to the next map**: leaders can claim on a freshly-revealed map
  before it opens to everyone — ties directly into the map-reveal mechanic
  (`NEXT_PUBLIC_MAP_THRESHOLD_USD`).

Perks are the preferred long-term direction: they deepen engagement and the
competitive loop without touching treasury or introducing payout/legal
complexity. Add them one at a time and measure.

### Phase 3 — Reward campaigns (externally funded)

Time-boxed, sponsored challenges surfaced via the existing `CampaignBanner`:

- e.g. "Most pixels claimed in France this month → prize pool from a sponsor."
- Prize pools come from **sponsors / partners / marketing budget**, never the
  pixel treasury.
- The per-map leaderboard machinery already computes the rankings; a campaign
  is a scoped board (a region subset, or a time window) plus an external prize.
- `lib/maps/leaderboards.ts` is already written to accept a pre-filtered pixel
  subset (e.g. "pixels inside the France region"), so region-scoped campaign
  boards reuse the same functions.

### Phase 4 — Seasons & NFT trophies (later — needs an indexer)

When the game introduces **seasons** (a defined window with an end, then a
rebase so newcomers aren't permanently behind):

- **Season-end snapshot** decides winners under a published rule (most
  territory %, biggest empire, etc.) — the r/place / Dark Forest / Travian
  model.
- **NFT trophies** minted to top-N per map at season end (Dark Forest mints
  planet NFTs to its top 63). Cosmetic/collectible, still not a treasury
  payout.
- Seasons need **historical queries** ("the board as of the season-end
  block"), which is where an indexer becomes worth running.

## When we add an indexer (Envio)

Phases 1–3 run on client snapshots and need no indexer. Build the indexer when
**any** of these is true:

- Map count grows past ~5 and per-session full scans get heavy.
- We add seasons / historical "board as of date X" queries (Phase 4).
- We want server-rendered or shareable leaderboard pages without each client
  re-scanning all maps.

**Choice: Envio (HyperIndex) on Celo.** It would index `PixelsPurchased` (and
profile updates) across every map contract and maintain per-(map, owner)
ownership, exposing a GraphQL endpoint the leaderboard queries instead of
scanning chain state client-side. EMPIRE (contiguous-block) can be computed in
the indexer's TypeScript handlers from each owner's pixel set per map, or in a
periodic snapshot job. Until then, the client-snapshot path is the source of
truth.

## Defining "the winner" of a map

- **Default / Ruler**: most land pixels owned (rank-1 LAND board). Simple,
  intuitive, live.
- **Most thematic**: biggest contiguous empire (Monopoly-like). More expensive
  (connected-component analysis) — already implemented per-map.
- **Season winner** (Phase 4): whoever leads the chosen metric at the
  season-end snapshot, then reset.

The current product crowns the **Ruler = most-pixels holder** per map, live, no
end — which fits the always-on board.
