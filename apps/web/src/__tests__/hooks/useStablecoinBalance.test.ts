import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'

// Real Celo mainnet token addresses — the same ones the accepted-token list on
// the deployed contracts actually returns (checksummed, as viem reports them).
const USDM = '0x765DE816845861e75A25fCA122bb6898B8B1282a' as const // 18 dec
const USDC = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const // 6 dec
const MOCK = '0xAbCd000000000000000000000000000000000123' as const // unknown token

interface TokenAnswer {
  decimals?: number
  symbol?: string
  balance?: bigint
  failDecimals?: boolean
  failSymbol?: boolean
  failBalance?: boolean
}

const h = vi.hoisted(() => ({
  tokens: [] as string[],
  tokensLoading: false,
  readsLoading: false,
  connected: true,
  address: '0x1234567890123456789012345678901234567890' as string | undefined,
  answers: {} as Record<string, TokenAnswer>,
}))

// Captured shape of a failed entry in wagmi's useReadContracts result array.
function failure(fn: string) {
  return {
    status: 'failure' as const,
    result: undefined,
    error: Object.assign(
      new Error(
        `The contract function "${fn}" reverted.\n\nContract Call:\n  function:  ${fn}()\n\nVersion: viem@2.21.19`,
      ),
      { name: 'ContractFunctionExecutionError', shortMessage: `The contract function "${fn}" reverted.` },
    ),
  }
}

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: h.address, isConnected: h.connected }),
  useReadContract: (args: { functionName: string }) => {
    if (args.functionName === 'getAcceptedTokens') {
      return { data: h.tokens, isLoading: h.tokensLoading }
    }
    return { data: undefined, isLoading: false }
  },
  // Honour the request spec: answer each entry by (address, functionName), the
  // way the real multicall does — so if the hook's flattened triple indexing
  // ever drifted, the assertions below would catch it against this double too.
  useReadContracts: (args: {
    contracts: Array<{ address: string; functionName: string }>
    query?: { enabled?: boolean }
  }) => {
    if (args.query?.enabled === false) return { data: undefined, isLoading: false }
    const data = args.contracts.map((c) => {
      const a = h.answers[c.address.toLowerCase()] ?? {}
      switch (c.functionName) {
        case 'decimals':
          return a.failDecimals
            ? failure('decimals')
            : { status: 'success' as const, result: a.decimals ?? 18 }
        case 'symbol':
          return a.failSymbol
            ? failure('symbol')
            : { status: 'success' as const, result: a.symbol ?? '' }
        case 'balanceOf':
          return a.failBalance
            ? failure('balanceOf')
            : { status: 'success' as const, result: a.balance ?? 0n }
        default:
          return failure(c.functionName)
      }
    })
    return { data, isLoading: h.readsLoading }
  },
}))

// The hook only needs the active map id to pick the contract to query.
vi.mock('@/hooks/useMaps', () => ({
  useMaps: () => ({ currentMapId: 0 }),
}))

beforeEach(() => {
  h.tokens = [USDM, USDC]
  h.tokensLoading = false
  h.readsLoading = false
  h.connected = true
  h.address = '0x1234567890123456789012345678901234567890'
  h.answers = {
    [USDM.toLowerCase()]: { decimals: 18, symbol: 'cUSD', balance: 0n },
    [USDC.toLowerCase()]: { decimals: 6, symbol: 'USDC', balance: 0n },
  }
})

describe('useStablecoinBalance holdings mapping', () => {
  it('maps each accepted token to its own decimals, symbol, and balance', () => {
    h.answers[USDM.toLowerCase()].balance = 5_000_000_000_000_000_000n // 5 USDm
    h.answers[USDC.toLowerCase()].balance = 2_500_000n // 2.5 USDC
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.holdings).toHaveLength(2)
    const [usdm, usdc] = result.current.holdings
    // A one-slot shift in the flattened [decimals, symbol, balance] triples
    // would scramble these tuples — assert them jointly per token.
    expect(usdm).toMatchObject({
      address: USDM,
      decimals: 18,
      symbol: 'USDm', // known-address label wins over the on-chain "cUSD"
      raw: 5_000_000_000_000_000_000n,
      amount: 5,
    })
    expect(usdc).toMatchObject({
      address: USDC,
      decimals: 6,
      symbol: 'USDC',
      raw: 2_500_000n,
      amount: 2.5,
    })
  })

  it('sums the pegged-dollar total across mixed-decimal tokens', () => {
    h.answers[USDM.toLowerCase()].balance = 5_000_000_000_000_000_000n // $5
    h.answers[USDC.toLowerCase()].balance = 2_500_000n // $2.50
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.totalAmount).toBe(7.5)
    expect(result.current.total).toBe('7.5000')
  })

  it('labels an unknown token by its on-chain symbol', () => {
    h.tokens = [MOCK]
    h.answers[MOCK.toLowerCase()] = { decimals: 6, symbol: 'tUSD', balance: 1_000_000n }
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.holdings[0].symbol).toBe('tUSD')
  })
})

describe('useStablecoinBalance preferred-token selection', () => {
  it('prefers the highest human-unit balance, not the largest raw integer', () => {
    // 2 USDm = 2×10^18 raw dwarfs 3 USDC = 3×10^6 raw; a raw comparison would
    // pick USDm and spend the wrong token. Human units must win: $3 > $2.
    h.answers[USDM.toLowerCase()].balance = 2_000_000_000_000_000_000n
    h.answers[USDC.toLowerCase()].balance = 3_000_000n
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.preferred?.symbol).toBe('USDC')
    expect(result.current.preferred?.amount).toBe(3)
  })

  it('is null when every balance is zero', () => {
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.preferred).toBeNull()
    // Holdings still list the accepted tokens so the UI can render them.
    expect(result.current.holdings).toHaveLength(2)
  })

  it('skips zero balances when picking (control: the funded token wins)', () => {
    h.answers[USDC.toLowerCase()].balance = 1n // 0.000001 USDC — tiny but real
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.preferred?.symbol).toBe('USDC')
  })
})

describe('useStablecoinBalance degraded reads', () => {
  it('defaults a failed decimals read to 18, keeping healthy tokens exact', () => {
    // Pinned current behaviour: a failed decimals() read assumes 18. For a
    // 6-decimal token that misstates the human amount by 10^12 — flagged as a
    // review finding; this test documents the default rather than endorsing it.
    h.answers[USDC.toLowerCase()] = {
      failDecimals: true,
      symbol: 'USDC',
      balance: 3_000_000n,
    }
    h.answers[USDM.toLowerCase()].balance = 1_000_000_000_000_000_000n
    const { result } = renderHook(() => useStablecoinBalance())
    const usdc = result.current.holdings.find((x) => x.address === USDC)
    const usdm = result.current.holdings.find((x) => x.address === USDM)
    expect(usdc?.decimals).toBe(18)
    expect(usdc?.amount).toBe(3e-12)
    // Control in the same render: the healthy token still reads its real 18.
    expect(usdm?.decimals).toBe(18)
    expect(usdm?.amount).toBe(1)
  })

  it('renders an empty label when an unknown token’s symbol() fails', () => {
    // Pinned current behaviour: the '?? "TOKEN"' fallback is unreachable
    // because a failed symbol read coerces to '' (not undefined) — flagged as
    // a review finding; this test documents what ships.
    h.tokens = [MOCK]
    h.answers[MOCK.toLowerCase()] = { decimals: 6, failSymbol: true, balance: 1_000_000n }
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.holdings[0].symbol).toBe('')
  })

  it('treats a failed balance read as zero rather than crashing', () => {
    h.answers[USDC.toLowerCase()] = { decimals: 6, symbol: 'USDC', failBalance: true }
    h.answers[USDM.toLowerCase()].balance = 1_000_000_000_000_000_000n
    const { result } = renderHook(() => useStablecoinBalance())
    const usdc = result.current.holdings.find((x) => x.address === USDC)
    expect(usdc?.raw).toBe(0n)
    // Control: the healthy token's funds still show, and win preferred.
    expect(result.current.preferred?.symbol).toBe('USDm')
  })
})

describe('useStablecoinBalance connection and loading states', () => {
  it('reports zero holdings while disconnected (balance reads disabled)', () => {
    h.connected = false
    h.address = undefined
    h.answers[USDC.toLowerCase()].balance = 3_000_000n // would show if queried
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.isConnected).toBe(false)
    expect(result.current.preferred).toBeNull()
    expect(result.current.holdings.every((x) => x.raw === 0n)).toBe(true)
  })

  it('shows the funded state once connected (control for the disabled read)', () => {
    h.answers[USDC.toLowerCase()].balance = 3_000_000n
    const { result } = renderHook(() => useStablecoinBalance())
    expect(result.current.preferred?.symbol).toBe('USDC')
  })

  it('propagates loading from either read step', () => {
    h.tokensLoading = true
    const first = renderHook(() => useStablecoinBalance())
    expect(first.result.current.isLoading).toBe(true)
    h.tokensLoading = false
    h.readsLoading = true
    const second = renderHook(() => useStablecoinBalance())
    expect(second.result.current.isLoading).toBe(true)
    h.readsLoading = false
    const third = renderHook(() => useStablecoinBalance())
    expect(third.result.current.isLoading).toBe(false)
  })
})
