import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ConnectButtonInteractive from '@/components/connect-button-interactive'
import { generateUsername } from '@/lib/username'

/**
 * Behavioural coverage for the interactive half of ConnectButton (#213).
 *
 * This is the only surface a signed-out player can act on, and the only route
 * to LOG OUT for a signed-in one, and none of it had a test: `TopBar` stubs
 * the whole component out, and four other suites `vi.mock('wagmi')`, so the
 * connected/disconnected split was never exercised anywhere.
 *
 * Privy and wagmi are mocked at the module boundary rather than by replacing
 * the component under test — the mistake #213 was filed about. `useProfile`
 * and `useMaps` are mocked because they issue chain reads; the label logic
 * they feed is asserted directly.
 */
const h = vi.hoisted(() => ({
  connectWallet: vi.fn(),
  disconnect: vi.fn(),
  account: { isConnected: false, address: undefined as string | undefined },
  profileName: { value: '' as string | undefined },
}))

vi.mock('@privy-io/react-auth', () => ({
  useConnectWallet: () => ({ connectWallet: h.connectWallet }),
}))

vi.mock('wagmi', () => ({
  useAccount: () => h.account,
  useDisconnect: () => ({ disconnect: h.disconnect }),
}))

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ name: h.profileName.value }),
}))

vi.mock('@/hooks/useMaps', () => ({
  useMaps: () => ({ currentMapId: 0 }),
}))

const ADDRESS = '0x1234567890123456789012345678901234567890'

beforeEach(() => {
  h.connectWallet.mockReset()
  h.disconnect.mockReset()
  h.account = { isConnected: false, address: undefined }
  h.profileName.value = ''
})

afterEach(cleanup)

const connectAs = (address = ADDRESS, name = '') => {
  h.account = { isConnected: true, address }
  h.profileName.value = name
}

const mainButton = () => screen.getAllByRole('button')[0]

describe('ConnectButtonInteractive — disconnected', () => {
  it('offers CONNECT and opens the wallet picker on click', () => {
    render(<ConnectButtonInteractive />)

    expect(screen.getByRole('button', { name: 'CONNECT' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'CONNECT' }))
    expect(h.connectWallet).toHaveBeenCalledTimes(1)
    // A disconnected click must not open the account menu — there is no
    // account to act on, and LOG OUT would be meaningless.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('ConnectButtonInteractive — connected label', () => {
  it('prefers the on-chain profile name', () => {
    connectAs(ADDRESS, 'pixelqueen')
    render(<ConnectButtonInteractive />)
    expect(screen.getByRole('button', { name: 'pixelqueen' })).toBeInTheDocument()
  })

  it('falls back to the generated username when there is no on-chain name', () => {
    connectAs(ADDRESS, '')
    render(<ConnectButtonInteractive />)

    // Recomputed from the real helper rather than hard-coded: the mapping is
    // deterministic, so hard-coding would pin this test to today's word lists
    // and go red on a change that is not a regression.
    const expected = generateUsername(ADDRESS)
    expect(screen.getByRole('button', { name: expected })).toBeInTheDocument()
    // Guard against the fallback silently becoming the empty-ish placeholder.
    expect(expected).not.toBe('')
    expect(screen.queryByRole('button', { name: 'CONNECT' })).not.toBeInTheDocument()
  })

  it('shows the ellipsis placeholder when connected without an address yet', () => {
    // wagmi reports isConnected before address resolves on some reconnects.
    // The button must not read CONNECT then — it would invite a second
    // connect on an already-connected wallet.
    h.account = { isConnected: true, address: undefined }
    render(<ConnectButtonInteractive />)

    expect(screen.getByRole('button', { name: '…' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'CONNECT' })).not.toBeInTheDocument()
  })
})

describe('ConnectButtonInteractive — account menu', () => {
  it('is closed until the connected button is clicked', () => {
    connectAs()
    render(<ConnectButtonInteractive />)

    // Control for every menu assertion below: the menu is genuinely absent
    // first, so "it opened" is a state change and not the default.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(mainButton())
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'PROFILE' })).toHaveAttribute(
      'href',
      '/profile',
    )
    expect(screen.getByRole('menuitem', { name: 'LOG OUT' })).toBeInTheDocument()
  })

  it('toggles shut on a second click', () => {
    connectAs()
    render(<ConnectButtonInteractive />)

    fireEvent.click(mainButton())
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(mainButton())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('disconnects and closes when LOG OUT is chosen', () => {
    connectAs()
    render(<ConnectButtonInteractive />)

    fireEvent.click(mainButton())
    fireEvent.click(screen.getByRole('menuitem', { name: 'LOG OUT' }))

    expect(h.disconnect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on an outside click without disconnecting', () => {
    connectAs()
    render(<ConnectButtonInteractive />)

    fireEvent.click(mainButton())
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // The handler listens on `mousedown`, not `click` — firing `click` here
    // would pass against a component that never registered a listener at all.
    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    // Dismissing a menu is not signing out. These share a code path via
    // setMenuOpen(false), so the negative matters.
    expect(h.disconnect).not.toHaveBeenCalled()
  })

  it('stays open when the click lands inside the menu', () => {
    connectAs()
    render(<ConnectButtonInteractive />)

    fireEvent.click(mainButton())
    fireEvent.mouseDown(screen.getByRole('menu'))

    // Pairs with the outside-click test: proves the handler discriminates on
    // containment rather than closing on any mousedown anywhere.
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
