# Mondeto Multi-Stablecoin Roadmap

> Audience: the smart-contract developer maintaining the Mondeto contract.
> Goal: Enable MiniPay users to buy pixels with their preferred stablecoin (USDT, USDC, or USDm/cUSD) without forcing a swap.
> Status: **v1 ships USDT-only — multi-stable v2 is paused** pending the MiniPay in-app swap timeline (see "Why this is paused" below). This document captures the design so we can pick it back up cleanly.

---

## Why this is paused

In Mondeto, sellers receive most of the buyer's payment. If buyers can pay in any of the three stablecoins, **sellers receive whatever currency the buyer paid in** — not the currency they originally paid with. So a player who put in USDT could later receive USDC when their pixel sells. Mechanically this works (stablecoins are fungible), but the UX is confusing.

In parallel, MiniPay is shipping an **in-app Squid-based universal swap**. Once that lands, the multi-stable problem disappears: users with USDC / USDm swap inside MiniPay on the way in, and Mondeto stays USDT-only on the backend.

Current plan: **stay USDT-only for v1**, with the existing "swap inside MiniPay first" explainer in the wallet section (already shipped). Pick this roadmap back up only if (a) MiniPay's swap is delayed materially, or (b) the data shows non-USDT holders churning at the funnel.

---

## Why this matters

MiniPay's official listing requirements (§2 Currency & Stablecoin Logic) require Mini Apps to:

1. Support **USDT, USDC, and USDm** (Mento USDm = legacy cUSD).
2. **Adapt** to the user's preferred stablecoin (the one they hold the most of).
3. If supporting only one token, show a clear explainer redirecting users to swap inside MiniPay first.

Current `Mondeto.sol` is hardcoded to a single `IERC20 public usdt`. v1 will ship with the explainer fallback; v2 must support all three natively.

---

## Token reference (Celo mainnet)

| Token | Symbol | Address | Decimals | Notes |
|-------|--------|---------|----------|-------|
| Mento Dollar | USDm (aka cUSD) | `0x765DE816845861e75A25fCA122bb6898B8B1282a` | **18** | Native Mento stablecoin; also valid `feeCurrency` |
| USDC | USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | **6** | feeCurrency adapter: `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B` |
| USDT | USDT | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` | **6** | feeCurrency adapter: `0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72` |

**Critical decimals gotcha**: USDm has 18 decimals, USDC/USDT have 6. The contract currently assumes a single-decimal token. Any price math (`initialPrice`, `minPrice`, `priceOf`, `selectionPrice`) must either:
- be normalized to a canonical 18-decimal internal unit, or
- be parameterized per-token.

---

## Recommended contract design

### Option A — Token whitelist with normalization (recommended)

Store prices internally in a canonical 18-decimal unit (e.g., "1e18 = $1"). On each purchase, accept the chosen ERC-20 and convert the price to that token's decimals.

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

function addAcceptedToken(address token, uint8 decimals) external onlyOwner {
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
    // canonical has 18 decimals; downscale to 6
    return canonical / 1e12;
}
```

**Pros**: Single source of truth for prices. Cheap conversion. Owner can extend token list later.
**Cons**: Slight rounding loss for USDC/USDT (1e12 wei = sub-cent). Acceptable.

### Option B — Per-token price tables

Store independent price state per token. Rejected because it makes economic invariants (halving, epoch pricing) hard to keep aligned.

### Option C — Oracle-based normalization

Use Mento/Chainlink oracles to convert between tokens. Rejected — adds attack surface and a runtime dependency for what is effectively a stablecoin-to-stablecoin 1:1 swap.

---

## Migration plan from v1 (USDT-only) to v2 (multi-token)

Current contract is UUPS upgradeable, which gives us a clean path:

### Step 1 — Reinitializer

Add a `reinitialize(uint8 version)` function (OpenZeppelin `reinitializer(2)` modifier) that:

1. Seeds `acceptedTokens[USDT]` with `decimals = 6` (matches existing state).
2. Optionally adds USDC and USDm in the same call.

### Step 2 — Storage compatibility

The current storage layout is:
```
address public usdt;             // slot N
uint256 public initialPrice;     // slot N+1
uint256 public minPrice;         // slot N+2
uint256[] public landMask;       // slot N+3
mapping(uint256 => Pixel) pixels; // slot N+4
mapping(address => Profile) profiles; // slot N+5
```

Add **at the end** (do NOT reorder):
```solidity
mapping(address => AcceptedToken) public acceptedTokens;
address[] public acceptedTokenList;
uint256 public canonicalUnit; // optional: 1e18 by default
```

Keep `address public usdt` for backward compat; deprecate in code but leave in storage.

### Step 3 — Price scale

Existing `initialPrice` and `minPrice` are stored as USDT (6 decimals) values. Decide between:

**(a) In-place scaling on upgrade**: in `reinitialize`, multiply existing `initialPrice` / `minPrice` by 1e12 so they become 18-decimal canonical units.

**(b) Read-side adapter**: keep storage in 6-decimals and convert on read. Cheaper but error-prone.

**Recommended: (a)** — one-time clean migration, simpler future invariants.

### Step 4 — Withdraw function

Current `withdraw(to, amount)` is single-token. Make it per-token:
```solidity
function withdraw(address token, address to, uint256 amount) external onlyOwner {
    IERC20(token).safeTransfer(to, amount);
}
```

The old single-arg signature can stay as a thin wrapper around `withdraw(usdt, ...)` for backward compat with any off-chain tooling.

---

## Frontend changes (v2)

1. **Preferred-stablecoin detection** (per MiniPay rules): on connect, read user's balance of all three tokens, pick the highest.
2. **Token selector**: optional override (small selector at the bottom of the buy drawer).
3. **Approve + buy** uses the selected token's address.
4. **Display amounts** in the selected token's units, with consistent USD formatting.
5. **Fee abstraction**: pass the **adapter** address (not the token address) as the `feeCurrency` field for USDC/USDT. For USDm, pass the token address itself. Reference table:

   | Token | `feeCurrency` to pass |
   |-------|----------------------|
   | USDm  | `0x765DE816...` (same as token) |
   | USDC  | `0x2F25deB3...` (**adapter**) |
   | USDT  | `0x0e2a3e05...` (**adapter**) |

---

## Testing checklist

- [ ] Upgrade preserves all existing pixel ownership
- [ ] Upgrade preserves all profiles
- [ ] `initialPrice` and `minPrice` correctly rescaled to 18-decimal canonical
- [ ] Buying with USDT works (regression)
- [ ] Buying with USDC works
- [ ] Buying with USDm works
- [ ] Mixed-token purchases by the same user accumulate in separate token balances on the contract
- [ ] `withdraw(token, to, amount)` works per token
- [ ] Old `withdraw(to, amount)` still works (or is removed with coordination)
- [ ] Gas costs not significantly worse than v1
- [ ] Pixel sale-count and epoch pricing unaffected
- [ ] Foundry fork test against mainnet state pre-upgrade
- [ ] Slither / Mythril clean

---

## Open questions for the SC dev

1. **Treasury split**: do you want each token withdrawn separately, or auto-swap to a single base token (USDC?) on collection? Auto-swap = more complex, less flexible. Recommend keep separate.
2. **Pricing parity**: are you OK with the 1e12 rounding loss when paying in USDC/USDT? Worst case is fractions of a cent per purchase.
3. **Reinitialize timing**: who triggers the `reinitialize(2)` call? Recommend owner multisig, same day as the frontend deploy.
4. **Indexer/subgraph**: any off-chain indexers that need updating? `PixelsPurchased` event signature would change (adds `address token`).
5. **Approval cap (MiniPay listing requirement)**: per MiniPay listing guidance, the frontend caps user approvals at a small fixed amount — agreed starting point **$10** — instead of an unbounded approve. This is so that if the contract is ever compromised, user funds beyond the cap remain safe. Already shipped in `apps/web/src/hooks/useBuyPixels.ts` (`APPROVAL_CAP_USDT = 10_000_000n`). No contract change required: approval limits live on the token contract, not on the spender.

---

## Estimated effort

| Task | Effort |
|------|--------|
| Solidity changes + tests | 2–3 days |
| Fork test against mainnet state | 0.5 day |
| Audit-light review (or external) | 1–5 days depending on scope |
| Frontend integration | 1–2 days |
| QA on Sepolia, then mainnet upgrade | 1 day |

---

## v1 stopgap (already shipping)

Until v2 lands, the frontend shows:
- USDT as the primary supported token.
- A clear message for USDC / USDm holders: **"This app accepts USDT only — swap in MiniPay first."**
- Low-balance state redirects to the MiniPay Deposit deeplink (`https://minipay.opera.com/add_cash`).

This satisfies MiniPay's §2 "Graceful Degradation" requirement for the v1 listing.
