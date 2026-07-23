/**
 * Pure classification of a failed `buyPixels` attempt. Kept out of the hook so
 * it's unit-testable without mounting wagmi/React — the buy catch block just
 * calls these.
 */

/**
 * A deliberate wallet rejection (the user hit "reject" in their wallet). The UI
 * treats this as a silent no-op — no error, back to the buying frame — so it
 * must be detected before any error message is composed. Covers wagmi/viem's
 * UserRejectedRequestError, EIP-1193 code 4001, and ethers' ACTION_REJECTED
 * across MetaMask, MiniPay, and injected wallets.
 */
export function isUserRejectedError(e: unknown, hay: string): boolean {
  const code = (e as { code?: unknown })?.code
  const causeCode = (e as { cause?: { code?: unknown } })?.cause?.code
  return (
    code === 4001 ||
    causeCode === 4001 ||
    hay.includes('User rejected') ||
    hay.includes('User denied') ||
    hay.includes('rejected the request') ||
    hay.includes('ACTION_REJECTED')
  )
}

/**
 * Map a non-rejection buy failure to a short, user-facing message.
 *
 * `hay` is the wallet message + unwrapped detail concatenated; `symbol` is the
 * pay token (e.g. "USDT"). Only the handful of reverts a player can actually
 * act on get a specific message. Everything else — transient RPC/provider
 * blips (a Forno rate-limit or Cloudflare hiccup that viem wraps as a
 * "buyPixels reverted ... HTTP client error"), wallet quirks, raw viem dumps —
 * is meaningless to players and almost always clears on retry, so it maps to
 * one friendly "try again" line instead of a technical dump. The raw error is
 * still logged for debugging at the call site.
 */
export const GENERIC_RETRY_MESSAGE = "That didn't go through — please try again."

export function classifyBuyError(hay: string, symbol: string): string {
  if (hay.includes('nonce')) return 'Nonce error — please try again in a few seconds'
  if (hay.includes('NotLand')) return 'Selected pixel is not land'
  if (hay.includes('TokenNotAccepted')) return `${symbol} is not accepted by this map yet`
  if (hay.includes('SlippageExceeded'))
    return 'Price moved above your limit — please review and try again'
  if (hay.includes('DeadlineExpired')) return 'Transaction expired — please try again'
  if (hay.includes('insufficient') || hay.includes('ERC20'))
    return `Not enough ${symbol} — top up or pick fewer pixels`
  return GENERIC_RETRY_MESSAGE
}
