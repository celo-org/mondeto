import { describe, it, expect } from 'vitest'
import { classifyBuyError, isUserRejectedError } from '@/lib/buyErrors'

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
  it('maps a transient RPC HTTP error to a retry nudge, not a raw dump', () => {
    // The exact class of error from the UK tester's screenshot: a transient
    // RPC blip that viem wraps as a "buyPixels reverted" HTTP client error.
    const hay =
      'The contract function "buyPixels" reverted with the following reason: ' +
      'RPC endpoint returned HTTP client error.'
    expect(classifyBuyError(hay, hay, 'USDT')).toBe('Network hiccup — tap buy again in a moment')
  })

  it('covers other transient network phrasings', () => {
    for (const s of ['HTTP request failed', 'fetch failed', 'Failed to fetch', 'request timed out']) {
      expect(classifyBuyError(s, s, 'USDT')).toBe('Network hiccup — tap buy again in a moment')
    }
  })

  it('keeps specific on-chain reverts ahead of the network catch-all', () => {
    expect(classifyBuyError('SlippageExceeded', 'x', 'USDT')).toMatch(/Price moved/)
    expect(classifyBuyError('NotLand', 'x', 'USDT')).toMatch(/not land/)
    expect(classifyBuyError('DeadlineExpired', 'x', 'USDT')).toMatch(/expired/)
    expect(classifyBuyError('TokenNotAccepted', 'x', 'USDC')).toContain('USDC')
    expect(classifyBuyError('ERC20: transfer amount exceeds balance', 'x', 'USDT')).toContain(
      'Insufficient USDT',
    )
  })

  it('falls back to the unwrapped detail for an unrecognized reason', () => {
    expect(classifyBuyError('some brand new revert', 'PixelAlreadyClaimed()', 'USDT')).toBe(
      'PixelAlreadyClaimed()',
    )
  })
})
