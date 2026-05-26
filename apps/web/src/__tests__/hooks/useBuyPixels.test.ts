import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuyPixels } from '@/hooks/useBuyPixels'

vi.mock('wagmi', () => ({
  useAccount: () => ({ chain: { id: 44787 }, address: '0x1234567890123456789012345678901234567890' }),
  useWriteContract: () => ({
    writeContractAsync: vi.fn(),
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

  it('reset clears all state', () => {
    const { result } = renderHook(() => useBuyPixels())
    act(() => { result.current.checkBalance(1000000n, 500000n) })
    expect(result.current.insufficientBalance).toBe(true)
    act(() => { result.current.reset() })
    expect(result.current.step).toBe('idle')
    expect(result.current.insufficientBalance).toBe(false)
  })
})
