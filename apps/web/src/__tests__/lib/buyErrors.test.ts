import { describe, it, expect } from 'vitest'
import { classifyBuyError, isUserRejectedError, GENERIC_RETRY_MESSAGE } from '@/lib/buyErrors'

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
    expect(classifyBuyError('ERC20: transfer amount exceeds balance', 'USDT')).toContain(
      'Insufficient USDT',
    )
  })

  it('shows the friendly retry line for any unrecognized (technical) reason', () => {
    expect(classifyBuyError('some brand new low-level viem error 0xdeadbeef', 'USDT')).toBe(
      GENERIC_RETRY_MESSAGE,
    )
  })
})
