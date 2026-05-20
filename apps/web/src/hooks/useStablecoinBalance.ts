'use client'

import { useAccount, useBalance } from 'wagmi'
import { celo } from 'viem/chains'

// MiniPay stablecoins on Celo mainnet. Addresses + decimals per the
// celopedia MiniPay guide. USDm is the MiniPay default — most users
// hold USDm and have 0 USDT/USDC until they swap.
export const STABLECOINS = {
  USDM: { symbol: 'USDm', address: '0x765DE816845861e75A25fCA122bb6898B8B1282a', decimals: 18 },
  USDC: { symbol: 'USDC', address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C', decimals: 6  },
  USDT: { symbol: 'USDT', address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e', decimals: 6  },
} as const

export type StablecoinSymbol = keyof typeof STABLECOINS

export interface StablecoinHolding {
  symbol: 'USDm' | 'USDC' | 'USDT'
  address: `0x${string}`
  decimals: number
  /** Raw on-chain balance (in token-decimal units, e.g. 6 for USDT). */
  raw: bigint
  /** Formatted as a decimal string ("12.5"). */
  formatted: string
  /** Numeric value for sorting / comparisons. */
  amount: number
}

export interface StablecoinBalances {
  /** Highest-balance holding, or null if all three are zero. */
  preferred: StablecoinHolding | null
  /** All three holdings, even when zero. */
  holdings: StablecoinHolding[]
  /** Sum of USDm + USDC + USDT, formatted (all $1-pegged). */
  total: string
  /** Numeric sum for affordability checks. */
  totalAmount: number
  isLoading: boolean
  isConnected: boolean
}

function buildHolding(
  meta: typeof STABLECOINS[StablecoinSymbol],
  raw: bigint | undefined,
  formatted: string | undefined,
): StablecoinHolding {
  const amt = parseFloat(formatted ?? '0')
  return {
    symbol: meta.symbol,
    address: meta.address as `0x${string}`,
    decimals: meta.decimals,
    raw: raw ?? 0n,
    formatted: formatted ?? '0',
    amount: isNaN(amt) ? 0 : amt,
  }
}

export function useStablecoinBalance(): StablecoinBalances {
  const { address, isConnected } = useAccount()
  const enabled = isConnected && !!address
  const common = { address, chainId: celo.id, query: { enabled } } as const

  const usdm = useBalance({ ...common, token: STABLECOINS.USDM.address as `0x${string}` })
  const usdc = useBalance({ ...common, token: STABLECOINS.USDC.address as `0x${string}` })
  const usdt = useBalance({ ...common, token: STABLECOINS.USDT.address as `0x${string}` })

  const holdings: StablecoinHolding[] = [
    buildHolding(STABLECOINS.USDM, usdm.data?.value, usdm.data?.formatted),
    buildHolding(STABLECOINS.USDC, usdc.data?.value, usdc.data?.formatted),
    buildHolding(STABLECOINS.USDT, usdt.data?.value, usdt.data?.formatted),
  ]

  const withFunds = holdings.filter((h) => h.amount > 0)
  withFunds.sort((a, b) => b.amount - a.amount)
  const preferred = withFunds[0] ?? null

  const totalAmount = holdings.reduce((sum, h) => sum + h.amount, 0)

  return {
    preferred,
    holdings,
    total: totalAmount.toFixed(4),
    totalAmount,
    isLoading: usdm.isLoading || usdc.isLoading || usdt.isLoading,
    isConnected,
  }
}
