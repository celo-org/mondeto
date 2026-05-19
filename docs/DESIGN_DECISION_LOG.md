# Mondeto — Project Design & Decision Log

**Lena · DevRel Lead, Celo Core Co · 2026-05-19**

A standalone record of the full design process: the problem, the economic findings, every architecture decision with its rationale, the corrections caught along the way, a manifest of all deliverable files, the launch scope, and what remains open. Written to be readable on its own, without the conversation it came from.

---

## 1. The problem

Mondeto is a pixel-world mini app on Celo (MiniPay). Each pixel starts at $0.003 USDT; every purchase doubles its price; an unsold pixel's price halves on a fixed schedule. A 3% platform fee is taken per sale. The map is a fixed 170×100 grid (~11,900 sellable land pixels per map; ~30% is water).

Two goals had to be met simultaneously: survive a launch of up to 100,000 day-one users without the economy breaking, and sustain a $15,000/month marketing budget from platform fees. The map size cannot change; more capacity means more deployed map contracts.

## 2. Economic findings (the core analysis)

Detail lives in `mondeto_tokenomics_v2.xlsx` and `mondeto_tokenomics_v2_memo.md`. The essentials:

- **A corrected fee model.** An early version assumed an average pixel sells for ~$50 (a "whale willingness-to-pay" figure). That was wrong given a hard behavioural ceiling. With a natural demand cap around $7, a pixel takes ~12 doublings from $0.003 to its ceiling, and the *average* sale across that run is ~$1.02, not $50. Real per-map fee revenue is roughly a tenth of the original estimate. This correction reframed everything and is the reason later numbers are trustworthy.

- **The natural demand cap is an assumption, not code.** Buyers simply stop bidding on a pixel once it costs ~$7 (hard stop ~$10) and buy a cheaper one instead. The contract enforces nothing; this is a planning assumption only.

- **Fixed value per cycle.** A pixel climbing from $0.003 to its cap is one "cycle" worth a fixed ~$12.29 in volume (a geometric sum — timing is irrelevant).

- **The halving bottleneck — the key finding.** Once a pixel hits its cap, only the halving brings it back down. At a 30-day half-life that takes ~178 days (~6 months). A map therefore earns a burst at open, then goes largely dormant for half a year. Sustained revenue requires either a shorter halving period or a steady cadence of new maps.

- **Recommendation adopted:** ~6 identical maps revealed at launch (absorbs the 100k spike under the natural cap), halving shortened from 30 to 14 days, fee at 5%.

## 3. Architecture decision log

Each entry: the decision, why, status, and consequences.

### ADR-1 — Sharded identical maps
**Decision:** Scale with several *identical* 170×100 world maps, not a hub-and-spokes model and not country-specific maps.
**Why:** Hub-and-spokes and country maps required gated access (e.g. Self Protocol), which does not work for the largest user base (Nigeria) and was not wanted at launch. Identical maps are simpler to reason about and deploy.
**Status:** Decided.
**Consequences:** Capacity is added by deploying more identical contracts; "which map" becomes an app-layer concept the contract knows nothing about.

### ADR-2 — Pre-deployed batch, company-owned, frontend reveal
**Decision:** Maps are deployed in a batch up front, owned by the company. "Opening a map" is a frontend reveal toggle on an already-deployed contract, not a live deployment.
**Why:** Rolling, on-demand, wallet-signed deployment by an operator was the single most complex and risky piece. Pre-deploying removes it entirely and suits a company that owns the contracts.
**Status:** Decided.
**Consequences:** Per-deployment contract constants must be correct before the batch ships. The operator's job at launch is flipping reveal flags, not deploying.

### ADR-3 — One sticky home map; own anywhere; no migration
**Decision:** Each wallet is auto-assigned one "home map" (sticky, load-balanced by an address hash so a launch crowd spreads). Players may browse and buy on any map. The earlier "migrate your home" concept was dropped.
**Why:** Auto-assign gives frictionless onboarding and prevents ghost-town maps. "Buy anywhere" keeps the game open and strategy-rich. Migration added a concept and code path that bought nothing once home was just a default view — players can already act on any map without relocating.
**Status:** Decided. Migration is logged as deferred/irrelevant.
**Consequences:** "Home" only affects default UI placement and load-balancing, never ownership or competitive standing.

### ADR-4 — Per-map and global leaderboards
**Decision:** Three boards — most pixels, biggest connected area (4-way orthogonal adjacency), most expensive single pixel — computed per map and globally. Connectivity never crosses maps: a global "biggest area" is a player's best single block on one map, never a sum across maps.
**Why:** Per-map boards are winnable home arenas that keep casual users engaged; the global board is the grand stage for the metagame. Boards are derived from on-chain ownership, so they need no assignment logic. Cross-map connectivity would be meaningless (separate canvases) and was explicitly rejected.
**Status:** Decided and implemented (code + tests).
**Consequences:** Boards extend to campaign-scoped boards later by passing a filtered pixel subset — no new code needed.

### ADR-5 — Storage Option A; no custom admin panel for launch
**Decision:** One Postgres database via the Vercel Marketplace (Neon) holds wallet→map assignments and admin settings. No custom admin panel is built for launch; the operator uses the Vercel dashboard's built-in data editor.
**Why:** One store, fewest moving parts, and the operator can view/edit data with nothing custom built — directly serving the "one person runs everything, no developer in the loop" goal. (Note: Vercel's old first-party KV/Postgres were sunset; storage is now provisioned through the Marketplace with unified billing.)
**Status:** Decided.
**Consequences:** A ~20-line adapter implements the existing `AssignmentStore` interface against Postgres; the pure logic and tests are untouched. A custom admin panel is later polish.

### ADR-6 — Contract parameters and their mutability
**Decision:** Halving = 14 days and initial price = $0.003 are values frozen per deployment. `feeRate` becomes admin-settable (launch 5%). Halving and initial price are proposed to be settable *only until a map's first sale*, then permanently frozen.
**Why:** `feeRate` is *forward-only* — it changes how future proceeds split and never re-prices an existing holding, so it is safe to make mutable. Initial price and halving are *state-defining* — every pixel's price is computed from them, so changing them live would retroactively re-price every holding (a rug-shaped action). The settable-until-first-sale guard de-risks a misconfigured batch without ever permitting retroactive repricing. Fully-settable was explicitly rejected.
**Status:** `feeRate` settable: decided. Settable-until-first-sale: **proposed, pending the smart contract developer's review** (see `mondeto_smart_contract_proposal.md`).
**Consequences:** Ongoing economic tuning happens across future map *generations*, not by mutating live maps.

### ADR-7 — Cross-map raiding deferred; no leader-finding; no new-player protection
**Decision:** Cross-map buying ("raid the global leader") ships as a fast-follow ~1 week after launch. The app never surfaces *where* a top player is or offers a jump-to-attack button — raiding requires the player's own research. A new-player protection mechanic was considered and dropped.
**Why:** Cross-map is moderate frontend work, zero contract work, no rework risk, so it cleanly defers. Hiding location preserves a metagame that rewards effort. Hard new-player protection is impossible without a rejected contract change and would break the economy; soft protection is redundant because nobody is findable and small/new players are not worth raiding — obscurity already covers them.
**Status:** Decided; on the roadmap.
**Consequences:** The "open it later" gate is the release schedule, not gating code. No special status, countdown, or contract guard for new players.

### ADR-8 — No contract-enforced price cap
**Decision:** The contract must not implement any price ceiling or sale-count cap.
**Why:** The ~$7/$10 ceiling is purely a behavioural planning assumption. A coded cap would be a contract change, would freeze liquidity and break halving/fees for capped pixels, and was not wanted.
**Status:** Decided (recorded explicitly to prevent scope creep).

## 4. Process notes — corrections caught before code

The working method was: restate the goal and assumptions, confirm forks before building, and flag the moment new information contradicted an earlier decision. It caught four expensive issues *before* implementation rather than after:

- The fee model's ~$50 average price was wrong; the real figure is ~$1. Caught by a direct challenge before any economics were locked.
- "Free pick from a list" was reversed to "auto-assign," which would have been a rebuild had leaderboard/assignment code already been written to the first model.
- The "migrate" concept was identified as redundant and removed before it was wired into the UI and data model.
- "Raid protection" was shown to be unimplementable as literally stated (open contract + economic breakage) before it entered the build.

Each cost a few extra exchanges and saved a rebuild. This is recorded because the process is part of the deliverable.

## 5. File manifest (what to import, and where)

**Canonical — import these.** Suggested repo layout in parentheses.

- `mondeto_tokenomics_v2.xlsx` — the economic model; fully parametric, all assumptions tunable. (`docs/tokenomics/`)
- `mondeto_tokenomics_v2_memo.md` — the economic reasoning and recommendation in prose. (`docs/tokenomics/`)
- `mondeto_decision_register.md` — app-layer launch scope and roadmap; living source of truth. (`docs/`)
- `mondeto_smart_contract_proposal.md` — everything touching the contract, for the smart contract developer. (`docs/contract/`)
- `mondeto_design_decision_log.md` — this document. (`docs/`)
- `maps-module/src/types.ts` — shared domain types. (`lib/maps/`)
- `maps-module/src/assignment.ts` — assignment, referral placement, the open-next-map signal. (`lib/maps/`)
- `maps-module/src/leaderboards.ts` — per-map and global leaderboards. (`lib/maps/`)
- `maps-module/test/assignment.test.ts` — tests. (`lib/maps/__tests__/`)
- `maps-module/test/leaderboards.test.ts` — tests. (`lib/maps/__tests__/`)

The maps module is dependency-free TypeScript, strict-typecheck clean, 35 tests green (Vitest).

**Superseded — do NOT import.** Kept only for history:

- `mondeto_tokenomics.xlsx` (v1) — contains the incorrect $50 average-price assumption. Replaced by v2.
- `mondeto_tokenomics_memo.md` (v1) — same; replaced by the v2 memo.

## 6. Launch scope (minimal)

Batch-deploy N identical maps (company-owned, one-time). Reveal 6 at launch. Auto-assign wallet→home map, sticky and hash-balanced. Play on the home map with the three per-map leaderboards and the global boards (shows who is on top, never where). A Postgres adapter for assignments plus a settings row (threshold, which maps revealed), edited via the Vercel dashboard. The average-price ($2) "open next map" signal, surfaced to the operator for manual reveal. Referral/invite links (trivial, and a launch is exactly when viral referral pays off).

## 7. Roadmap (explicitly not day one)

Cross-map raiding (fast-follow ~1 week; no leader-finding; no new-player mechanic). Map migration (deferred, redundant). Custom admin panel (later polish). An automated agent that watches existing analytics and auto-reveals/deploys maps when the threshold trips — *interpretation to confirm: maps, not the OpenClaw agent fleet*. The campaign layer ("buy this country/city/continent", "connect this") — the leaderboard functions already support it via a filtered pixel subset. Additional map reveals on an ops cadence.

## 8. Open dependency and next step

Every product decision is closed. The only open item is external: the smart contract developer's verdict on the settable-until-first-sale guard, contained in `mondeto_smart_contract_proposal.md`. App-layer launch work is fully specced and not blocked on it. The next phase is implementation, which begins with a short written spec checklist for confirmation before any code is written.
