# Mondeto — Smart Contract Change Proposal

Single source of truth for everything that touches the Mondeto smart contract, for review by the smart contract developer. All app-layer work is tracked separately in the decision register and does not belong here.

---

## Status legend

- **DECIDED** — agreed; needs implementation.
- **PROPOSED — PENDING SC DEV** — preferred option chosen, but final go depends on the smart contract developer's feasibility/safety input.
- **OPEN** — agreed in principle; specifics still to be decided.
- **NO CHANGE** — explicitly confirmed *not* a contract change (listed to prevent scope creep).

---

## Deployment model (context)

Each map is a separate deployment of the **same** contract. Maps are batch-deployed up front, company-owned. "Opening a map" is a frontend reveal of an already-deployed contract — not an on-chain action. Per-deployment constants are set at construction.

Ownership of every deployed proxy is held by a **multi-sig** (see "DECIDED — multi-sig ownership" below). Individual EOAs never own production contracts.

---

## Per-deployment constants — DECIDED values (frozen at deploy)

- **Initial price:** $0.003 (referenced canonically in 1e18 units — see multi-currency section).
- **Halving half-life:** 14 days.
- **Dimensions / land mask:** 170 × 100, existing Equal Earth mask (unchanged from current contract).

> **As-deployed values differ from the two proposed above.** Read from mainnet
> `config()` on every deployed map: `initialPrice` = `30000` (**$0.03**, not
> $0.003) and `halvingTime` = `2592000s` (**30 days**, not 14). `feeRate` = 500
> bps, matching the decision below. These are frozen at construction and cannot
> be changed without a redeploy, so the deployed values are authoritative — the
> figures above are kept as the record of what was originally proposed. Verify
> with `cast call <proxy> "config()(uint256,uint256,uint256,uint256,uint256,uint256,uint256)"`
> before quoting either number anywhere player-facing.

---

## DECIDED change — admin-settable `feeRate`

- Today `feeRate` is a 300 bps constant. It becomes a storage variable settable by the multi-sig admin role. Launch value: **500 bps (5%)**.
- Safe to make mutable because it is **forward-only**: it changes how *future* sale proceeds split and never re-prices an existing pixel or changes the value of anyone's holdings.
- Open questions for SC dev: event emitted on change; whether to bound it (e.g. hard max ≤ 1000 bps so the power is trust-limited even if the multi-sig is compromised).

---

## PROPOSED — PENDING SC DEV — settable-until-first-sale for `initialPrice` and `halving`

- **Proposal:** allow the multi-sig admin to set `initialPrice` and the halving period **only while the map has had zero sales**, then permanently frozen — no setter works once the first pixel is bought.
- **Rationale:** these two are *state-defining*, not forward-only — they are the formula every pixel's price is computed from, so changing them live would retroactively re-price every holding. They cannot be made safely mutable the way `feeRate` can. The freeze-on-first-sale guard de-risks a misconfigured batch (correctable right up until someone buys) without ever permitting retroactive repricing of live players.
- **Status:** preferred option; **awaiting SC developer sign-off** before it's final.
- Open questions for SC dev:
  - Is there a clean single quantity to gate on (an aggregate sale count / `totalSales`), or is a dedicated "first-sale" flag set on the first purchase cleaner/cheaper?
  - Gas cost of the guard on the hot purchase path.
  - Should the freeze be explicitly irreversible by design (recommended: yes).
  - Does changing the halving period pre-sale interact badly with the time-decay baseline (`deployTime`)? Confirm a pre-sale change cannot corrupt later pricing.
  - Any reason to advise against this entirely — if so, the fallback is fully hardcoded/frozen-at-deploy (also acceptable). Fully-settable is explicitly rejected: it is the only option that lets one transaction re-price players' existing holdings.

---

## DECIDED — multi-currency support (USDT + USDC + USDm)

The contract must accept **USDT, USDC, and USDm** as payment tokens, not USDT-only.

### Rationale

- USDT is not buyable in many European jurisdictions; restricting payment to USDT excludes a large slice of the addressable user base. Multi-currency unblocks Europe.
- MiniPay's listing rules (§2 Currency & Stablecoin Logic) also require supporting all three native stablecoins.

### Accepted UX trade-off

Mondeto is peer-to-peer: when buyer A purchases seller B's pixel, B receives most of the payment. With multi-currency enabled, **sellers receive whatever currency the buyer paid in** — not the currency they originally paid with. A player who entered with USDT may later receive USDC or USDm when their pixel sells.

This is acceptable. Stablecoins are economically fungible; balances will simply accrue across all three. The frontend displays totals in USD-equivalent and treats any of the three as "money in". Player confusion is an accepted cost of unblocking the European market — we do not add an internal auto-swap, and we do not segregate liquidity per token.

### Contract design — token whitelist with normalization

Store prices internally in a canonical 18-decimal unit (`1e18 = $1`). On each purchase, accept the chosen ERC-20 and convert the canonical price to that token's decimals.

```solidity
struct AcceptedToken {
    bool accepted;
    uint8 decimals;       // 6 for USDC/USDT, 18 for USDm
    bool initialized;
}

mapping(address => AcceptedToken) public acceptedTokens;
address[] public acceptedTokenList; // for enumeration

event TokenAccepted(address indexed token, uint8 decimals);
event TokenRemoved(address indexed token);

function addAcceptedToken(address token, uint8 decimals) external onlyAdmin {
    require(decimals == 6 || decimals == 18, "unsupported decimals");
    require(!acceptedTokens[token].initialized, "already added");
    acceptedTokens[token] = AcceptedToken({ accepted: true, decimals: decimals, initialized: true });
    acceptedTokenList.push(token);
    emit TokenAccepted(token, decimals);
}

function buyPixels(uint256[] calldata ids, address token) external {
    AcceptedToken memory cfg = acceptedTokens[token];
    require(cfg.accepted, "token not accepted");

    uint256 priceCanonical = selectionPrice(ids); // returns price in 1e18 canonical units
    uint256 priceInToken = _toTokenDecimals(priceCanonical, cfg.decimals);

    IERC20(token).safeTransferFrom(msg.sender, address(this), priceInToken);
    _assignPixels(ids, msg.sender);
    emit PixelsPurchased(msg.sender, ids, priceInToken, token);
}

function _toTokenDecimals(uint256 canonical, uint8 decimals) internal pure returns (uint256) {
    if (decimals == 18) return canonical;
    return canonical / 1e12; // canonical 18 → 6
}
```

**Rejected alternatives:**
- Per-token price tables — makes halving / epoch invariants hard to keep aligned.
- Oracle-based normalization — adds attack surface and a runtime dependency for a stablecoin-to-stablecoin 1:1 swap.

### Token reference (Celo mainnet)

| Token | Symbol | Address | Decimals | Notes |
|-------|--------|---------|----------|-------|
| Mento Dollar | USDm (legacy cUSD) | `0x765DE816845861e75A25fCA122bb6898B8B1282a` | **18** | Native Mento stablecoin; also valid `feeCurrency` |
| USDC | USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | **6** | feeCurrency adapter: `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B` |
| USDT | USDT | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` | **6** | feeCurrency adapter: `0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72` |

### Migration plan (v1 USDT-only → v2 multi-token)

The current contract is UUPS upgradeable.

**Step 1 — reinitializer.** Add `reinitialize(uint8 version)` (OpenZeppelin `reinitializer(2)`) that:
1. Seeds `acceptedTokens[USDT]` with `decimals = 6`.
2. Optionally adds USDC and USDm in the same call.

**Step 2 — storage compatibility.** Append (do NOT reorder):
```solidity
mapping(address => AcceptedToken) public acceptedTokens;
address[] public acceptedTokenList;
uint256 public canonicalUnit; // 1e18 default
```
Keep `address public usdt` in storage for backward compat; deprecate in code only.

**Step 3 — price scale.** Existing `initialPrice` / `minPrice` are stored as 6-decimal USDT values. In `reinitialize`, multiply each by `1e12` so they become 18-decimal canonical units. (Read-side adapter rejected — error-prone.)

**Step 4 — per-token withdraw.**
```solidity
function withdraw(address token, address to, uint256 amount) external onlyAdmin {
    IERC20(token).safeTransfer(to, amount);
}
```
Old single-arg signature stays as a thin wrapper around `withdraw(usdt, ...)` for backward compat with any off-chain tooling.

### Open questions for SC dev (multi-currency)

1. **Treasury split:** withdraw each token separately (recommended) or auto-swap to one base token on collection (rejected — complexity / runtime DEX dependency).
2. **Pricing parity:** rounding loss when paying USDC/USDT is `1e12` wei — sub-cent fractions, acceptable.
3. **Reinitialize timing:** the multi-sig triggers the `reinitialize(2)` call, same day as the frontend deploy.
4. **Indexer/subgraph:** `PixelsPurchased` event signature changes (adds `address token`). Confirm any off-chain consumers update.
5. **Approval cap (already shipped frontend-side):** the frontend caps user approvals at a small fixed amount (starting point $10) instead of unbounded approve. Approval limits live on the token contract, not on the spender — no contract change required. Reference: `apps/web/src/hooks/useBuyPixels.ts` (`APPROVAL_CAP_USDT = 10_000_000n`).

### Testing checklist

- [ ] Upgrade preserves all existing pixel ownership.
- [ ] Upgrade preserves all profiles.
- [ ] `initialPrice` and `minPrice` correctly rescaled to 18-decimal canonical.
- [ ] Buying with USDT works (regression).
- [ ] Buying with USDC works.
- [ ] Buying with USDm works.
- [ ] Mixed-token purchases by the same user accumulate in separate token balances on the contract.
- [ ] `withdraw(token, to, amount)` works per token.
- [ ] Old `withdraw(to, amount)` still works (or is removed with coordination).
- [ ] Gas costs not significantly worse than v1.
- [ ] Pixel sale-count and epoch pricing unaffected.
- [ ] Foundry fork test against mainnet state pre-upgrade.
- [ ] Slither / Mythril clean.

---

## DECIDED — multi-sig ownership & batch deployment

Every privileged role on every Mondeto contract is held by a **multi-sig**, never an EOA. This applies to the existing v1 deployment after migration and every new batch deployment going forward.

### Roles held by the multi-sig

- **Proxy admin / UUPS upgrade authority** — only the multi-sig can upgrade the implementation.
- **`feeRate` setter** — only the multi-sig can change `feeRate` (within bounds, if a hard max is added).
- **Settable-until-first-sale admin** — if approved by SC dev, only the multi-sig can set `initialPrice` / halving pre-sale.
- **Accepted-token admin** — only the multi-sig can add/remove accepted ERC-20s via `addAcceptedToken` / `removeAcceptedToken`.
- **Withdraw recipient/caller** — only the multi-sig can call `withdraw(token, to, amount)`; treasury funds flow to a destination the multi-sig controls.
- **Reinitializer caller** — only the multi-sig can call `reinitialize(2)` during the multi-currency migration.

A single `onlyAdmin` modifier (mapped to the multi-sig address via OpenZeppelin `Ownable2Step` or an `AccessControl` role) is sufficient for all of the above. Granular roles are not required at launch but the contract should not preclude splitting them later.

### Deployment sequence (per batch)

1. Deploy a single implementation contract (one deploy, reused by all proxies in the batch).
2. Deploy N UUPS proxies pointing at that implementation. Each proxy is initialized with its per-deployment constants (initial price, halving, dimensions, land mask, accepted-token list).
3. Transfer ownership of each proxy to the multi-sig in the same script.
4. Verify on Celoscan / Blockscout.
5. The multi-sig optionally calls `reinitialize(2)` on the existing v1 deployment (the one-time multi-currency migration).

The deploy script must fail loudly if any proxy ends the script with an EOA still listed as owner.

### Operational hygiene

- Multi-sig flow rehearsed on Celo Sepolia (full deploy → ownership transfer → fee-rate change → withdraw) before mainnet.
- Signer recovery process documented: what happens if a signer loses access to their device / key.
- No single-signer emergency powers. Every sensitive op requires the threshold; this is the trade-off we accept for not introducing pause hooks.
- The multi-sig itself is on Celo mainnet (not Ethereum mainnet), to avoid cross-chain bridging for governance.

### Open items (specifics to confirm)

- **Multi-sig tool:** recommend **Safe (gnosis safe) on Celo mainnet**. Confirm.
- **Signer set:** identities of the N signers — TBD with the team.
- **Threshold:** recommended **2-of-3** for launch (low friction, still tamper-resistant). 3-of-5 if the signer set grows. Confirm.
- **Treasury destination:** which address receives `withdraw` proceeds — the same multi-sig, or a separate treasury multi-sig? Recommend same multi-sig at launch; revisit if treasury operations get noisy.

---

## NO CHANGE — explicitly out of the contract (anti-scope-creep)

- **Natural demand cap (~$7 / $10):** a planning assumption only. The contract must **not** implement any price ceiling or sale-count cap.
- **Cross-map buying:** already works — the contract has no per-map restriction on who can buy. The later cross-map feature is purely frontend; no contract change.
- **Map assignment, home map, leaderboards, referral links, map reveal/visibility, the $2 "open next map" threshold:** all app-layer. The contract has no concept of any of these.
- **Internal auto-swap between stablecoins:** explicitly rejected. The contract holds whatever tokens come in; no DEX integration.

---

## Checklist for the smart contract developer

1. Implement admin-settable `feeRate` (resolve the open questions above).
2. Evaluate the settable-until-first-sale guard for `initialPrice` + halving — implement, or advise against with reasons (fallback: hardcoded).
3. Implement multi-currency support (token whitelist + canonical 18-decimal normalization + per-token `withdraw` + `reinitialize(2)` migration).
4. Wire every admin role to a single `onlyAdmin` modifier suitable for multi-sig ownership.
5. Produce a deploy script that batch-deploys N proxies, transfers ownership of each to the multi-sig, and fails if any proxy ends with an EOA owner.
6. Confirm nothing in the app-layer roadmap implies any further contract change.
