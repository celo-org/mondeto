# Mondeto — decision register & launch scope

**Lena · DevRel Lead, Celo Core Co · 2026-05-19**

Purpose: every decision made, split into what must ship day one versus what is deferred. Bias is toward cutting day-one scope.

---

## Locked context

- Several **identical** 170×100 maps (~11,900 land pixels each). Map size fixed.
- Maps **pre-deployed in a batch, company-owned**. "Opening a map" = a frontend reveal toggle on an already-deployed contract. No live wallet-signed deploys in the operator flow.
- Natural demand cap ~$7 (hard ~$10): a planning assumption, not coded.
- One **home map** per wallet, auto-assigned, sticky. Leaderboards derived from on-chain ownership.
- Connectivity never crosses maps (global "biggest area" = best single block on one map).
- Storage: **no database at launch.** Wallet → home map is derived deterministically from `hash(address) % revealedMaps`, so a missing record never blocks a user. Map reveal flags live in app config (env / a small JSON committed to the repo). Analytics, error tracking, feature flags, surveys, session replay, and the support-agents event stream are all handled by **PostHog**.
- **No custom admin panel for launch.** Operator toggles map reveals via config commit + redeploy; everything else (user analytics, funnels, error triage, A/B flags) runs from the PostHog dashboard.

## Contract-touching items

All items that touch the smart contract now live in a separate file — **Mondeto Smart Contract Change Proposal** — per the rule that contract changes get their own document for the smart contract developer.

Status at a glance:
- Halving 14 days / initial price $0.003 — values DECIDED (frozen at deploy).
- Admin-settable `feeRate` (launch 5%) — DECIDED.
- Settable-until-first-sale for halving + initial price — PROPOSED, pending smart contract developer input.

## Day-one launch scope (minimal)

- Batch-deploy N identical maps, company-owned. Reveal **6** at launch (absorbs the 100k day-1 spike under the natural cap). Extra maps stay hidden.
- Auto-assign wallet → home map, sticky, hash-balanced.
- Play on your home map. Per-map leaderboards: most pixels, biggest connected area, most expensive pixel.
- Global leaderboards (same three). Shows *who* is on top — never *where* they are.
- Assignment store stays in-memory + deterministic-hash fallback (no DB). Revealed-map list lives in app config.
- Map reveal toggled via config commit; "open next map" threshold is derived from on-chain price data, surfaced through PostHog dashboards.
- `shouldOpenNextMap` advisory wired to the $2 average-price signal, surfaced to the operator (manual reveal).
- Referral / invite links (trivial; a launch is when viral referral pays off).

## Roadmap (explicitly NOT day one)

- **Cross-map raiding** — fast-follow ~1 week after launch. Lets players buy on maps other than home. Moderate frontend work, zero contract work, no rework risk. **No leader-finding affordance**: the app never surfaces where a top player is or offers a jump-to-attack button. Players must do their own research. The "open it later" gate is the release schedule — no gating code. **No new-player protection mechanic**: considered and intentionally dropped — obscurity already covers it (nobody is findable, and small/new players are not worth raiding). No special status, no countdown, no contract guard.
- **Map migration** — deferred; redundant under "one home, buy anywhere".
- **Custom admin panel** — later polish over the working Vercel-dashboard ops flow.
- **Automated monitoring agent** — agent watches existing analytics and auto-reveals (later, auto-deploys) maps when the threshold trips, replacing manual reveal. (Confirm interpretation: maps, not the OpenClaw agent fleet.)
- **Campaign layer** — "buy this country/city/continent", "connect this". Foundation already supports it (leaderboard functions take a filtered pixel subset); no code now.
- **Additional map reveals** — ops cadence after launch, governed by the threshold.

## Status

All product decisions are closed. The only open item is external: the smart contract developer's verdict on the settable-until-first-sale guard (see the separate Smart Contract Change Proposal). App-layer launch work is fully specced and unblocked.
