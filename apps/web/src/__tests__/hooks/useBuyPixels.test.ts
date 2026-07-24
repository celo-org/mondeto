import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuyPixels } from '@/hooks/useBuyPixels'
import { OVER_SPEND_CAP_MESSAGE, PRICE_MOVED_MESSAGE } from '@/lib/buyLimits'

// Shared, stable write mock so the cap tests can assert the wallet is never
// opened. Hoisted above the vi.mock factory (which is itself hoisted). The
// live on-chain price (in PRICE_DECIMALS units) is a hoisted knob so the
// price-moved test can drive selectionPrice past the $10 cap.
const { writeContractAsync, livePrice } = vi.hoisted(() => ({
  writeContractAsync: vi.fn(),
  livePrice: { micros: 1_000_000n }, // $1 by default (well under the cap)
}))

vi.mock('wagmi', () => ({
  useAccount: () => ({ chain: { id: 44787 }, address: '0x1234567890123456789012345678901234567890' }),
  // useBuyPixels switches the wallet to Celo before touching funds (#154);
  // stub it so the hook mounts in tests.
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
  useWriteContract: () => ({
    writeContractAsync,
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
  }),
  useWaitForTransactionReceipt: () => ({
    isSuccess: false,
    error: null,
  }),
  usePublicClient: () => ({
    // Answer per read so execute() can reach the on-chain cap guard: price in
    // 6-decimal units, PRICE_DECIMALS=6, and a zero standing allowance.
    readContract: vi.fn((args: { functionName: string }) => {
      switch (args.functionName) {
        case 'selectionPrice': return Promise.resolve(livePrice.micros)
        case 'PRICE_DECIMALS': return Promise.resolve(6)
        case 'allowance': return Promise.resolve(0n)
        default: return Promise.resolve(0n)
      }
    }),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' }),
    simulateContract: vi.fn(),
  }),
  // useStablecoinBalance now reads accepted tokens via wagmi multicall;
  // stub the relevant hooks so it returns preferred=null. We only test
  // idle-state helpers below; the execute() path is exercised via
  // integration.
  useBalance: () => ({ data: undefined, isLoading: false }),
  useReadContract: () => ({ data: [], isLoading: false }),
  useReadContracts: () => ({ data: [], isLoading: false }),
}))

// A preferred stablecoin so execute() passes the "no balance" guard and reaches
// the spend-cap check. The idle-state tests below don't depend on this.
vi.mock('@/hooks/useStablecoinBalance', () => ({
  useStablecoinBalance: () => ({
    preferred: {
      address: '0x0000000000000000000000000000000000000001',
      decimals: 6,
      symbol: 'USDC',
      amount: 1000,
    },
    totalAmount: 1000,
    isLoading: false,
  }),
}))

// Keep analytics inert — the execute() path fires funnel events we don't want
// hitting PostHog in unit tests.
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), getReferrer: () => undefined }))

describe('useBuyPixels', () => {
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

  it('blocks a purchase over the $10 cap before opening the wallet', async () => {
    writeContractAsync.mockClear()
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 11_000_000n) // $11 — over the $10 cap
    })
    expect(result.current.step).toBe('error')
    expect(result.current.error).toBe(OVER_SPEND_CAP_MESSAGE)
    // Never reached the approve/buy writes.
    expect(writeContractAsync).not.toHaveBeenCalled()
  })

  it('blocks with a "prices moved" nudge when the live price tips a sub-$10 pick over the cap', async () => {
    writeContractAsync.mockClear()
    // Picked at $9.90 (clears the instant guard), but by buy time the live
    // price is $10 — the +2% approval buffer now tops the $10 cap.
    livePrice.micros = 10_000_000n
    const { result } = renderHook(() => useBuyPixels(0))
    await act(async () => {
      await result.current.execute([1], 9_900_000n)
    })
    livePrice.micros = 1_000_000n // restore for any later tests
    expect(result.current.step).toBe('error')
    expect(result.current.error).toBe(PRICE_MOVED_MESSAGE)
    expect(writeContractAsync).not.toHaveBeenCalled()
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
