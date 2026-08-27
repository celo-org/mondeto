import { describe, it, expect } from 'vitest'
import {
  categorizeBuyError,
  classifyBuy,
  classifyBuyError,
  collectErrorText,
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

  it('files a real revert as chain_revert even inside a full viem envelope', () => {
    // The fixture that matters. viem appends `Docs: https://viem.sh…` to any
    // error with a docsPath — writeContract, simulateContract and
    // estimateContractGas all set one — so a bare `http` match would swallow
    // this and file a genuine on-chain revert as a transport blip. Bare
    // fragments like 'execution reverted' pass either way and prove nothing.
    const hay = [
      'The contract function "buyPixels" reverted.',
      '',
      'Error: NotEnoughSomething()',
      '  Contract Call:',
      '    address:   0x1234567890123456789012345678901234567890',
      '    function:  buyPixels(uint256[] ids, address token, uint256 maxTotalCost, uint256 deadline)',
      '    sender:    0x9876543210987654321098765432109876543210',
      '',
      'Docs: https://viem.sh/docs/contract/simulateContract',
      'Version: viem@2.21.0',
    ].join('\n')
    expect(categorizeBuyError(hay)).toBe('chain_revert')
  })

  it('files a genuine transport failure as rpc, envelope and all', () => {
    const hay = [
      'HTTP request failed.',
      '',
      'Status: 429',
      'URL: https://lb.drpc.org/ogrpc?network=celo',
      'Request body: {"method":"eth_call"}',
      '',
      'Details: Too Many Requests',
      'Version: viem@2.21.0',
    ].join('\n')
    expect(categorizeBuyError(hay)).toBe('rpc')
  })

  it('does not read the fallback RPC hostname as an RPC failure', () => {
    // `lb.drpc.org` carries the substring `rpc`, so a bare token match files
    // every error routed through the fallback endpoint as a transport problem.
    // Deliberately a revert with NO named error in the list above — otherwise
    // an earlier rule claims it and the fixture proves nothing either way.
    const hay = [
      'The contract function "buyPixels" reverted.',
      'Error: CustomErrorNobodyMapped()',
      'URL: https://lb.drpc.org/ogrpc?network=celo',
      'Version: viem@2.21.0',
    ].join('\n')
    expect(categorizeBuyError(hay)).toBe('chain_revert')
  })

  it('does not read a gas field in a revert envelope as an estimation failure', () => {
    // Again no named error: `gas: 300000` in the request arguments is what a
    // bare `gas` match would seize on, and `gas_estimate` is ordered ahead of
    // `chain_revert`.
    const hay = [
      'The contract function "buyPixels" reverted.',
      'Error: CustomErrorNobodyMapped()',
      '  Request Arguments:',
      '    gas:  300000',
      'Docs: https://viem.sh/docs/contract/writeContract',
    ].join('\n')
    expect(categorizeBuyError(hay)).toBe('chain_revert')
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

/**
 * Rule-ordering regression guard (asked for in review of #215).
 *
 * `RULES` is first-match-wins and its order is load-bearing. Feeding the
 * classifier strictly MORE text can only increase the chance an earlier rule
 * claims an error a later rule used to get, so widening the haystack makes that
 * ordering load-bearing in a way it was not before.
 *
 * This is not hypothetical in this repo — it is the documented failure: a
 * classifier once asserted on the bare fragment 'execution reverted', real
 * errors carried a docs URL that a different rule matched first, and real
 * reverts were filed as network errors with a fully green suite.
 *
 * So: realistic viem envelopes, each classified through the NARROW haystack the
 * hook used to pass and the WIDENED one it passes now. Any divergence is a
 * reclassification and fails here.
 */
describe('widening the haystack does not reclassify the original rules', () => {
  /** What the hook used to hand the classifier: the outer message only. */
  const narrow = (e: unknown) => String(e)
  /** What it hands the classifier now. */
  const widened = (e: unknown) => `${String(e)} ${collectErrorText(e)}`

  const CASES: Array<{ name: string; error: unknown; expected: string }> = [
    {
      name: 'rate-limited Forno read (the #215 case)',
      expected: 'rpc',
      error: Object.assign(new Error('HTTP request failed.'), {
        shortMessage: 'HTTP request failed.',
        cause: Object.assign(new Error('HTTP request failed.\n\nStatus: 429\nURL: https://forno.celo.org'), {
          shortMessage: 'HTTP request failed.',
          details: 'too many requests',
          status: 429,
        }),
      }),
    },
    {
      name: 'real ERC20 allowance revert during approve',
      expected: 'insufficient_funds',
      error: Object.assign(
        new Error('The contract function "buyPixels" reverted with the following reason:\nERC20: transfer amount exceeds allowance'),
        {
          shortMessage: 'The contract function "buyPixels" reverted.',
          cause: Object.assign(new Error('ERC20: transfer amount exceeds allowance'), {
            reason: 'ERC20: transfer amount exceeds allowance',
          }),
        },
      ),
    },
    {
      name: 'rate limit whose formatted Request Arguments carry a nonce',
      expected: 'nonce',
      error: Object.assign(new Error('HTTP request failed.'), {
        shortMessage: 'HTTP request failed.',
        cause: Object.assign(
          new Error('HTTP request failed.\n\nStatus: 429\n\nRequest Arguments:\n  from:   0x1234\n  nonce:  42'),
          { details: 'too many requests' },
        ),
      }),
    },
    {
      name: 'MiniPay permission denied on eth_estimateGas',
      expected: 'permission_denied',
      error: Object.assign(new Error('The requested method and/or account has not been authorized by the user.'), {
        shortMessage: 'Permission denied.',
        cause: Object.assign(new Error('permission denied'), { code: 4100 }),
      }),
    },
    {
      name: 'NotLand custom-error revert',
      expected: 'not_land',
      error: Object.assign(
        new Error('The contract function "buyPixels" reverted.\n\nError: NotLand(uint256 id)'),
        {
          shortMessage: 'The contract function "buyPixels" reverted.',
          cause: Object.assign(new Error('NotLand(uint256 id)'), { data: { errorName: 'NotLand' } }),
        },
      ),
    },
    {
      name: 'insufficient CELO for gas, wrapped',
      expected: 'insufficient_funds',
      error: Object.assign(new Error('The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.'), {
        shortMessage: 'Insufficient funds.',
        cause: Object.assign(new Error('insufficient funds for gas * price + value'), { code: -32000 }),
      }),
    },
  ]

  for (const { name, error, expected } of CASES) {
    it(`${name} — classifies as ${expected}`, () => {
      expect(categorizeBuyError(widened(error))).toBe(expected)
    })
  }

  /**
   * The invariant that actually matters. `unknown -> named` is the entire point
   * of widening and must stay allowed; `named -> a DIFFERENT named category` is
   * the regression, because it means an earlier rule started claiming an error a
   * later rule used to get.
   */
  it('widening never moves an error between two different named categories', () => {
    const migrations = CASES.map(({ name, error }) => ({
      name,
      before: categorizeBuyError(narrow(error)),
      after: categorizeBuyError(widened(error)),
    })).filter((r) => r.before !== 'unknown' && r.before !== r.after)

    // KNOWN, pre-existing, and NOT caused by widening the haystack: a rate
    // limit whose formatted Request Arguments happen to contain a nonce is
    // claimed by rule 1 (`nonce`) before rule 9 (`rpc`) can see it, so the
    // player is told "Nonce error — please try again in a few seconds" for what
    // is really a rate limit. Raised in review as reachability-unverified: the
    // fixture is constructed and no real viem error proving the nonce token
    // appears in a rate-limited buy has been captured. Pinned here so it is a
    // known quantity rather than a surprise, and so that if the ordering is ever
    // changed deliberately this test says so.
    expect(migrations.map((m) => `${m.name}: ${m.before} -> ${m.after}`)).toEqual([
      'rate limit whose formatted Request Arguments carry a nonce: rpc -> nonce',
    ])
  })

  it('the widened haystack really is wider — otherwise the pairs above are vacuous', () => {
    // Control. If collectErrorText returned nothing, every assertion above
    // would compare a string to itself and pass against a broken widening.
    const rateLimited = CASES[0].error
    expect(widened(rateLimited).length).toBeGreaterThan(narrow(rateLimited).length)
    expect(collectErrorText(rateLimited)).toContain('too many requests')
    // And the widening is what rescues this case from `unknown`.
    expect(categorizeBuyError(narrow(rateLimited))).not.toBe('unknown')
  })
})
