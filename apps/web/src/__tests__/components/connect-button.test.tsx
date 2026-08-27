import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { PrivyReadyContext } from '@/components/privy-ready-context'
import { ConnectButton } from '@/components/connect-button'

/**
 * Behavioural coverage for the ConnectButton shell (#213).
 *
 * `TopBar.test.tsx` renders this component as
 * `vi.mock('@/components/connect-button', () => ({ ConnectButton: () => <button>Connect</button> }))`
 * — a stub that contributes coverage while asserting nothing about the real
 * thing. Everything below exercises the actual module.
 *
 * What makes this shell worth its own file: it decides, on every page load,
 * which of three states a player sees, and two of those decisions are
 * load-bearing for reasons that are invisible from the JSX.
 *
 * The interactive half is stubbed here *deliberately*, and only here. It is
 * pulled in with `next/dynamic({ ssr: false })` precisely so that
 * `@privy-io/react-auth` stays out of the shared chunk; importing it for real
 * in this file would be the test reintroducing the coupling that #209 removed.
 * Its own behaviour is covered in `connect-button-interactive.test.tsx`.
 */
vi.mock('@/components/connect-button-interactive', () => ({
  default: () => <button data-testid="interactive">INTERACTIVE</button>,
}))

afterEach(() => {
  cleanup()
  delete window.ethereum
})

/**
 * An injected provider, MiniPay or otherwise. `request` is required by the
 * `EthereumProvider` type and is deliberately a rejecting stub: nothing in
 * this component may talk to the wallet, so if a change ever makes it do so,
 * the test fails loudly instead of quietly passing against a no-op.
 */
const injectedWallet = (isMiniPay: boolean) => ({
  isMiniPay,
  request: vi.fn(async () => {
    throw new Error('ConnectButton must not call the injected provider')
  }),
})

/** The static placeholder: a CONNECT button that is not the interactive one. */
function expectPlaceholder() {
  expect(screen.getByRole('button', { name: 'CONNECT' })).toBeInTheDocument()
  expect(screen.queryByTestId('interactive')).not.toBeInTheDocument()
}

describe('ConnectButton — before the Privy chunk is ready', () => {
  it('shows the placeholder, never the interactive half', async () => {
    // PrivyReadyContext defaults to false, which is what SSR, the first
    // client render and every MiniPay client see.
    render(<ConnectButton />)
    await act(async () => {})
    expectPlaceholder()
  })

  it('keeps showing the placeholder rather than calling a Privy hook', async () => {
    // The explicit-false case, as provided by a tree where PrivyTree has not
    // mounted yet. `useConnectWallet` throws unless PrivyProvider is an
    // ancestor *at the moment it runs*, so rendering the interactive half
    // here would crash the page rather than degrade — which is why this is a
    // separate assertion from the default-context one above.
    render(
      <PrivyReadyContext.Provider value={false}>
        <ConnectButton />
      </PrivyReadyContext.Provider>,
    )
    await act(async () => {})
    expectPlaceholder()
  })
})

describe('ConnectButton — once the Privy chunk is ready', () => {
  it('swaps the placeholder for the interactive half', async () => {
    render(
      <PrivyReadyContext.Provider value={true}>
        <ConnectButton />
      </PrivyReadyContext.Provider>,
    )
    // next/dynamic resolves on a microtask; without this the assertion would
    // pass against the loading placeholder and prove nothing.
    await act(async () => {})

    expect(await screen.findByTestId('interactive')).toBeInTheDocument()
    // Control for the two tests above: the placeholder is genuinely gone, so
    // "placeholder is present" elsewhere is a real distinction and not
    // something that holds in every state.
    expect(screen.queryByRole('button', { name: 'CONNECT' })).not.toBeInTheDocument()
  })
})

describe('ConnectButton — MiniPay', () => {
  it('renders nothing at all, ready or not', async () => {
    // MiniPay injects a wallet with no manual connect step, so a CONNECT
    // button is not merely redundant — it offers an action that cannot
    // succeed. The check must beat the privyReady branch, hence `value
    // ={true}`: this asserts the ordering inside the component, not just the
    // MiniPay flag.
    window.ethereum = injectedWallet(true)

    const { container } = render(
      <PrivyReadyContext.Provider value={true}>
        <ConnectButton />
      </PrivyReadyContext.Provider>,
    )
    await act(async () => {})

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('interactive')).not.toBeInTheDocument()
  })

  it('still renders the button for a non-MiniPay injected wallet (control)', async () => {
    // Pairs with the test above: proves it keys on `isMiniPay` specifically
    // and not on the mere presence of `window.ethereum`, which every
    // browser-extension wallet also sets.
    window.ethereum = injectedWallet(false)

    render(<ConnectButton />)
    await act(async () => {})

    expectPlaceholder()
  })
})
