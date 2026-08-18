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
 * Machine-readable failure bucket, sent alongside the user-facing `reason` on
 * `pixel_buy_failed`. The message is written for players and changes with copy;
 * the category is written for analysis and must stay stable, so segmenting by
 * category doesn't silently re-bucket every time a string is reworded.
 *
 * `unknown` is the one to watch: it means the raw error matched nothing here,
 * so a rising `unknown` share is the signal to add a branch — not a reason to
 * ignore the number.
 */
export type BuyErrorCategory =
  | 'nonce'
  | 'not_land'
  | 'token_not_accepted'
  | 'slippage'
  | 'deadline_expired'
  | 'insufficient_funds'
  | 'permission_denied'
  | 'timeout'
  | 'rpc'
  | 'gas_estimate'
  | 'chain_revert'
  | 'unknown'

/**
 * Blocked before the wallet ever opened. These are distinct from
 * `BuyErrorCategory` because nothing was signed and no error was thrown —
 * the buy was stopped by one of our own guards.
 */
export type BuyBlockedReason =
  /** The player declined the network switch. */
  | 'chain_switch_rejected'
  /** The switch failed for any other reason — a wallet that can't add Celo. */
  | 'chain_switch_failed'
  | 'no_stablecoin_balance'
  | 'over_spend_cap'

/**
 * Which gas-estimate rung a buy ended up on. The happy path (`feeCurrency`
 * estimate succeeds) emits nothing; the fallbacks are the interesting signal,
 * because in MiniPay a send with no gas limit makes the wallet run its own
 * `eth_estimateGas`, which answers "permission denied" and kills the buy.
 */
export type GasFallbackLevel = 'without_fee_currency' | 'ceiling'

export const GENERIC_RETRY_MESSAGE = "That didn't go through — please try again."

type Rule = {
  category: BuyErrorCategory
  test: (hay: string, lower: string) => boolean
  message: (symbol: string) => string
}

/**
 * Ordered — first match wins. The first six rules are the original set and
 * their order is load-bearing: `nonce` before the named reverts, and
 * `insufficient` last of the six so an "insufficient funds for gas" doesn't
 * get claimed by a broader rule.
 *
 * The rules after them exist only to split what used to collapse into
 * `unknown`. They all keep GENERIC_RETRY_MESSAGE, so no player-facing copy
 * changes here — this is about the category. Their order matters too: viem
 * wraps a transient RPC blip as `... reverted with the following reason: RPC
 * endpoint returned HTTP client error`, so `rpc` has to be tested before
 * `chain_revert` or every provider hiccup would be filed as an on-chain revert.
 */
const RULES: Rule[] = [
  {
    category: 'nonce',
    test: (hay) => hay.includes('nonce'),
    message: () => 'Nonce error — please try again in a few seconds',
  },
  {
    category: 'not_land',
    test: (hay) => hay.includes('NotLand'),
    message: () => 'Selected pixel is not land',
  },
  {
    category: 'token_not_accepted',
    test: (hay) => hay.includes('TokenNotAccepted'),
    message: (symbol) => `${symbol} is not accepted by this map yet`,
  },
  {
    category: 'slippage',
    test: (hay) => hay.includes('SlippageExceeded'),
    message: () => 'Price moved above your limit — please review and try again',
  },
  {
    category: 'deadline_expired',
    test: (hay) => hay.includes('DeadlineExpired'),
    message: () => 'Transaction expired — please try again',
  },
  {
    category: 'insufficient_funds',
    test: (hay) => hay.includes('insufficient') || hay.includes('ERC20'),
    message: (symbol) => `Not enough ${symbol} — top up or pick fewer pixels`,
  },
  // --- below here: previously all of these landed in `unknown` ---
  {
    // MiniPay's answer when viem asks it to estimate gas. Named explicitly
    // because it's the single most likely cause of the MiniPay failure
    // concentration, and it is indistinguishable from a chain revert today.
    category: 'permission_denied',
    test: (_hay, lower) => lower.includes('permission denied'),
    message: () => GENERIC_RETRY_MESSAGE,
  },
  {
    category: 'timeout',
    test: (_hay, lower) =>
      lower.includes('timed out') ||
      lower.includes('timeout') ||
      lower.includes('took too long to respond'),
    message: () => GENERIC_RETRY_MESSAGE,
  },
  {
    // Every marker here is a multi-word phrase describing a transport failure,
    // never a bare token that could appear in a URL. That distinction is the
    // whole rule: viem appends `Docs: https://viem.sh…` to any error with a
    // `docsPath` — which `writeContract`, `simulateContract` and
    // `estimateContractGas` all set — and `RpcRequestError` prepends
    // `URL: https://…`. A bare `http` match is therefore true for essentially
    // every viem error this hook can catch, and since this rule is ordered
    // ahead of `chain_revert` it would file real on-chain reverts as transport
    // blips, relabelling the generic bucket instead of splitting it.
    //
    // A bare `rpc` is the same trap from the other direction: the fallback
    // endpoints include `lb.drpc.org`, so the substring rides along in the URL
    // of any error routed through them.
    category: 'rpc',
    test: (_hay, lower) =>
      lower.includes('http request failed') ||
      lower.includes('rpc request failed') ||
      lower.includes('rpc endpoint') ||
      lower.includes('http client error') ||
      lower.includes('rate limit') ||
      lower.includes('failed to fetch') ||
      lower.includes('fetch failed') ||
      lower.includes('network error') ||
      lower.includes('status: 429') ||
      lower.includes('status: 5'),
    message: () => GENERIC_RETRY_MESSAGE,
  },
  {
    // Phrases again, not a bare `gas`: viem prints an `Estimate Gas Arguments`
    // block and transaction details carry `gas:` fields, so the bare token
    // appears in errors that have nothing to do with estimation.
    category: 'gas_estimate',
    test: (_hay, lower) =>
      lower.includes('estimate gas') ||
      lower.includes('intrinsic gas') ||
      lower.includes('out of gas') ||
      lower.includes('gas required exceeds') ||
      lower.includes('gas limit'),
    message: () => GENERIC_RETRY_MESSAGE,
  },
  {
    // Last before `unknown`, so it can stay broad — everything more specific
    // has already had its chance.
    category: 'chain_revert',
    test: (_hay, lower) => lower.includes('revert'),
    message: () => GENERIC_RETRY_MESSAGE,
  },
]

/**
 * Classify a non-rejection buy failure once, returning both halves: the short
 * user-facing line and the stable analysis bucket. Single pass so the message
 * and the category can never disagree about what went wrong.
 *
 * `hay` is the wallet message + unwrapped detail concatenated; `symbol` is the
 * pay token (e.g. "USDT"). Only the handful of reverts a player can actually
 * act on get a specific message. Everything else — transient RPC/provider
 * blips, wallet quirks, raw viem dumps — is meaningless to players and almost
 * always clears on retry, so it maps to one friendly "try again" line instead
 * of a technical dump. The raw error is still logged at the call site, and now
 * also travels to analytics as `category` + a truncated `detail`.
 */
export function classifyBuy(
  hay: string,
  symbol: string,
): { message: string; category: BuyErrorCategory } {
  const lower = hay.toLowerCase()
  for (const rule of RULES) {
    if (rule.test(hay, lower)) return { message: rule.message(symbol), category: rule.category }
  }
  return { message: GENERIC_RETRY_MESSAGE, category: 'unknown' }
}

/** Message-only view of {@link classifyBuy}, for call sites that only render. */
export function classifyBuyError(hay: string, symbol: string): string {
  return classifyBuy(hay, symbol).message
}

/** Category-only view of {@link classifyBuy}. The symbol never affects it. */
export function categorizeBuyError(hay: string): BuyErrorCategory {
  return classifyBuy(hay, '').category
}
