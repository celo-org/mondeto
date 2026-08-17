import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { useContext } from 'react'
import { PrivyTree } from '@/components/wallet-provider-privy'
import { PrivyReadyContext } from '@/components/privy-ready-context'

/**
 * `PrivyReadyContext` must observe `usePrivy().ready`, not assert readiness.
 * `ready` is false for a moment after `PrivyProvider` mounts, and
 * `ConnectButtonInteractive` — gated on this context but loaded as its own
 * dynamic chunk — can resolve inside that window. A hardcoded `true` let it
 * call `useConnectWallet` before Privy was ready: the source of the
 * `useWallets was called outside the PrivyProvider component` warnings
 * preceding the #221 crash.
 */

const privyState = vi.hoisted(() => ({ ready: false }))

vi.mock('@privy-io/react-auth', () => ({
  PrivyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePrivy: () => ({ ready: privyState.ready }),
}))

vi.mock('@privy-io/wagmi', () => ({
  WagmiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  createConfig: () => ({}),
}))

vi.mock('@/components/ChainGuard', () => ({ ChainGuard: () => null }))
vi.mock('@/components/wallet-analytics', () => ({ WalletAnalytics: () => null }))

function ReadyProbe() {
  const ready = useContext(PrivyReadyContext)
  return <div data-testid="ready">{String(ready)}</div>
}

afterEach(() => {
  cleanup()
  privyState.ready = false
})

describe('PrivyTree readiness context', () => {
  it('reports false until usePrivy().ready is true', () => {
    render(
      <PrivyTree>
        <ReadyProbe />
      </PrivyTree>,
    )
    expect(screen.getByTestId('ready')).toHaveTextContent('false')
  })

  it('reports true once usePrivy().ready is true', () => {
    privyState.ready = true
    render(
      <PrivyTree>
        <ReadyProbe />
      </PrivyTree>,
    )
    expect(screen.getByTestId('ready')).toHaveTextContent('true')
  })
})
