# Mondeto — Audit Remediation Summary

**Purpose:** give the auditing team a fast path through the fixes for each
finding — the original finding, the decision taken, the exact change (with
commit / PR references), and how to verify it.

**Date:** 2026-07-03
**Contract:** `apps/contracts/src/Mondeto.sol` (UUPS upgradeable)

## How to review

The remediation lands as one commit already on `main` plus a stack of three
PRs. The PRs are **stacked and best reviewed in order** (each branches off the
previous):

1. **PR #126** — `[M-02]` buyer slippage + deadline guards
2. **PR #127** — `[Q-01]` tolerate blocked seller payments (branches off #126)
3. **PR #128** — `[M-01]` cap resale fee at 20% (branches off #127)

Note on `main` history: the original squash of the stack into `main`
(`7503118`) only carried the M-02 changes; the Q-01 and M-01 changes were
subsequently landed on `main` via merge commit `d2af1cd`. All four fixes are
on `main` and in the deployed implementations (verification below).

The frontend change required by M-02 is tracked separately in **PR #129**
(`mondeto-fe`), since the new `buyPixels` parameters are supplied by the client.

## Status overview

| ID | Severity | Finding | Code status | Deployed? |
|------|----------|---------|--------|--------|
| M-01 | Medium | `setFeeRate` — owner can set resale fee to 100% | Fixed in PR #128 · `293798b` | **Yes** (verified on-chain) |
| M-02 | Medium | `buyPixels` — no buyer-side slippage protection | Fixed in PR #126 · `cc9b7b1` + FE PR #129 | **Yes** (verified on-chain) |
| L-01 | Low | Missing validation for pricing configuration | Fixed in `0eb2276` (on `main`) | **Yes** |
| Q-01 | Informational | Push payments can block purchases for restricted token recipients | Fixed in PR #127 · `3c488fa` | **Yes** (verified on-chain) |
| Q-02 | Informational | Admin treasury actions have limited event metadata | Acknowledged — not changed | — |

## Deployments (Celo mainnet, 2026-07-03)

Fresh deployments (not upgrades of the previous proxies) — pixel state starts
empty. All eight verified on-chain: grid dimensions match the frontend
registry, each proxy's EIP-1967 implementation slot matches the listed
implementation, `MAX_FEE_RATE()` returns 2000 (M-01), the
`SellerPaymentRedirected` event topic is present in the implementation
bytecode (Q-01), and the 4-argument `buyPixels` is live (M-02).

| Map | Proxy | Implementation |
|-----|-------|----------------|
| World | `0xA8cFC1B4365518f56954382B6Fab25a5382f5C49` | `0xCC880b98B04b485e346Aa813cD8aEEB4AaE51F6A` |
| Africa | `0x8e70ada33714C3F8f35182b781C63449c5e079b7` | `0x13E8DD1D12fcBd91661E7173526f0660A058f0Cb` |
| Asia | `0x9b8DC1e200A21A97963948A758D9fc4300310661` | `0x30F7D4177E79B2e3b8bD817d87329D5FE432a4Ba` |
| Europe | `0xDfB39B4d8896F196c13DBc4aC2dBDc3175Fcd767` | `0xED229A60290044875259202f972D696331499734` |
| North America | `0x5bf55b88220DF9500A33962777B9d48945443106` | `0xDd49d053B1d24266CA58318979B7dbE03A11797F` |
| South America | `0x822e332ac5f0c760257C7204154BA5eaF7A06586` | `0x943fC144C711d669B6609e394CBB35532DD46e44` |
| Oceania | `0x693CE5fBC50c0aCbd8B3333ad7DcaAb1802A4773` | `0x35f22eCA0a32a842F50EAd3AE70230716744E403` |
| Antarctica | `0x66C6eF911B3e33B35558956a0E636F33E16063c4` | `0x0Ea3C07a9bb369e00C29732ba66D2bc4bbCB9F41` |

### Note: an earlier deployment round (superseded) was missing M-01 and Q-01

For the record: a first batch of eight redeployments (2026-07-02) was built
from `main` at commit `7503118`, which — due to how the stacked PRs were
squash-merged — contained only the M-02 changes. On-chain verification at the
time showed the M-01 fee cap and Q-01 blocked-seller handling absent from
those implementations. The Q-01/M-01 changes were then landed on `main`
(merge commit `d2af1cd`) and all eight maps were redeployed. The deployments
listed above are the current, complete set; the 2026-07-02 batch is retired
and was never referenced by a production frontend release.

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

**Deployment status.** Verified present in the deployed implementations
(2026-07-03) — see "Deployments" above.

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

**Deployment status.** Verified present in the deployed implementations
(2026-07-03) — see "Deployments" above.

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
