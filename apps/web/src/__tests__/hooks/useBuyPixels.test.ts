import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuyPixels } from '@/hooks/useBuyPixels'
import { OVER_SPEND_CAP_MESSAGE } from '@/lib/buyLimits'

// Shared, stable write mock so the over-cap test can assert the wallet is
// never opened. Hoisted above the vi.mock factory (which is itself hoisted).
const { writeContractAsync } = vi.hoisted(() => ({ writeContractAsync: vi.fn() }))

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
    readContract: vi.fn().mockResolvedValue(100000n),
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
    preferred: { address: '0xUSDC', decimals: 6, symbol: 'USDC', amount: 1000 },
    totalAmount: 1000,
    isLoading: false,
  }),
}))

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
      // $11 — over the ~$9.80 safe limit.
      await result.current.execute([1], 11_000_000n)
    })
    expect(result.current.step).toBe('error')
    expect(result.current.error).toBe(OVER_SPEND_CAP_MESSAGE)
    // Never reached the approve/buy writes.
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
