import { describe, it, expect } from 'vitest'
import {
  categorizeBuyError,
  classifyBuy,
  classifyBuyError,
  isUserRejectedError,
  GENERIC_RETRY_MESSAGE,
} from '@/lib/buyErrors'

describe('isUserRejectedError', () => {
  it('detects EIP-1193 code 4001 (top-level and nested cause)', () => {
    expect(isUserRejectedError({ code: 4001 }, '')).toBe(true)
    expect(isUserRejectedError({ cause: { code: 4001 } }, '')).toBe(true)
  })

  it('detects the common rejection phrasings', () => {
    for (const s of [
      'User rejected the request',
      'User denied transaction signature',
      'MetaMask Tx Signature: User rejected the request.',
      'ACTION_REJECTED',
    ]) {
      expect(isUserRejectedError(new Error(s), s)).toBe(true)
    }
  })

  it('does NOT treat a real failure as a rejection', () => {
    const s = 'The contract function "buyPixels" reverted: SlippageExceeded'
    expect(isUserRejectedError(new Error(s), s)).toBe(false)
    expect(isUserRejectedError({ code: -32000 }, 'insufficient funds')).toBe(false)
  })
})

describe('classifyBuyError', () => {
  it('maps the transient RPC HTTP error to the friendly retry line, not a raw dump', () => {
    // The exact error from the UK tester's screenshot: a transient RPC blip
    // that viem wraps as a "buyPixels reverted" HTTP client error.
    const hay =
      'The contract function "buyPixels" reverted with the following reason: ' +
      'RPC endpoint returned HTTP client error.'
    expect(classifyBuyError(hay, 'USDT')).toBe(GENERIC_RETRY_MESSAGE)
    expect(classifyBuyError(hay, 'USDT')).not.toContain('RPC')
    expect(classifyBuyError(hay, 'USDT')).not.toContain('HTTP')
  })

  it('keeps the actionable on-chain reverts specific', () => {
    expect(classifyBuyError('SlippageExceeded', 'USDT')).toMatch(/Price moved/)
    expect(classifyBuyError('NotLand', 'USDT')).toMatch(/not land/)
    expect(classifyBuyError('DeadlineExpired', 'USDT')).toMatch(/expired/)
    expect(classifyBuyError('TokenNotAccepted', 'USDC')).toContain('USDC')
    expect(classifyBuyError('ERC20: transfer amount exceeds balance', 'USDT')).toMatch(
      /Not enough USDT/,
    )
  })

  it('shows the friendly retry line for any unrecognized (technical) reason', () => {
    expect(classifyBuyError('some brand new low-level viem error 0xdeadbeef', 'USDT')).toBe(
      GENERIC_RETRY_MESSAGE,
    )
  })
})

describe('categorizeBuyError', () => {
  it('gives the actionable reverts their own category', () => {
    expect(categorizeBuyError('nonce too low')).toBe('nonce')
    expect(categorizeBuyError('reverted: NotLand')).toBe('not_land')
    expect(categorizeBuyError('reverted: TokenNotAccepted')).toBe('token_not_accepted')
    expect(categorizeBuyError('reverted: SlippageExceeded')).toBe('slippage')
    expect(categorizeBuyError('reverted: DeadlineExpired')).toBe('deadline_expired')
    expect(categorizeBuyError('ERC20: transfer amount exceeds balance')).toBe(
      'insufficient_funds',
    )
  })

  it('splits what used to collapse into the generic bucket', () => {
    // The whole point of the issue: these four are indistinguishable today
    // because they all render the same player-facing line.
    expect(categorizeBuyError('MiniPay: permission denied')).toBe('permission_denied')
    expect(categorizeBuyError('Request timed out after 30000ms')).toBe('timeout')
    expect(categorizeBuyError('intrinsic gas too low')).toBe('gas_estimate')
    expect(categorizeBuyError('execution reverted')).toBe('chain_revert')

    // ...while still showing every one of them the same friendly line.
    for (const hay of [
      'MiniPay: permission denied',
      'Request timed out after 30000ms',
      'intrinsic gas too low',
      'execution reverted',
    ]) {
      expect(classifyBuyError(hay, 'USDT')).toBe(GENERIC_RETRY_MESSAGE)
    }
  })

  it('matches the new categories regardless of case', () => {
    // MiniPay's wording is lowercase, viem's is not — neither should decide
    // whether a failure is counted.
    expect(categorizeBuyError('PERMISSION DENIED')).toBe('permission_denied')
    expect(categorizeBuyError('Execution Reverted')).toBe('chain_revert')
  })

  it('files a transient RPC blip as rpc, not as an on-chain revert', () => {
    // viem wraps provider hiccups as a "reverted" message. If chain_revert were
    // tested first, every Forno rate-limit would be miscounted as a contract
    // revert — which is the reading that would send someone to debug the
    // contract instead of the RPC.
    const hay =
      'The contract function "buyPixels" reverted with the following reason: ' +
      'RPC endpoint returned HTTP client error.'
    expect(categorizeBuyError(hay)).toBe('rpc')
  })

  it('keeps insufficient funds ahead of the gas rule', () => {
    // "insufficient funds for gas" contains both signals; the player-actionable
    // one has to win, or a top-up problem gets filed as an estimator problem.
    expect(categorizeBuyError('insufficient funds for gas * price + value')).toBe(
      'insufficient_funds',
    )
  })

  it('returns unknown only when nothing matched', () => {
    expect(categorizeBuyError('0xdeadbeef')).toBe('unknown')
    expect(categorizeBuyError('')).toBe('unknown')
  })

  it('never disagrees with the message it was classified alongside', () => {
    // classifyBuy is one pass, so the pair can't drift. Guard it anyway: a
    // category that contradicts the shown message would silently corrupt the
    // analysis this exists to enable.
    for (const hay of ['NotLand', 'SlippageExceeded', 'permission denied', '0xdeadbeef']) {
      const { message, category } = classifyBuy(hay, 'USDT')
      expect(message).toBe(classifyBuyError(hay, 'USDT'))
      expect(category).toBe(categorizeBuyError(hay))
    }
  })
})
