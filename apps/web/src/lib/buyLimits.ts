/**
 * Single source of truth for the per-buy spend cap and the slippage buffer,
 * shared by the buy hook (`useBuyPixels`), the checkout UI (`SelectionDrawer`),
 * and their tests. Kept pure so the cap math is unit-testable without wagmi.
 *
 * MiniPay's security review requires the app to cap every token approval at
 * $10 — a single purchase must never request an allowance above that, so if
 * the contract were ever compromised, user funds beyond the cap stay safe.
 */

// Standing-approval cap, in dollars. Buys approve exactly this much (a $10
// standing allowance means fewer repeat approval prompts); anything that would
// need a larger approval is blocked before the wallet opens.
export const APPROVAL_CAP_USD = 10n

export const BPS_DENOM = 10_000n

// Buyer-side slippage tolerance, in basis points. The execution-time price can
// drift slightly above the quoted price (gradual intra-epoch decay reverses, or
// another buyer bumps a pixel's saleCount). We accept up to this much over the
// quote and let the contract revert (SlippageExceeded) beyond it, so a
// front-run that doubles the price can't silently charge the buyer. The SAME
// buffer drives the token approval, so the allowance always covers the ceiling.
// Tunable per-environment via NEXT_PUBLIC_BUY_SLIPPAGE_BPS (default 2%).
export const SLIPPAGE_BPS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_BUY_SLIPPAGE_BPS)
  return Number.isFinite(raw) && raw >= 0 ? BigInt(Math.floor(raw)) : 200n
})()

// The largest purchase whose approval still fits under the $10 cap, in
// 6-decimal USD micros ($1 = 1_000_000). Because every approval adds the
// slippage buffer on top of the price, a $10 approval only covers a purchase
// up to $10 / (1 + slippage) ≈ $9.80 at the default 2%. Blocking here (rather
// than at a round $10) guarantees every allowed buy's approval stays ≤ $10, so
// nothing fails at the wallet.
export const MAX_SPEND_USD_MICROS =
  (APPROVAL_CAP_USD * 1_000_000n * BPS_DENOM) / (BPS_DENOM + SLIPPAGE_BPS)

/**
 * True when a purchase total (6-decimal USD micros) exceeds the spend cap and
 * must be blocked before the wallet is opened.
 */
export function isOverSpendCap(totalPriceMicros: bigint): boolean {
  return totalPriceMicros > MAX_SPEND_USD_MICROS
}

// Short, human-readable line for the hook's `setError` — same voice as
// lib/buyErrors.ts. The drawer renders its own richer two-line copy.
export const OVER_SPEND_CAP_MESSAGE = 'Over the $10 cap — trim your pick to buy'
