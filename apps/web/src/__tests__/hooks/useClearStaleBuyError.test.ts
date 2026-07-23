import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useClearStaleBuyError } from '@/hooks/useClearStaleBuyError'
import type { TxStep } from '@/hooks/useBuyPixels'

describe('useClearStaleBuyError', () => {
  it('resets when the selection changes while an error is showing', () => {
    // The reported bug: a failed buy left its error frozen; unselecting a
    // pixel must clear it so an affordable selection is buyable again.
    const reset = vi.fn()
    const { rerender } = renderHook(
      ({ sel }: { sel: Set<number>; step: TxStep }) =>
        useClearStaleBuyError(sel, 'error', reset),
      { initialProps: { sel: new Set([1, 2, 3]), step: 'error' as TxStep } },
    )
    reset.mockClear() // ignore the mount-time effect

    rerender({ sel: new Set([1, 2]), step: 'error' })
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('does not reset when the selection changes without an error', () => {
    const reset = vi.fn()
    const { rerender } = renderHook(
      ({ sel, step }: { sel: Set<number>; step: TxStep }) =>
        useClearStaleBuyError(sel, step, reset),
      { initialProps: { sel: new Set([1]), step: 'idle' as TxStep } },
    )
    reset.mockClear()

    rerender({ sel: new Set([1, 2]), step: 'idle' })
    expect(reset).not.toHaveBeenCalled()
  })

  it('does not reset on entering the error state without a selection edit', () => {
    // Keyed on selection, not step — entering error must not wipe the error
    // it just set.
    const reset = vi.fn()
    const sel = new Set([1])
    const { rerender } = renderHook(
      ({ step }: { step: TxStep }) => useClearStaleBuyError(sel, step, reset),
      { initialProps: { step: 'buying' as TxStep } },
    )
    reset.mockClear()

    rerender({ step: 'error' })
    expect(reset).not.toHaveBeenCalled()
  })

  it('does not reset when the same selection instance is reused across renders', () => {
    const reset = vi.fn()
    const sel = new Set([1, 2])
    const { rerender } = renderHook(
      ({ step }: { step: TxStep }) => useClearStaleBuyError(sel, step, reset),
      { initialProps: { step: 'error' as TxStep } },
    )
    reset.mockClear()

    rerender({ step: 'error' })
    expect(reset).not.toHaveBeenCalled()
  })
})
