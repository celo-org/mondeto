'use client'

import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import { ERC20_ABI, MONDETO_ABI } from '@/lib/contract'
import { getContractByMapId } from '@/lib/maps/contracts'
import { useMaps } from '@/hooks/useMaps'

// Well-known mainnet stablecoin addresses → display symbol. Used as a
// label fallback if the on-chain `symbol()` call returns something odd
// (or the test deployment uses a mock token without `symbol`).
const KNOWN_SYMBOLS: Record<string, 'USDm' | 'USDC' | 'USDT'> = {
  '0x765de816845861e75a25fca122bb6898b8b1282a': 'USDm',
  '0xceba9300f2b948710d2653dd7b07f33a8b32118c': 'USDC',
  '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e': 'USDT',
}

export interface StablecoinHolding {
  /** Display symbol (e.g. "USDm", "USDC", "USDT"). */
  symbol: string
  address: `0x${string}`
  decimals: number
  /** Raw on-chain balance (in token-decimal units). */
  raw: bigint
  /** Formatted as a decimal string ("12.5"). */
  formatted: string
  /** Numeric value for sorting / comparisons. */
  amount: number
}

export interface StablecoinBalances {
  /** Highest-balance holding, or null if all are zero. */
  preferred: StablecoinHolding | null
  /** All accepted tokens, even when zero. */
  holdings: StablecoinHolding[]
  /** Sum of all holdings, formatted (all are $1-pegged stablecoins). */
  total: string
  /** Numeric sum for affordability checks. */
  totalAmount: number
  isLoading: boolean
  isConnected: boolean
}

/**
 * Hook returns the user's spendable stablecoin balances against the
 * currently-active Mondeto contract.
 *
 * Token discovery is dynamic: we call `getAcceptedTokens()` on the
 * Mondeto contract, then read each token's decimals + symbol + the
 * user's balance via batched `useReadContracts`. That way the same
 * frontend works against any deployment — mainnet, Sepolia, or future
 * maps — without baking specific token addresses into the build.
 */
export function useStablecoinBalance(): StablecoinBalances {
  const { address, isConnected } = useAccount()
  const { currentMapId } = useMaps()
  const contractAddress = getContractByMapId(currentMapId)

  // Step 1: which tokens does this Mondeto deployment accept?
  const acceptedTokensRead = useReadContract({
    address: contractAddress,
    abi: MONDETO_ABI,
    functionName: 'getAcceptedTokens',
    query: { enabled: !!contractAddress },
  })

  const tokens = (acceptedTokensRead.data as readonly `0x${string}`[] | undefined) ?? []
  const tokensReady = tokens.length > 0

  // Step 2: for each accepted token, read decimals + symbol + the user's
  // balance in one multicall round-trip. Flattened: [d0, s0, b0, d1, s1, b1, …]
  const tokenReads = useReadContracts({
    contracts: tokens.flatMap((token) => [
      { address: token, abi: ERC20_ABI, functionName: 'decimals' } as const,
      { address: token, abi: ERC20_ABI, functionName: 'symbol' } as const,
      {
        address: token,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address ?? '0x0000000000000000000000000000000000000000'],
      } as const,
    ]),
    query: { enabled: tokensReady && isConnected && !!address },
  })

  const holdings: StablecoinHolding[] = tokens.map((token, i) => {
    const base = i * 3
    const decimalsRes = tokenReads.data?.[base]
    const symbolRes = tokenReads.data?.[base + 1]
    const balanceRes = tokenReads.data?.[base + 2]
    const decimals =
      decimalsRes?.status === 'success' ? Number(decimalsRes.result) : 18
    const onChainSymbol =
      symbolRes?.status === 'success' ? String(symbolRes.result) : ''
    const knownSymbol = KNOWN_SYMBOLS[token.toLowerCase()]
    const symbol = knownSymbol ?? onChainSymbol ?? 'TOKEN'
    const raw =
      balanceRes?.status === 'success' ? (balanceRes.result as bigint) : 0n
    const formatted = formatUnits(raw, decimals)
    const amount = parseFloat(formatted)
    return {
      symbol,
      address: token,
      decimals,
      raw,
      formatted,
      amount: isNaN(amount) ? 0 : amount,
    }
  })

  const withFunds = holdings.filter((h) => h.amount > 0)
  withFunds.sort((a, b) => b.amount - a.amount)
  const preferred = withFunds[0] ?? null

  const totalAmount = holdings.reduce((sum, h) => sum + h.amount, 0)

  return {
    preferred,
    holdings,
    total: totalAmount.toFixed(4),
    totalAmount,
    isLoading: acceptedTokensRead.isLoading || tokenReads.isLoading,
    isConnected,
  }
}
