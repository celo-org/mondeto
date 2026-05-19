# Mondeto — Smart Contract Change Proposal

**Lena · DevRel Lead, Celo Core Co · 2026-05-19**

Single source of truth for everything that touches the Mondeto smart contract, for review by the smart contract developer. All app-layer work is tracked separately in the decision register and does not belong here.

---

## Status legend

- **DECIDED** — agreed; needs implementation.
- **PROPOSED — PENDING SC DEV** — preferred option chosen, but final go depends on the smart contract developer's feasibility/safety input.
- **NO CHANGE** — explicitly confirmed *not* a contract change (listed to prevent scope creep).

## Deployment model (context)

Each map is a separate deployment of the **same** contract. Maps are batch-deployed up front, company-owned. "Opening a map" is a frontend reveal of an already-deployed contract — not an on-chain action. Per-deployment constants are set at construction.

## Per-deployment constants — DECIDED values (frozen at deploy)

- **Initial price:** $0.003 (USDT; dev to confirm raw-unit/decimals handling).
- **Halving half-life:** 14 days.
- **Dimensions / land mask:** 170 × 100, existing Equal Earth mask (unchanged from current contract).

## DECIDED change — admin-settable `feeRate`

- Today `feeRate` is a 300 bps constant. It becomes a storage variable settable by an admin role. Launch value: **500 bps (5%)**.
- This is safe to make mutable because it is **forward-only**: it changes how *future* sale proceeds split and never re-prices an existing pixel or changes the value of anyone's holdings.
- Open questions for SC dev: access-control mechanism (owner / multisig / role?); event emitted on change; whether to bound it (e.g. hard max ≤ 1000 bps so the power is trust-limited even if the key is compromised).

## PROPOSED — PENDING SC DEV — settable-until-first-sale for `initialPrice` and `halving`

- **Proposal:** allow an admin to set `initialPrice` and the halving period **only while the map has had zero sales**, then permanently frozen — no setter works once the first pixel is bought.
- **Rationale:** these two are *state-defining*, not forward-only — they are the formula every pixel's price is computed from, so changing them live would retroactively re-price every holding. They cannot be made safely mutable the way `feeRate` can. The freeze-on-first-sale guard de-risks a misconfigured batch (correctable right up until someone buys) without ever permitting retroactive repricing of live players.
- **Status:** Lena's selected option; **awaiting SC developer sign-off** before it's final.
- Open questions for SC dev:
  - Is there a clean single quantity to gate on (an aggregate sale count / `totalSales`), or is a dedicated "first-sale" flag set on the first purchase cleaner/cheaper?
  - Gas cost of the guard on the hot purchase path.
  - Should the freeze be explicitly irreversible by design (recommended: yes).
  - Does changing the halving period pre-sale interact badly with the time-decay baseline (`deployTime`)? Confirm a pre-sale change cannot corrupt later pricing.
  - Any reason to advise against this entirely — if so, the fallback is fully hardcoded/frozen-at-deploy (also acceptable). Fully-settable is explicitly rejected: it is the only option that lets one transaction re-price players' existing holdings.

## NO CHANGE — explicitly out of the contract (anti-scope-creep)

- **Natural demand cap (~$7 / $10):** a planning assumption only. The contract must **not** implement any price ceiling or sale-count cap.
- **Cross-map buying:** already works — the contract has no per-map restriction on who can buy. The later cross-map feature is purely frontend; no contract change.
- **Map assignment, home map, leaderboards, referral links, map reveal/visibility, the $2 "open next map" threshold:** all app-layer. The contract has no concept of any of these.

## Checklist for the smart contract developer

1. Implement admin-settable `feeRate` (resolve the open questions above).
2. Evaluate the settable-until-first-sale guard for `initialPrice` + halving — implement, or advise against with reasons (fallback: hardcoded).
3. Confirm nothing in the app-layer roadmap implies any further contract change.
