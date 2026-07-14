import type { Address } from 'viem'

/**
 * MiniPay gas payment (Celo fee abstraction).
 *
 * MiniPay wallets hold stablecoins, not CELO, so a transaction that pays gas in
 * CELO is rejected by the wallet (surfacing as a generic "unknown RPC error").
 * Passing a `feeCurrency` makes viem serialize a CIP-64 transaction whose gas is
 * paid in that stablecoin instead.
 *
 * The `feeCurrency` is only a HINT: MiniPay validates it against its own
 * allowlist and may then ignore it and charge the token the user holds most. So
 * the value we pass must be one MiniPay actually blesses. The MiniPay docs
 * (https://docs.minipay.xyz/technical-references/send-transaction) only
 * demonstrate **USDC and USDm** as fee currencies, and for the 6-decimal USDC
 * the value must be its **fee-currency adapter**, not the token itself:
 *   USDC  0xcebA93… -> adapter 0x2F25deB3…
 *   cUSD/USDm  0x765DE8… -> itself (a fee currency directly)
 *
 * USD₮ is deliberately NOT mapped to its adapter here: passing the USDT adapter
 * as `feeCurrency` made MiniPay reject the send with "permission denied" (its
 * gate does not bless it). USDT spends fall through to the cUSD/USDm default
 * below — a universally-registered fee currency — while the SPEND token stays
 * USDT. MiniPay may still cover gas from whatever the user holds most.
 *
 * Gated to MiniPay: other wallets (desktop / Privy) keep their default CELO gas
 * path, so this changes nothing outside MiniPay.
 */
const TOKEN_TO_FEE_CURRENCY: Record<string, Address> = {
  // USDC -> its fee-currency adapter
  '0xceba9300f2b948710d2653dd7b07f33a8b32118c': '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
  // cUSD (USDm) is a fee currency directly
  '0x765de816845861e75a25fca122bb6898b8b1282a': '0x765DE816845861e75A25fCA122bb6898B8B1282a',
  // NOTE: USD₮ (0x48065f…) intentionally omitted — see doc comment above; it
  // falls through to DEFAULT_FEE_CURRENCY (cUSD/USDm).
}

// Fallback when the payment token isn't known (e.g. profile edit): cUSD is a
// universally-registered fee currency on Celo mainnet.
const DEFAULT_FEE_CURRENCY: Address = '0x765DE816845861e75A25fCA122bb6898B8B1282a'

function isMiniPay(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay)
  )
}

/**
 * Fee-currency address to pay gas with, or `undefined` to leave gas in CELO.
 * Returns a value only inside MiniPay; pass the stablecoin the user is spending
 * so gas is drawn from the same token they already hold.
 */
export function getFeeCurrency(paymentToken?: Address): Address | undefined {
  if (!isMiniPay()) return undefined
  if (paymentToken) {
    const mapped = TOKEN_TO_FEE_CURRENCY[paymentToken.toLowerCase()]
    if (mapped) return mapped
  }
  return DEFAULT_FEE_CURRENCY
}
