import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TopBar from '@/components/Layout/TopBar'

vi.mock('@/components/connect-button', () => ({
  ConnectButton: () => <button>Connect</button>,
}))

describe('TopBar', () => {
  it('renders the wordmark with the title as alt', () => {
    render(<TopBar title="MONDETO" />)
    expect(screen.getByAltText('MONDETO')).toBeInTheDocument()
  })

  it('renders ConnectButton', () => {
    render(<TopBar title="MONDETO" />)
    expect(screen.getByText('Connect')).toBeInTheDocument()
  })

  it('renders children', () => {
    render(
      <TopBar title="MONDETO">
        <span>child element</span>
      </TopBar>
    )
    expect(screen.getByText('child element')).toBeInTheDocument()
  })
})
