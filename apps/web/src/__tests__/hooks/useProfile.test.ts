import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useProfile } from '@/hooks/useProfile'

vi.mock('wagmi', () => ({
  useWriteContract: () => ({
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
  }),
  useWaitForTransactionReceipt: () => ({
    isLoading: false,
    isSuccess: false,
  }),
  useReadContract: () => ({
    data: undefined,
  }),
}))

describe('useProfile', () => {
  it('has default initial state', () => {
    const { result } = renderHook(() => useProfile(undefined))
    expect(result.current.name).toBe('')
    expect(result.current.color).toBe('#e74c3c')
    expect(result.current.saveState).toBe('idle')
  })

  it('exposes setters', () => {
    const { result } = renderHook(() => useProfile('0x1234567890123456789012345678901234567890'))
    expect(typeof result.current.setName).toBe('function')
    expect(typeof result.current.setColor).toBe('function')
    expect(typeof result.current.save).toBe('function')
  })
})
