# Mondeto — Scaling & Risk Plan

> Companion to `docs/tokenomics/TOKENOMICS_BRIEF.md`. This doc captures the operational
> playbook for what happens when the app gets traction. The tokenomics brief
> answers "what numbers do we pick"; this doc answers "what do we do
> operationally as those numbers move."

---

## The traction risk

Mondeto's core game mechanic doesn't degrade gracefully under high load — it degrades **catastrophically**.

If pixels turn over 5× per day, the price multiplier per day is 2⁵ = 32×. That stacks fast — within a few days nobody can afford a pixel.

So there are **two scaling failure modes**:

1. **Too hot**: high traffic → prices balloon → game becomes unaffordable → players leave
2. **Too cold**: low traffic → prices plummet → owning a pixel feels worthless → players leave

Both end up with no one playing. The middle band is narrow.

---

## Levers we have

### Pre-launch (one-shot)
- **Initial price** — sets the floor
- **Halving time** — sets how fast unsold pixels lose value
- **Fee rate** — sets platform take

These are constants in the contract today. Changing them needs a redeploy (UUPS upgradeable so on-chain state survives).

### Live, no contract change
- **Marketing throttle** — Mondeto's traffic is overwhelmingly campaign-driven, so we control the input
- **Campaign cadence + budget per campaign** — bigger prize pool = more concentrated traffic
- **Country / region targeting** — pull in only one country at a time
- **Time-boxed events** — "next 6 hours: $X reward pool for connected territory" — concentrated burst, predictable end
- **Multi-map fan-out** (see below) — when one map is too hot, deploy more

### Contract-side (requires redeploy)
- **Halving-time tuning** — most likely lever to need adjustment post-launch
- **New maps** — a new contract per map, deploys are cheap

---

## Capacity & multi-map playbook

### Single-map capacity

170 × 100 grid = 17,000 pixel slots. **~30% is water** → roughly **11,900 land pixels**.

At various DAU levels, with assumption of ~3 buys per user per day:

| DAU | Total daily buys | Buys per land pixel per day | Equilibrium daily price multiplier |
|-----|------------------|------------------------------|------------------------------------|
| 1,000 | 3,000 | 0.25 | × 2^0.25 ≈ 1.19× / day (manageable) |
| 10,000 | 30,000 | 2.5 | × 2^2.5 ≈ 5.66× / day (uncomfortable, sustained inflation) |
| 100,000 | 300,000 | 25 | × 2^25 ≈ 33M× / day (instantly broken) |
| 1,000,000 | 3,000,000 | 250 | catastrophic |

These are rough — they assume uniform pixel demand, which isn't realistic (popular regions like cities will be much hotter than empty land). **Real models go in `docs/tokenomics/TOKENOMICS_BRIEF.md`.**

### Multi-map heuristics (back-of-envelope)

Rule of thumb: **a single world map is comfortable at <10k DAU**. Above that, fan out.

| DAU | Map strategy |
|---|---|
| <10k | One world map |
| 10k–50k | World + 1–2 country / region maps for top traffic markets |
| 50k–250k | World + 5–10 country maps |
| 250k+ | World + per-country maps (Kenya, Nigeria, India, Indonesia…) + thematic maps (city-only, art-only, etc.) |
| 1M+ | Sharded by region or seasonal "world reset" cadence — needs design work |

**Don't reset old maps.** Stopping a map disincentivizes buying pixels. Better to add new maps in parallel.

### What it takes to deploy a new map

- 1 contract deployment (gas ~$5–20 on Celo)
- New land mask (Equal Earth for full world, custom shape for country / city / theme)
- Frontend route + map ID switching UX
- Per-map metadata (name, description, banner image)
- Engineering effort: ~2 days first map after the world, then ~1 day per subsequent

---

## Stress points beyond the contract

### Forno RPC (read load)

`/analytics`, the map, leaderboards, and profile pages all hit Forno. The `/analytics` page already chunked the `getLogs` lookback into 50k-block parallel batches after Forno rejected the single 700k-block call. Watch for:

- Rate limits during traffic spikes (currently undocumented but exist)
- Block range limits on `getLogs`
- Latency under load

Mitigation if it bites:
- Add a public Celo RPC with proper SLA (Ankr, BlastAPI, etc.) and rotate
- Add a tiny indexer service that pre-aggregates events (a worker pulling new blocks every few seconds, writing rolled-up snapshots to PostHog or a CDN cache — no relational DB needed)
- Cache reads aggressively in the frontend (already partly done — `mondeto-analytics-cache` in sessionStorage)

### Vercel (frontend)

Edge / Serverless concurrency is generous on Vercel's Pro tier (1000 concurrent invocations), but the long-tail of cold starts in remote regions hurts emerging-market users.

Mitigation:
- Cache the static parts of the app aggressively (the map view is mostly static SVG-ish canvas data)
- Pre-compute leaderboards server-side if they get expensive

### MiniPay WebView

Each WebView is its own browser process. 100k concurrent users = 100k browser instances each making RPC calls. That's a lot of read traffic to Forno specifically.

Mitigation:
- Move heavy reads (full pixel batch) to a cached API in front of the contract
- Aggressive client-side caching

---

## What to monitor in production

| Metric | Healthy band | Action if outside |
|---|---|---|
| DAU | grow gracefully | if spike >10× day-over-day, throttle campaigns |
| Median pixel price | $0.01–$1 | if median >$5 across the map, shorten halving or add a new map |
| Pixels turning over >5×/day | <5% of map | if >20%, halving is too slow for current demand |
| RPC error rate | <1% of reads | if >5%, add backup RPC |
| Frontend p95 LCP | <2.5s on mobile | if degraded, audit assets + cache headers |
| Fee revenue per DAU | TBD post-launch | watch for collapse → people doing tiny tactical buys to grief |

A simple ops dashboard reading from `/analytics` plus Vercel + Celoscan = enough for v1. Add Grafana once it matters.

---

## Decision points

The team should decide before launch:

1. **First-map halving time** — keep 30 days, or change based on tokenomics model? Recommend deciding *after* the analytics work in `docs/tokenomics/TOKENOMICS_BRIEF.md`.
2. **Launch campaign size** — too big a launch campaign = instant pricing explosion. Recommend starting with a small ($50–500 prize pool) campaign in one country.
3. **Second-map trigger** — DAU threshold or wait-and-see? Recommend: pre-build the multi-map UI now, deploy the second map automatically when DAU hits 8k.
4. **Country list for region maps** — which 3 countries to ship region maps for first? Use partner-team testing feedback to pick.
