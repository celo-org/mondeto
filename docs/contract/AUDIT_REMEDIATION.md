# Mondeto — Audit Remediation Summary

**Purpose:** give the auditing team a fast path through the fixes for each
finding — the original finding, the decision taken, the exact change (with
commit / PR references), and how to verify it.

**Date:** 2026-07-02
**Contract:** `apps/contracts/src/Mondeto.sol` (UUPS upgradeable)

## How to review

The remediation lands as one commit already on `main` plus a stack of three
PRs. The PRs are **stacked and best reviewed in order** (each branches off the
previous):

1. **PR #126** — `[M-02]` buyer slippage + deadline guards
2. **PR #127** — `[Q-01]` tolerate blocked seller payments (branches off #126)
3. **PR #128** — `[M-01]` cap resale fee at 20% (branches off #127)

The frontend change required by M-02 is tracked separately in **PR #129**
(`mondeto-fe`), since the new `buyPixels` parameters are supplied by the client.

## Status overview

| ID | Severity | Finding | Code status | Deployed? |
|------|----------|---------|--------|--------|
| M-01 | Medium | `setFeeRate` — owner can set resale fee to 100% | Fixed in PR #128 · `293798b` | **NO — see "Deployment gap"** |
| M-02 | Medium | `buyPixels` — no buyer-side slippage protection | Fixed in PR #126 · `cc9b7b1` + FE PR #129 | **Yes** (verified on-chain) |
| L-01 | Low | Missing validation for pricing configuration | Fixed in `0eb2276` (on `main`) | **Yes** |
| Q-01 | Informational | Push payments can block purchases for restricted token recipients | Fixed in PR #127 · `3c488fa` | **NO — see "Deployment gap"** |
| Q-02 | Informational | Admin treasury actions have limited event metadata | Acknowledged — not changed | — |

## Deployments (Celo mainnet, 2026-07-02)

Fresh deployments (not upgrades of the previous proxies) — pixel state starts
empty. All eight verified on-chain: grid dimensions match the frontend
registry, and each proxy's EIP-1967 implementation slot matches the listed
implementation.

| Map | Proxy | Implementation |
|-----|-------|----------------|
| World | `0x34203Fcf8490Ba8672E2e7038441786bA703958E` | `0xda38B5E99b506b1D30f09060651aAf8ce07Fe4a6` |
| Africa | `0x648845bD26F169C0540A80916F4089b260A0Aa1b` | `0x2aAE3a9Eca16b6B6b9970C078F129f8DA9e294DE` |
| Asia | `0x305826B207D644d51A957dA03e88E4688daa1B71` | `0x4a2d9e5F58dbDfD53ae247E72f1E4656f598Cf9C` |
| Europe | `0xa11FDcB6961da471b1831A4294615614C57706C0` | `0xfCFA49A52A120cd6a44dAbBEa1dDDB3aDCF06D69` |
| North America | `0xfA90BA97f785261C08fE04cfD4B6fe4CDd85c9Db` | `0x5F2aB096E7B31412C71bEEEEde81b433E5d770b1` |
| South America | `0xB1f79C1D6436885EBDcf98b58D29266569fbf1A4` | `0x116bd89b5aD4527C33785e70F53E894DB8ad1a92` |
| Oceania | `0xEbbE1E7b159f3b6CE05813bd8d6788BEe73142AD` | `0x3118D2E659d6c34D4980bAB3E05D8Ca7b8B9f6D8` |
| Antarctica | `0x72E8117dC8a1a4f05168BF4dC3fA289366652B18` | `0xD0B08AC6fACC8a2642AFaEc40E4292137210967a` |

### ⚠️ Deployment gap: M-01 and Q-01 are not in the deployed implementations

Although PRs #126/#127/#128 all show as merged on GitHub, the stack was
squash-merged such that **only the M-02 changes reached `main`**
(commit `7503118`): #127 and #128 merged into their stack base branches, and
the final squash of #126 into `main` predates/excludes their content. The
deployed implementations were built from that state. Verified on-chain
(2026-07-02):

- `MAX_FEE_RATE()` reverts (selector absent) and an owner-simulated
  `setFeeRate(2001)` **succeeds** → the M-01 fee cap is **not deployed**
  (the old 100% bound applies).
- The `SellerPaymentRedirected` event topic is absent from the deployed
  implementation bytecode → the Q-01 blocked-seller handling is **not
  deployed**. (Both are present in the earlier single-map example deployment
  at `0x2E7F1c57db241D529f7BD6B1fA8229984267Af23`, which was built from the
  full stack.)

**Required follow-up (contract team):** re-land the Q-01 (`3c488fa`) and M-01
(`293798b`) changes onto `main`, rebuild, and UUPS-upgrade the eight
implementations. Proxy addresses are unchanged by an upgrade, so no frontend
or registry changes are needed when this lands.

---

## M-01 — `setFeeRate`: owner could set the resale fee to 100%

**Finding.** The owner could set the resale fee arbitrarily high (up to 100%),
allowing the treasury to capture the entire proceeds of an owned-pixel resale
and leaving the previous owner with nothing.

**Decision.** Keep the fee owner-settable (it is a deliberate game parameter),
but bound it with a hard maximum so the contract itself guarantees a floor for
sellers. The contract remains upgradeable, so this is a defence-in-depth bound
rather than the only safeguard.

**Fix** (PR #128, commit `293798b`).

- Introduced a constant upper bound and enforced it everywhere the fee is set
  (constructor/init path and `setFeeRate`):

  ```solidity
  /// @notice Upper bound on the resale fee, in basis points (2000 = 20%).
  uint256 public constant MAX_FEE_RATE = 2000;
  ...
  if (_feeRate > MAX_FEE_RATE) revert InvalidFeeRate(); // was: _feeRate > 10000
  ```

- Effect: the resale fee can never exceed **20%**, so a previous owner always
  keeps at least **80%** of a resale, regardless of owner action.

**Verify.** `setFeeRate(MAX_FEE_RATE)` succeeds; any value above it reverts with
`InvalidFeeRate`. The same bound is enforced on the initialization path.

**Deployment status.** Not yet in the deployed implementations — see
"Deployment gap" above.

---

## M-02 — `buyPixels`: no buyer-side slippage protection

**Finding.** `buyPixels` charged whatever the price was at execution time, with
no buyer-supplied cap. Because each purchase increases a pixel's price, a buyer
could pay materially more than quoted if another purchase landed first (or if a
signed transaction was mined much later).

**Decision.** Add both protections the audit recommended: a maximum total cost
(slippage cap) and a deadline. This requires a contract redeployment and a
frontend change to supply the new parameters.

**Fix — contract** (PR #126, commit `cc9b7b1`).

- New signature:

  ```solidity
  function buyPixels(uint256[] calldata ids, address token, uint256 maxTotalCost, uint256 deadline)
      external nonReentrant
  {
      if (block.timestamp > deadline) revert DeadlineExpired(deadline);
      ...
      if (totalCost > maxTotalCost) revert SlippageExceeded(totalCost, maxTotalCost);
      ...
  }
  ```

- New errors: `DeadlineExpired(uint256 deadline)` and
  `SlippageExceeded(uint256 totalCost, uint256 maxTotalCost)`.
- `maxTotalCost` is expressed in `PRICE_DECIMALS` base units (the same units as
  `selectionPrice`). Callers can opt out of either guard by passing
  `type(uint256).max`.

**Fix — frontend** (PR #129, `mondeto-fe`).

- The buy flow now quotes `maxTotalCost = selectionPrice × (1 + slippage)` and
  sets `deadline = now + window`, passing both to `buyPixels`. The same slippage
  buffer drives the ERC-20 approval so the allowance always covers the cap.
  Defaults are 2% slippage and a 5-minute deadline (both env-tunable).

**Verify.** A buy whose execution-time total exceeds `maxTotalCost` reverts with
`SlippageExceeded`; a transaction mined after `deadline` reverts with
`DeadlineExpired`. Passing `type(uint256).max` for both reproduces the old
unguarded behaviour.

---

## L-01 — Missing validation for pricing configuration

**Finding.** Deployment/initialization accepted pricing parameters that produce
a broken contract — notably a zero halving time (a divisor in the price
formula, which would panic on every price read) and a minimum price greater
than the initial price.

**Decision.** Add the recommended validation for these cases. It is understood
that input validation cannot rule out every economically-bad configuration; the
goal is to reject the configurations that make the contract non-functional.

**Fix** (commit `0eb2276`, already on `main`).

```solidity
// constructor
if (_halvingTime == 0) revert InvalidHalvingTime();
// initialize()
if (_minPrice > _initialPrice) revert InvalidPrice();
```

New errors: `InvalidHalvingTime()`, `InvalidPrice()`. Covering tests added in
`apps/contracts/test/Mondeto.t.sol`.

**Verify.** Constructing with `_halvingTime == 0` reverts `InvalidHalvingTime`;
initializing with `_minPrice > _initialPrice` reverts `InvalidPrice`.

---

## Q-01 — Push payments can block purchases for restricted token recipients

**Finding.** `buyPixels` pushed payment to each previous owner inline. If a
payment token blacklists a previous owner, the transfer to that owner reverts —
which would revert the entire purchase, letting a restricted owner block sales
of their pixels.

**Decision.** Rather than move to a pull-payment model (more complex and more
gas), make seller payouts non-blocking: if a seller transfer fails, retain those
proceeds in the contract instead of reverting the batch. A blocked address could
not have withdrawn the funds anyway, so they are redirected to the treasury and
the event trail records it.

**Fix** (PR #127, commit `3c488fa`).

- Seller payouts now use a non-reverting transfer; a failed payout is redirected
  to the treasury and surfaced via a new event:

  ```solidity
  event SellerPaymentRedirected(address indexed seller, address indexed token, uint256 amount);
  ...
  if (amt > 0 && !t.trySafeTransferFrom(msg.sender, recipients[i], _scaleToToken(amt, tc.decimals))) {
      amounts[0] += amt;                                  // redirect to treasury
      emit SellerPaymentRedirected(recipients[i], token, amt);
  }
  ```

- The treasury leg still uses a **reverting** `safeTransferFrom`, so a buyer who
  genuinely cannot pay still fails cleanly (no silent under-payment).

**Verify.** A purchase where a previous owner is blacklisted by the token still
succeeds; the buyer is charged in full; the blocked owner's proceeds remain in
the contract and a `SellerPaymentRedirected` event is emitted. A buyer with
insufficient balance/allowance still reverts.

**Deployment status.** Not yet in the deployed implementations — see
"Deployment gap" above.

---

## Q-02 — Admin treasury actions have limited event metadata

**Finding.** `withdraw` / `withdrawAll` emit limited metadata, which could make
large or frequent treasury withdrawals harder to track off-chain.

**Decision.** **Acknowledged; no change made.** The treasury withdrawal volume
is expected to be low and individually significant, and withdrawals are already
observable via the underlying ERC-20 `Transfer` events from the contract
address. This can be revisited (adding a dedicated withdrawal event) if
withdrawal frequency grows enough to warrant richer indexing.

---

## Notes

- All **read** functions are unchanged across these fixes (`config`,
  `getPixelBatch`, `selectionPrice`, `pixels`, `profiles`, `getAcceptedTokens`),
  so client read paths are unaffected by the remediation.
- The frontend cannot call the new `buyPixels` against a pre-fix deployment and
  vice-versa (the 4-argument selector differs), so the contract redeployment/
  upgrade and the frontend release (PR #129) ship together.
