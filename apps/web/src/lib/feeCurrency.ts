import type { Address } from 'viem'

/**
 * MiniPay gas payment (Celo fee abstraction).
 *
 * MiniPay wallets hold stablecoins, not CELO, so a transaction that pays gas in
 * CELO is rejected by the wallet (surfacing as a generic "unknown RPC error").
 * Passing a `feeCurrency` makes viem serialize a CIP-64 transaction whose gas is
 * paid in that stablecoin instead.
 *
 * MiniPay expects the plain **ERC-20 token address** here and resolves the
 * Celo FeeCurrencyDirectory adapter internally. Passing the raw adapter address
 * (which is what a node-submitted CIP-64 tx wants for 6-decimal tokens) makes
 * MiniPay reject the tx with "permission denied", because the adapter isn't on
 * its list of recognized fee currencies. So map every token to itself:
 *   USD₮  0x48065f… -> itself
 *   USDC  0xcebA93… -> itself
 *   cUSD  0x765DE8… -> itself
 *
 * Gated to MiniPay: other wallets (desktop / Privy) keep their default CELO gas
 * path, so this changes nothing outside MiniPay.
 */
const TOKEN_TO_FEE_CURRENCY: Record<string, Address> = {
  // USD₮ (Tether) — MiniPay wants the token address, not the adapter
  '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e': '0x48065fBbE25f71C9282ddf5e1cd6D6A887483D5e',
  // USDC — MiniPay wants the token address, not the adapter
  '0xceba9300f2b948710d2653dd7b07f33a8b32118c': '0xcEBA9300f2b948710d2653dD7B07f33A8B32118C',
  // cUSD (USDm) is a fee currency directly
  '0x765de816845861e75a25fca122bb6898b8b1282a': '0x765DE816845861e75A25fCA122bb6898B8B1282a',
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
