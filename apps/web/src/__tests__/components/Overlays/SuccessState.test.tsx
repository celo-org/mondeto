import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SuccessState from '@/components/Overlays/SuccessState'

describe('SuccessState', () => {
  const defaultProps = {
    pixelCount: 5,
    totalPaid: '2.50 USDT',
    txHash: '0x1234567890abcdef1234567890abcdef12345678',
    onDone: vi.fn(),
  }

  it('shows pixel count as spots grabbed', () => {
    render(<SuccessState {...defaultProps} />)
    expect(screen.getByText('+5 spots grabbed')).toBeInTheDocument()
  })

  it('shows a random title from the list', () => {
    render(<SuccessState {...defaultProps} />)
    const titles = ['POWER MOVE', 'NAILED IT', 'BIG FLEX', 'NICE ONE']
    const foundTitle = titles.some((t) => screen.queryByText(t) !== null)
    expect(foundTitle).toBe(true)
  })

  it('shows paid amount', () => {
    render(<SuccessState {...defaultProps} />)
    expect(screen.getByText('paid 2.50 USDT')).toBeInTheDocument()
  })

  it('calls onDone when button clicked', () => {
    const onDone = vi.fn()
    render(<SuccessState {...defaultProps} onDone={onDone} />)
    fireEvent.click(screen.getByText("LET'S GO"))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
