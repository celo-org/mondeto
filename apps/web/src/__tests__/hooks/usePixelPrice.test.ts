import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePixelPrice } from '@/hooks/usePixelPrice'

vi.mock('wagmi', () => ({
  usePublicClient: () => null,
}))

vi.mock('@/lib/contract', () => ({
  MONDETO_ABI: [],
}))

vi.mock('@/lib/maps/contracts', () => ({
  getContractByMapId: () => '0x0000000000000000000000000000000000000000',
}))

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('usePixelPrice', () => {
  it('returns 0 price and isLoading false for empty selection', () => {
    const { result } = renderHook(() => usePixelPrice(new Set()))
    expect(result.current.totalPrice).toBe(0n)
    expect(result.current.isLoading).toBe(false)
  })

  it('sets isLoading true initially when selection is non-empty', () => {
    const { result } = renderHook(() => usePixelPrice(new Set([1, 2])))
    expect(result.current.isLoading).toBe(true)
  })

  it('falls back to 0n when publicClient is null', async () => {
    const ids = new Set([1, 2, 3])
    const { result } = renderHook(() => usePixelPrice(ids))

    expect(result.current.isLoading).toBe(true)

    // Wait for debounce + async resolution
    await act(async () => {
      await delay(350)
    })

    expect(result.current.totalPrice).toBe(0n)
    expect(result.current.isLoading).toBe(false)
  })

  it('resets to 0 when selection becomes empty', async () => {
    const { result, rerender } = renderHook(
      ({ ids }) => usePixelPrice(ids),
      { initialProps: { ids: new Set([1, 2]) } },
    )

    // Wait for debounce to settle
    await act(async () => {
      await delay(350)
    })

    expect(result.current.isLoading).toBe(false)

    // Clear selection
    rerender({ ids: new Set<number>() })
    expect(result.current.totalPrice).toBe(0n)
    expect(result.current.isLoading).toBe(false)
  })
})
