import type { Address } from 'viem'

/**
 * MiniPay gas payment (Celo fee abstraction).
 *
 * MiniPay wallets hold stablecoins, not CELO, so a transaction that pays gas in
 * CELO is rejected by the wallet (surfacing as a generic "unknown RPC error").
 * Passing a `feeCurrency` makes viem serialize a CIP-64 transaction whose gas is
 * paid in that stablecoin instead.
 *
 * Addresses are taken from the official MiniPay docs
 * (https://docs.minipay.xyz/technical-references/send-transaction). MiniPay
 * accepts USDT, USDC and USDm as fee currencies; for the 6-decimal tokens the
 * value passed must be the **fee-currency adapter**, not the token itself:
 *   USD₮  0x48065f… -> adapter 0x0E2A3e05…
 *   USDC  0xcebA93… -> adapter 0x2F25deB3…
 *   cUSD  0x765DE8… -> itself (a fee currency directly)
 * MiniPay may also ignore `feeCurrency` and charge the token the user holds most.
 *
 * Gated to MiniPay: other wallets (desktop / Privy) keep their default CELO gas
 * path, so this changes nothing outside MiniPay.
 */
const TOKEN_TO_FEE_CURRENCY: Record<string, Address> = {
  // USD₮ (Tether) -> its fee-currency adapter
  '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e': '0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72',
  // USDC -> its fee-currency adapter
  '0xceba9300f2b948710d2653dd7b07f33a8b32118c': '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
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
