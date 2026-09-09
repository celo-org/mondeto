import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuyPixels } from '@/hooks/useBuyPixels'
import { OVER_SPEND_CAP_MESSAGE, PRICE_MOVED_MESSAGE } from '@/lib/buyLimits'
import { GENERIC_RETRY_MESSAGE } from '@/lib/buyErrors'

// Knob-driven doubles, hoisted above the vi.mock factories (which are
// themselves hoisted). Every knob is reset in beforeEach so each test starts
// from the same defaults: wallet on Celo, $1 live price, PRICE_DECIMALS=6,
// a $10 standing allowance (so the approve step is skipped unless a test
// lowers it), gas estimates working, receipts succeeding.
const h = vi.hoisted(() => {
  const preferredUSDC = {
    address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as `0x${string}`,
    decimals: 6,
    symbol: 'USDC',
    raw: 1_000_000_000n,
    formatted: '1000',
    amount: 1000,
  }
  return {
    writeContractAsync: vi.fn(),
    switchChainAsync: vi.fn(),
    estimateContractGas: vi.fn(),
    simulateContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    track: vi.fn(),
    livePrice: { micros: 1_000_000n },
    allowance: { value: 10_000_000n },
    account: { chainId: 42220 }, // celo.id — no switch needed by default
    preferred: { value: preferredUSDC as typeof preferredUSDC | null },
    preferredUSDC,
  }
})

const BUY_HASH = '0x2a1b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809'
const APPROVE_HASH = '0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31'

vi.mock('wagmi', () => ({
  useAccount: () => ({
    chainId: h.account.chainId,
    address: '0x1234567890123456789012345678901234567890',
  }),
  useSwitchChain: () => ({ switchChainAsync: h.switchChainAsync }),
  useWriteContract: () => ({
    writeContractAsync: h.writeContractAsync,
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
  }),
  useWaitForTransactionReceipt: () => ({ isSuccess: false, error: null }),
  usePublicClient: () => ({
    readContract: vi.fn((args: { functionName: string }) => {
      switch (args.functionName) {
        case 'selectionPrice': return Promise.resolve(h.livePrice.micros)
        case 'PRICE_DECIMALS': return Promise.resolve(6)
        case 'allowance': return Promise.resolve(h.allowance.value)
        default: return Promise.resolve(0n)
      }
    }),
    estimateContractGas: (args: unknown) => h.estimateContractGas(args),
    waitForTransactionReceipt: (args: unknown) => h.waitForTransactionReceipt(args),
    simulateContract: (args: unknown) => h.simulateContract(args),
  }),
  // useStablecoinBalance is mocked below, but keep these harmless in case a
  // future refactor pulls wagmi reads back into this tree.
  useBalance: () => ({ data: undefined, isLoading: false }),
  useReadContract: () => ({ data: [], isLoading: false }),
  useReadContracts: () => ({ data: [], isLoading: false }),
}))

// A preferred stablecoin so execute() passes the "no balance" guard; knob-able
// so the no-balance branch can be tested too.
vi.mock('@/hooks/useStablecoinBalance', () => ({
  useStablecoinBalance: () => ({
    preferred: h.preferred.value,
    totalAmount: 1000,
    isLoading: false,
  }),
}))

// Keep analytics inert — and assertable: the funnel events are part of the
// hook's contract (started / rejected / failed / succeeded). The pre-wallet
// guards fire before pixel_buy_started, so "it blocked" is only half of what
// needs proving — the emission that keeps the block visible is the other half.
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => h.track(...args),
  getReferrer: () => undefined,
}))

beforeEach(() => {
  h.writeContractAsync.mockReset()
  h.writeContractAsync
    .mockResolvedValueOnce(BUY_HASH)
    .mockResolvedValue(APPROVE_HASH)
  h.switchChainAsync.mockReset()
  h.switchChainAsync.mockResolvedValue(undefined)
  h.estimateContractGas.mockReset()
  h.estimateContractGas.mockResolvedValue(100_000n)
  h.waitForTransactionReceipt.mockReset()
  h.waitForTransactionReceipt.mockResolvedValue({ status: 'success' })
  h.simulateContract.mockReset()
  h.simulateContract.mockResolvedValue({})
  h.track.mockReset()
  h.livePrice.micros = 1_000_000n
  h.allowance.value = 10_000_000n
  h.account.chainId = 42220
  h.preferred.value = h.preferredUSDC
})

afterEach(() => {
  vi.useRealTimers()
})

const buyCalls = () =>
  h.writeContractAsync.mock.calls.filter(
    (c) => (c[0] as { functionName: string }).functionName === 'buyPixels',
  )
const approveCalls = () =>
  h.writeContractAsync.mock.calls.filter(
    (c) => (c[0] as { functionName: string }).functionName === 'approve',
  )
const trackedEvents = (name: string) =>
  h.track.mock.calls.filter((c) => c[0] === name)

/* ------------------------------------------------------------------ *
 * Realistic viem error fixtures — the shapes wagmi's writeContractAsync
 * actually rejects with (top-level wrapper + nested cause), captured from
 * viem v2. The classifier matches on the unwrapped detail, so bare
 * fragments would not exercise the real path.
 * ------------------------------------------------------------------ */

function userRejectedError() {
  const cause = Object.assign(
    new Error(
      'User rejected the request.\n\nDetails: MetaMask Tx Signature: User denied transaction signature.\nVersion: viem@2.21.19',
    ),
    {
      name: 'UserRejectedRequestError',
      code: 4001,
      details: 'MetaMask Tx Signature: User denied transaction signature.',
      shortMessage: 'User rejected the request.',
    },
  )
  return Object.assign(
    new Error(
      'User rejected the request.\n\nRequest Arguments:\n  from:  0x1234567890123456789012345678901234567890\n  to:    0xcebA9300f2b948710d2653dD7B07f33A8B32118C\n  data:  0x095ea7b3…\n\nVersion: viem@2.21.19',
    ),
    {
      name: 'TransactionExecutionError',
      shortMessage: 'User rejected the request.',
      cause,
    },
  )
}

function erc20BalanceRevertError() {
  const cause = Object.assign(
    new Error(
      'execution reverted: ERC20: transfer amount exceeds balance\n\nVersion: viem@2.21.19',
    ),
    {
      name: 'ContractFunctionRevertedError',
      details: 'execution reverted: ERC20: transfer amount exceeds balance',
      shortMessage:
        'The contract function "buyPixels" reverted with the following reason:\nERC20: transfer amount exceeds balance',
    },
  )
  return Object.assign(
    new Error(
      'The contract function "buyPixels" reverted with the following reason:\nERC20: transfer amount exceeds balance\n\nContract Call:\n  address:   0x8ce50f0f76c592c542a5e349e2ae3c471cf9dc0f\n  function:  buyPixels(uint256[] ids, address token, uint256 maxTotalCost, uint256 deadline)\n\nDocs: https://viem.sh/docs/contract/writeContract\nVersion: viem@2.21.19',
    ),
    {
      name: 'ContractFunctionExecutionError',
      shortMessage:
        'The contract function "buyPixels" reverted with the following reason:\nERC20: transfer amount exceeds balance',
      cause,
    },
  )
}

function httpBlipError() {
  const cause = Object.assign(
    new Error(
      'HTTP request failed.\n\nStatus: 429\nURL: https://forno.celo.org\nRequest body: {"method":"eth_sendRawTransaction"}\n\nVersion: viem@2.21.19',
    ),
    {
      name: 'HttpRequestError',
      details: 'too many requests',
      shortMessage: 'HTTP request failed.',
      status: 429,
    },
  )
  return Object.assign(
    new Error(
      'An unknown RPC error occurred.\n\nRequest Arguments:\n  from:  0x1234567890123456789012345678901234567890\n\nVersion: viem@2.21.19',
    ),
    {
      name: 'TransactionExecutionError',
      shortMessage: 'An unknown RPC error occurred.',
      cause,
    },
  )
}

function slippageSimulationError() {
  return Object.assign(
    new Error(
      'The contract function "buyPixels" reverted.\n\nError: SlippageExceeded()\n\nContract Call:\n  address:   0x8ce50f0f76c592c542a5e349e2ae3c471cf9dc0f\n  function:  buyPixels(uint256[] ids, address token, uint256 maxTotalCost, uint256 deadline)\n\nVersion: viem@2.21.19',
    ),
    {
      name: 'ContractFunctionExecutionError',
      shortMessage: 'The contract function "buyPixels" reverted.',
    },
  )
}

describe('useBuyPixels idle-state helpers', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useBuyPixels())
    expect(result.current.step).toBe('idle')
    expect(result.current.txHash).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.insufficientBalance).toBe(false)
  })

  it('checkBalance detects sufficient funds', () => {
    const { result } = renderHook(() => useBuyPixels())
    act(() => { result.current.checkBalance(100000n, 500000n) })
    expect(result.current.insufficientBalance).toBe(false)
  })

  it('checkBalance detects insufficient funds', () => {
    const { result } = renderHook(() => useBuyPixels())
    act(() => { result.current.checkBalance(1000000n, 500000n) })
    expect(result.current.insufficientBalance).toBe(true)
  })

  it('reset clears all state', () => {
    const { result } = renderHook(() => useBuyPixels())
    act(() => { result.current.checkBalance(1000000n, 500000n) })
    expect(result.current.insufficientBalance).toBe(true)
    act(() => { result.current.reset() })
    expect(result.current.step).toBe('idle')
    expect(result.current.insufficientBalance).toBe(false)
  })
})

describe('useBuyPixels spend-cap gates', () => {
  it('blocks a purchase over the $10 cap before opening the wallet', async () => {
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 11_000_000n) // $11 — over the $10 cap
    })
    expect(result.current.step).toBe('error')
    expect(result.current.error).toBe(OVER_SPEND_CAP_MESSAGE)
    // Never reached the approve/buy writes.
    expect(h.writeContractAsync).not.toHaveBeenCalled()

    // The guard has to be *counted*, not just enforced: it fires before
    // `pixel_buy_started`, so without this event the attempt is invisible in
    // the funnel — not merely missing a failure, but absent from the denominator.
    expect(h.track).toHaveBeenCalledWith(
      'pixel_buy_blocked',
      expect.objectContaining({ reason: 'over_spend_cap' }),
    )
    // And it must not double as a failure: a `pixel_buy_failed` with no matching
    // `pixel_buy_started` would corrupt the very funnel this exists to keep clean.
    expect(h.track).not.toHaveBeenCalledWith('pixel_buy_failed', expect.anything())
    expect(h.track).not.toHaveBeenCalledWith('pixel_buy_started', expect.anything())
  })

  it('blocks with a "prices moved" nudge when the live price tips a sub-$10 pick over the cap', async () => {
    // Picked at $9.90 (clears the instant guard), but by buy time the live
    // price is $10 — the +2% approval buffer now tops the $10 cap.
    h.livePrice.micros = 10_000_000n
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 9_900_000n)
    })
    expect(result.current.step).toBe('error')
    expect(result.current.error).toBe(PRICE_MOVED_MESSAGE)
    expect(h.writeContractAsync).not.toHaveBeenCalled()
  })
})

describe('useBuyPixels buy flow', () => {
  it('completes a buy on a standing allowance without a fresh approval', async () => {
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([7, 8], 2_000_000n)
    })
    expect(result.current.step).toBe('success')
    expect(result.current.error).toBeNull()
    expect(result.current.txHash).toBe(BUY_HASH)
    // The $10 standing allowance already covers the buffered price, so the
    // wallet is opened exactly once — for the buy.
    expect(approveCalls()).toHaveLength(0)
    expect(buyCalls()).toHaveLength(1)
    const buyArgs = buyCalls()[0][0] as {
      args: [bigint[], string, bigint, bigint]
      gas?: bigint
    }
    expect(buyArgs.args[0]).toEqual([7n, 8n])
    expect(buyArgs.args[1]).toBe(h.preferredUSDC.address)
    // Slippage ceiling recomputed independently: $1 quote + 2% = 1_020_000
    // micro-USD, in the contract's own PRICE_DECIMALS units.
    expect(buyArgs.args[2]).toBe(1_020_000n)
    // Deadline is a future unix timestamp (default window: 20 minutes).
    const nowSec = BigInt(Math.floor(Date.now() / 1000))
    expect(buyArgs.args[3]).toBeGreaterThan(nowSec)
    expect(buyArgs.args[3]).toBeLessThanOrEqual(nowSec + 1_201n)
    // Explicit gas limit always passed: estimate padded by 20%.
    expect(buyArgs.gas).toBe(120_000n)
    expect(trackedEvents('pixel_buy_started')).toHaveLength(1)
    expect(trackedEvents('pixel_buy_succeeded')).toHaveLength(1)
  })

  it('approves the flat $10 allowance first when the standing allowance is short', async () => {
    h.allowance.value = 0n
    // First write is now the approve, second the buy.
    h.writeContractAsync.mockReset()
    h.writeContractAsync
      .mockResolvedValueOnce(APPROVE_HASH)
      .mockResolvedValueOnce(BUY_HASH)
    vi.useFakeTimers()
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      const p = result.current.execute([1], 1_000_000n)
      // The approve path parks 3s waiting for the nonce to settle; drive fake
      // time until the whole flow resolves.
      await vi.runAllTimersAsync()
      await vi.runAllTimersAsync()
      await p
    })
    expect(approveCalls()).toHaveLength(1)
    const approveArgs = approveCalls()[0][0] as { args: [string, bigint] }
    // Approves the flat $10 standing cap (not the exact price) so repeat buys
    // skip the prompt — and never a single wei above the cap.
    expect(approveArgs.args[1]).toBe(10_000_000n)
    expect(buyCalls()).toHaveLength(1)
    expect(result.current.step).toBe('success')
    expect(trackedEvents('pixel_buy_approve_shown')).toHaveLength(1)
  })

  it('skips the approve-shown funnel event when the allowance already covers (control)', async () => {
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    expect(result.current.step).toBe('success')
    expect(trackedEvents('pixel_buy_approve_shown')).toHaveLength(0)
    // Control that events flow at all on this run:
    expect(trackedEvents('pixel_buy_started')).toHaveLength(1)
  })

  it('ignores a second tap while a buy is in flight (double-spend guard)', async () => {
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      const first = result.current.execute([1], 1_000_000n)
      const second = result.current.execute([2], 1_000_000n)
      await Promise.all([first, second])
    })
    // One sequence only: one funnel start, one wallet write.
    expect(trackedEvents('pixel_buy_started')).toHaveLength(1)
    expect(buyCalls()).toHaveLength(1)
  })

  it('allows a second buy after the first completes (control for the guard)', async () => {
    h.writeContractAsync.mockReset()
    h.writeContractAsync.mockResolvedValue(BUY_HASH)
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    await act(async () => {
      await result.current.execute([2], 1_000_000n)
    })
    expect(trackedEvents('pixel_buy_started')).toHaveLength(2)
    expect(buyCalls()).toHaveLength(2)
  })

  it('blocks with a clear message when the wallet refuses to switch to Celo', async () => {
    h.account.chainId = 1 // wallet parked on Ethereum
    h.switchChainAsync.mockRejectedValue(userRejectedError())
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    expect(result.current.step).toBe('error')
    expect(result.current.error).toBe('Switch your wallet to the Celo network to buy.')
    expect(h.writeContractAsync).not.toHaveBeenCalled()
    // A decline is a user choice, filed as such — see the sibling test for the
    // wallet-can't-add-Celo case, which must NOT collapse into this reason.
    expect(h.track).toHaveBeenCalledWith(
      'pixel_buy_blocked',
      expect.objectContaining({ reason: 'chain_switch_rejected' }),
    )
    expect(trackedEvents('pixel_buy_started')).toHaveLength(0)
    expect(trackedEvents('pixel_buy_failed')).toHaveLength(0)
    // The guard is released — a retry (with the switch now accepted) proceeds.
    h.switchChainAsync.mockResolvedValue(undefined)
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    expect(result.current.step).toBe('success')
  })

  it('files a wallet that cannot add Celo as a failure, not a rejection', async () => {
    // The actionable half of the split at useBuyPixels.ts:128 — a wallet that
    // errors on wallet_addEthereumChain is a compatibility problem we can fix,
    // while a decline is not. If both landed on `chain_switch_rejected` the
    // actionable one would be buried in the larger bucket.
    h.account.chainId = 1
    h.switchChainAsync.mockRejectedValue(new Error('Unrecognized chain ID "0xa4ec".'))
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    expect(result.current.step).toBe('error')
    expect(h.track).toHaveBeenCalledWith(
      'pixel_buy_blocked',
      expect.objectContaining({ reason: 'chain_switch_failed' }),
    )
    expect(h.track).not.toHaveBeenCalledWith(
      'pixel_buy_blocked',
      expect.objectContaining({ reason: 'chain_switch_rejected' }),
    )
  })

  it('blocks with a top-up message when there is no stablecoin balance', async () => {
    h.preferred.value = null
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    expect(result.current.step).toBe('error')
    expect(result.current.error).toBe('No stablecoin balance — top up before buying.')
    expect(h.writeContractAsync).not.toHaveBeenCalled()
    expect(trackedEvents('pixel_buy_started')).toHaveLength(0)
    // Same argument as the over-cap guard: enforcing it is half the job, and
    // the attempt is invisible in the funnel without the emission.
    expect(h.track).toHaveBeenCalledWith(
      'pixel_buy_blocked',
      expect.objectContaining({ reason: 'no_stablecoin_balance' }),
    )
    // This guard fires before `token` is known, so the event must not claim one.
    const blocked = trackedEvents('pixel_buy_blocked')[0][1] as Record<string, unknown>
    expect(blocked).not.toHaveProperty('token')
    expect(trackedEvents('pixel_buy_failed')).toHaveLength(0)
  })
})

describe('useBuyPixels error handling', () => {
  it('treats a wallet rejection as a silent no-op — back to idle, no red error', async () => {
    h.writeContractAsync.mockReset()
    h.writeContractAsync.mockRejectedValue(userRejectedError())
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    expect(result.current.step).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(trackedEvents('pixel_buy_rejected')).toHaveLength(1)
    expect(trackedEvents('pixel_buy_failed')).toHaveLength(0)
  })

  it('maps an ERC20 balance revert to a human "not enough" line naming the token', async () => {
    h.writeContractAsync.mockReset()
    h.writeContractAsync.mockRejectedValue(erc20BalanceRevertError())
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    expect(result.current.step).toBe('error')
    expect(result.current.error).toBe('Not enough USDC — top up or pick fewer pixels')
    expect(trackedEvents('pixel_buy_failed')).toHaveLength(1)
    // Control for the silent-rejection case: a real failure is NOT idle.
    expect(trackedEvents('pixel_buy_rejected')).toHaveLength(0)
    // `reason` is copy and moves with copy edits; `category` is the stable
    // discriminator analysis segments on. buyErrors.test.ts proves the
    // classifier picks it — this proves the hook actually *sends* it.
    expect(trackedEvents('pixel_buy_failed')[0][1]).toMatchObject({
      category: 'insufficient_funds',
      token: 'USDC',
    })
  })

  it('maps a transient RPC blip to the generic try-again line, never a raw dump', async () => {
    h.writeContractAsync.mockReset()
    h.writeContractAsync.mockRejectedValue(httpBlipError())
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    expect(result.current.step).toBe('error')
    expect(result.current.error).toBe(GENERIC_RETRY_MESSAGE)
    // The player never sees viem internals.
    expect(result.current.error).not.toMatch(/viem|RPC|0x/)
    // A transport blip and an on-chain revert both show this same line, so the
    // event is the only thing that can tell them apart. `rpc`, not
    // `chain_revert`: viem wraps this one as "An unknown RPC error occurred"
    // whose cause is an HTTP 429.
    expect(trackedEvents('pixel_buy_failed')[0][1]).toMatchObject({
      reason: GENERIC_RETRY_MESSAGE,
      category: 'rpc',
    })
  })

  it('sends the unwrapped raw detail, truncated, so `unknown` can be read not guessed', async () => {
    // A revert reason far longer than the 100-char cap, to prove the cap binds.
    const long = `execution reverted: ${'E'.repeat(400)}`
    const cause = Object.assign(new Error(long), {
      name: 'ContractFunctionRevertedError',
      details: long,
    })
    h.writeContractAsync.mockReset()
    h.writeContractAsync.mockRejectedValue(
      Object.assign(new Error('An unknown RPC error occurred.'), {
        name: 'TransactionExecutionError',
        cause,
      }),
    )
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    const props = trackedEvents('pixel_buy_failed')[0][1] as { detail: string }
    expect(props.detail).toHaveLength(100)
    // The *unwrapped* cause, not the top-level "An unknown RPC error occurred"
    // wrapper — that wrapper is what made half of these unreadable.
    expect(props.detail.startsWith('execution reverted: ')).toBe(true)
  })

  it('surfaces the simulated revert reason when the receipt comes back reverted', async () => {
    h.waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' })
    h.simulateContract.mockRejectedValue(slippageSimulationError())
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    expect(result.current.step).toBe('error')
    // SlippageExceeded() from the re-simulation classifies to the price-moved line.
    expect(result.current.error).toBe(
      'Price moved above your limit — please review and try again',
    )
  })

})

/* ------------------------------------------------------------------ *
 * Gas-estimate fallbacks.
 *
 * These rungs decide whether a transaction goes out with an explicit gas
 * limit, and in MiniPay a gas-less send is fatal — the wallet runs its own
 * eth_estimateGas and answers "permission denied". `pixel_buy_gas_fallback`
 * is the only signal that a buy dropped to a cruder estimate, so each rung
 * needs its own assertion; a single "it emitted something" test would pass
 * against code that reports the wrong rung.
 *
 * MiniPay is selected the way the app selects it — `window.ethereum.isMiniPay`,
 * read by getFeeCurrency() — rather than by mocking our own module, so these
 * exercise the real feeCurrency branch.
 * ------------------------------------------------------------------ */
describe('useBuyPixels gas-estimate fallbacks', () => {
  type EthWindow = { ethereum?: { isMiniPay?: boolean } }

  const enterMiniPay = () => {
    ;(window as unknown as EthWindow).ethereum = { isMiniPay: true }
  }

  afterEach(() => {
    delete (window as unknown as EthWindow).ethereum
  })

  // MiniPay's actual answer when it is asked to estimate gas itself.
  const permissionDenied = () =>
    Object.assign(new Error('An unknown RPC error occurred.'), {
      name: 'RpcRequestError',
      cause: Object.assign(new Error('permission denied'), {
        details: 'permission denied',
      }),
    })

  const gasFallbacks = () =>
    h.track.mock.calls
      .filter((c) => c[0] === 'pixel_buy_gas_fallback')
      .map((c) => c[1] as { stage: string; level: string; detail: string })

  const buyGasArg = () => (buyCalls()[0][0] as { gas?: bigint }).gas

  it('reports the buy-stage retry rung when the CIP-64 estimate fails in MiniPay', async () => {
    enterMiniPay()
    // Fails only while a feeCurrency is attached; the plain retry succeeds.
    h.estimateContractGas.mockImplementation((args: { feeCurrency?: string }) =>
      args.feeCurrency ? Promise.reject(permissionDenied()) : Promise.resolve(100_000n),
    )
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    expect(result.current.step).toBe('success')
    expect(gasFallbacks()).toEqual([
      expect.objectContaining({ stage: 'buy', level: 'without_fee_currency' }),
    ])
    // The unwrapped cause, so the MiniPay tell is legible in PostHog rather
    // than 100 chars of viem's "unknown RPC error" boilerplate.
    expect(gasFallbacks()[0].detail).toBe('permission denied')
    // Retry estimate padded by 20% + the CIP-64 intrinsic overhead — the buy
    // still goes out, and it goes out WITH a limit. That is the whole point.
    expect(buyGasArg()).toBe(220_000n)
  })

  it('reports both rungs, ceiling last, when the retry fails too', async () => {
    enterMiniPay()
    h.estimateContractGas.mockRejectedValue(permissionDenied())
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1, 2], 2_000_000n)
    })
    expect(result.current.step).toBe('success')
    expect(gasFallbacks().map((e) => `${e.stage}:${e.level}`)).toEqual([
      'buy:without_fee_currency',
      'buy:ceiling',
    ])
    // Order is load-bearing: analytics.ts documents `ceiling` as a strict
    // subset of `without_fee_currency`, and sizing the MiniPay hazard by
    // summing raw events depends on that nesting holding.
    expect(buyGasArg()).toBe(300_000n + 2n * 80_000n)
  })

  it('reports the approve stage separately from the buy stage', async () => {
    enterMiniPay()
    h.allowance.value = 0n // force a fresh approval
    h.writeContractAsync.mockReset()
    h.writeContractAsync
      .mockResolvedValueOnce(APPROVE_HASH)
      .mockResolvedValueOnce(BUY_HASH)
    h.estimateContractGas.mockImplementation((args: { feeCurrency?: string }) =>
      args.feeCurrency ? Promise.reject(permissionDenied()) : Promise.resolve(100_000n),
    )
    vi.useFakeTimers()
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      const p = result.current.execute([1], 1_000_000n)
      await vi.runAllTimersAsync()
      await vi.runAllTimersAsync()
      await p
    })
    expect(result.current.step).toBe('success')
    // Both stages fall back, and they are distinguishable — without `stage` an
    // approve-wall problem and a buy problem would be one undifferentiated count.
    expect(gasFallbacks().map((e) => `${e.stage}:${e.level}`)).toEqual([
      'approve:without_fee_currency',
      'buy:without_fee_currency',
    ])
    const approveGas = (approveCalls()[0][0] as { gas?: bigint }).gas
    expect(approveGas).toBe(180_000n)
  })

  it('reports a failed estimate outside MiniPay, where the send has no gas limit at all', async () => {
    // No window.ethereum.isMiniPay -> getFeeCurrency() returns undefined, so
    // there is no retry rung to fall to: the estimate fails and the tx goes out
    // with no `gas` field. That is a strictly worse outcome than either MiniPay
    // rung, and it was the one path emitting nothing.
    h.estimateContractGas.mockRejectedValue(
      Object.assign(new Error('An unknown RPC error occurred.'), {
        name: 'HttpRequestError',
        cause: Object.assign(new Error('HTTP request failed.'), {
          details: 'gateway timeout',
        }),
      }),
    )
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    expect(result.current.step).toBe('success')
    // Control: the send really did go out unbounded — this is not a test of a
    // path that never ran.
    expect(buyCalls()).toHaveLength(1)
    expect(buyGasArg()).toBeUndefined()
    expect(gasFallbacks()).toEqual([
      expect.objectContaining({ stage: 'buy', level: 'no_gas_limit' }),
    ])
    expect(gasFallbacks()[0].detail).toBe('gateway timeout')
  })

  it('emits nothing when the estimate succeeds (control)', async () => {
    enterMiniPay()
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 1_000_000n)
    })
    expect(result.current.step).toBe('success')
    // Pairs with the four assertions above: they only mean something if the
    // happy path is silent. The estimate mock resolves by default here, and
    // the buy still carries an explicit limit.
    expect(gasFallbacks()).toEqual([])
    expect(buyGasArg()).toBe(120_000n)
  })
})
