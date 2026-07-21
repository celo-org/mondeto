import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProfile } from '@/hooks/useProfile'

// Shared, per-test-configurable mocks. celo.id (42220) is used as the connected
// chain so save() skips the chain-switch branch by default.
const mocks = vi.hoisted(() => ({
  writeContractAsync: vi.fn(),
  estimateContractGas: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  switchChainAsync: vi.fn(),
  chainId: 42220,
}))

vi.mock('wagmi', () => ({
  useWriteContract: () => ({ writeContractAsync: mocks.writeContractAsync }),
  useReadContract: () => ({ data: undefined }),
  useAccount: () => ({ chainId: mocks.chainId }),
  usePublicClient: () => ({
    estimateContractGas: mocks.estimateContractGas,
    waitForTransactionReceipt: mocks.waitForTransactionReceipt,
  }),
  useSwitchChain: () => ({ switchChainAsync: mocks.switchChainAsync }),
}))

const ADDR = '0x1234567890123456789012345678901234567890'

describe('useProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.chainId = 42220
    mocks.estimateContractGas.mockResolvedValue(100_000n)
    mocks.writeContractAsync.mockResolvedValue('0xtxhash')
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'success' })
  })

  it('has default initial state', () => {
    const { result } = renderHook(() => useProfile(undefined))
    expect(result.current.name).toBe('')
    expect(result.current.color).toBe('#e74c3c')
    expect(result.current.saveState).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('exposes setters', () => {
    const { result } = renderHook(() => useProfile(ADDR))
    expect(typeof result.current.setName).toBe('function')
    expect(typeof result.current.setColor).toBe('function')
    expect(typeof result.current.save).toBe('function')
  })

  it('confirms a successful save and passes an explicit gas limit', async () => {
    const { result } = renderHook(() => useProfile(ADDR))
    act(() => result.current.setName('lena'))

    await act(async () => {
      await result.current.save()
    })

    expect(result.current.saveState).toBe('saved')
    expect(result.current.error).toBeNull()
    // Padded estimate (100k * 1.2) is passed explicitly to the wallet.
    expect(mocks.writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'updateProfile', gas: 120_000n }),
    )
  })

  it('lands on error (not stuck) when the tx reverts on-chain', async () => {
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' })
    const { result } = renderHook(() => useProfile(ADDR))
    act(() => result.current.setName('lena'))

    await act(async () => {
      await result.current.save()
    })

    await waitFor(() => expect(result.current.saveState).toBe('error'))
    expect(result.current.error).toBeTruthy()
  })

  it('still confirms when gas estimation fails (non-MiniPay: wallet estimates)', async () => {
    mocks.estimateContractGas.mockRejectedValue(new Error('estimate failed'))
    const { result } = renderHook(() => useProfile(ADDR))
    act(() => result.current.setName('lena'))

    await act(async () => {
      await result.current.save()
    })

    // Outside MiniPay (feeCurrency undefined) there is no retry ladder, so the
    // write ships without an explicit gas limit rather than a gas-less MiniPay
    // send — the wallet estimates. The tx still confirms.
    expect(result.current.saveState).toBe('saved')
    const call = mocks.writeContractAsync.mock.calls[0][0]
    expect(call.gas).toBeUndefined()
  })

  it('does not write when the name is empty', async () => {
    const { result } = renderHook(() => useProfile(ADDR))
    await act(async () => {
      await result.current.save()
    })
    expect(mocks.writeContractAsync).not.toHaveBeenCalled()
    expect(result.current.saveState).toBe('idle')
  })
})
