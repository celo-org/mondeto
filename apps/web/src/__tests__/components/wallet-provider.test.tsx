import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { WalletProvider } from '@/components/wallet-provider'

/**
 * Guards the fix for #221: while the lazy Privy chunk is loading, the app
 * tree must stay mounted under the vanilla wagmi providers.
 *
 * The failure mode this pins down: `PrivyTree` used to be mounted via
 * `next/dynamic({ loading: () => null })` with `{children}` as its child, so
 * every non-MiniPay page load rendered vanilla → `null` (entire app tree
 * unmounted) → Privy. Whether an in-flight async callback then dereferenced a
 * ref that unmount had already nulled was a chunk-timing race — which is how
 * a postcss patch bump (#212) took every browser down with no explanatory
 * source diff.
 *
 * The Privy module is mocked with a promise the test resolves by hand, so the
 * "chunk still loading" window is held open for as long as the assertions
 * need.
 */

const gate = vi.hoisted(() => {
  let resolve!: (m: unknown) => void
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
})

vi.mock('@/components/wallet-provider-privy', () => gate.promise)

// Rendered by both trees; irrelevant to the mount/unmount behaviour under
// test and they reach into wagmi + PostHog.
vi.mock('@/components/ChainGuard', () => ({ ChainGuard: () => null }))
vi.mock('@/components/wallet-analytics', () => ({ WalletAnalytics: () => null }))

function Probe() {
  return <div data-testid="probe" />
}

afterEach(() => {
  cleanup()
  delete window.ethereum
})

describe('WalletProvider (browser, non-MiniPay)', () => {
  it('keeps children mounted while the Privy chunk is loading, then swaps once', async () => {
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>,
    )

    // Hydration effects have flushed (render is wrapped in act), the import
    // has started, and the mocked chunk is still pending. This is the window
    // where the old code unmounted the entire tree into `null`.
    expect(screen.getByTestId('probe')).toBeInTheDocument()
    expect(screen.queryByTestId('privy-tree')).not.toBeInTheDocument()

    await act(async () => {
      gate.resolve({
        PrivyTree: ({ children }: { children: React.ReactNode }) => (
          <div data-testid="privy-tree">{children}</div>
        ),
      })
    })

    // Chunk resolved: one swap, children now under the Privy tree.
    expect(screen.getByTestId('privy-tree')).toBeInTheDocument()
    expect(screen.getByTestId('probe')).toBeInTheDocument()
  })
})

describe('WalletProvider (MiniPay)', () => {
  it('never mounts the Privy tree', async () => {
    window.ethereum = {
      isMiniPay: true,
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') return '0xa4ec'
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return []
        return null
      }),
    }

    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>,
    )

    // Let any stray microtasks (auto-connect, a wrongly-started import)
    // settle before asserting.
    await act(async () => {})

    expect(screen.getByTestId('probe')).toBeInTheDocument()
    expect(screen.queryByTestId('privy-tree')).not.toBeInTheDocument()
  })
})
