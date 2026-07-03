import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TopBar from '@/components/Layout/TopBar'

vi.mock('@/components/connect-button', () => ({
  ConnectButton: () => <button>Connect</button>,
}))

// MapSwitcher pulls in wagmi (useAccount + usePublicClient via useMaps and
// useShouldOpenNextMap). TopBar doesn't own those concerns — stub the
// switcher out so the bar can be rendered without a WagmiProvider tree.
vi.mock('@/components/Layout/MapSwitcher', () => ({
  default: () => null,
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
