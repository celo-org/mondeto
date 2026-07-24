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

// The most a single buy can total, in 6-decimal USD micros ($1 = 1_000_000).
// A clean, round $10 so the limit reads plainly. The buffered approval
// (price + slippage) can still tip a near-$10 pick over the $10 cap by buy
// time — that case is caught on-chain with the "prices moved" message below,
// not by pre-blocking at an odd number.
export const MAX_SPEND_USD_MICROS = APPROVAL_CAP_USD * 1_000_000n

/**
 * True when a purchase total (6-decimal USD micros) exceeds the $10 spend cap
 * and must be blocked before the wallet is opened.
 */
export function isOverSpendCap(totalPriceMicros: bigint): boolean {
  return totalPriceMicros > MAX_SPEND_USD_MICROS
}

// Short, human-readable lines for the hook's `setError` — same voice as
// lib/buyErrors.ts. The drawer renders its own richer two-line copy for the
// deliberate-over-cap case.
//
// OVER_SPEND_CAP: the player picked more than $10 — trim before buying.
export const OVER_SPEND_CAP_MESSAGE = 'Over the $10 cap — trim your pick to buy'
// PRICE_MOVED: the pick was within $10 when chosen, but the price ticked up
// before the buy landed and the approval would now top the $10 cap. Not a
// failure — just drop a pixel or two and it clears.
export const PRICE_MOVED_MESSAGE =
  'Prices moved while you picked — drop a pixel or two to stay under $10'
