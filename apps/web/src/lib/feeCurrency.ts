import type { Address } from 'viem'

/**
 * MiniPay gas payment (Celo fee abstraction).
 *
 * MiniPay wallets hold stablecoins, not CELO, so a transaction that pays gas in
 * CELO is rejected by the wallet (surfacing as a generic "unknown RPC error").
 * Passing a `feeCurrency` makes viem serialize a CIP-64 transaction whose gas is
 * paid in that stablecoin instead.
 *
 * IMPORTANT — MiniPay only accepts **USDm (cUSD)** as a `feeCurrency`. Per the
 * official MiniPay quickstart: "MiniPay currently supports setting the
 * `feeCurrency` property when running `eth_sendTransaction`. However, currency
 * support is limited to USDm." Passing USDT or USDC (token address *or* their
 * FeeCurrencyDirectory adapters) makes MiniPay reject the tx with "permission
 * denied". So gas is ALWAYS paid in cUSD here, even when the user is buying a
 * pixel with USDT/USDC — the wallet just needs a little cUSD to cover the
 * (sub-cent) gas.
 *
 * Gated to MiniPay: other wallets (desktop / Privy) keep their default CELO gas
 * path, so this changes nothing outside MiniPay.
 */

// cUSD (USDm) — the only fee currency MiniPay currently accepts.
const USDM_FEE_CURRENCY: Address = '0x765DE816845861e75A25fCA122bb6898B8B1282a'

function isMiniPay(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay)
  )
}

/**
 * Fee-currency address to pay gas with, or `undefined` to leave gas in CELO.
 * Returns cUSD only inside MiniPay (the sole currency MiniPay accepts for gas),
 * regardless of which stablecoin the buyer is spending on the pixel itself.
 */
export function getFeeCurrency(_paymentToken?: Address): Address | undefined {
  if (!isMiniPay()) return undefined
  return USDM_FEE_CURRENCY
}
