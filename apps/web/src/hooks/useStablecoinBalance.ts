'use client'

import { useAccount, useBalance } from 'wagmi'
import { celo } from 'viem/chains'

// MiniPay stablecoins on Celo mainnet. Addresses + decimals per the
// celopedia MiniPay guide. USDm is the MiniPay default — most users
// hold USDm and have 0 USDT/USDC until they swap.
const USDM_ADDRESS = '0x765DE816845861e75A25fCA122bb6898B8B1282a' as const
const USDC_ADDRESS = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const USDT_ADDRESS = '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e' as const

interface StablecoinBalance {
  /** Sum of USDm + USDC + USDT, formatted as a decimal string (e.g. "12.5000"). */
  total: string
  /** Individual balances, formatted. */
  usdm: string
  usdc: string
  usdt: string
  isLoading: boolean
  isConnected: boolean
}

export function useStablecoinBalance(): StablecoinBalance {
  const { address, isConnected } = useAccount()

  const enabled = isConnected && !!address
  const common = { address, chainId: celo.id, query: { enabled } } as const

  const usdm = useBalance({ ...common, token: USDM_ADDRESS })
  const usdc = useBalance({ ...common, token: USDC_ADDRESS })
  const usdt = useBalance({ ...common, token: USDT_ADDRESS })

  const usdmAmt = parseFloat(usdm.data?.formatted ?? '0')
  const usdcAmt = parseFloat(usdc.data?.formatted ?? '0')
  const usdtAmt = parseFloat(usdt.data?.formatted ?? '0')
  const total = usdmAmt + usdcAmt + usdtAmt

  return {
    total: total.toFixed(4),
    usdm: usdmAmt.toFixed(4),
    usdc: usdcAmt.toFixed(4),
    usdt: usdtAmt.toFixed(4),
    isLoading: usdm.isLoading || usdc.isLoading || usdt.isLoading,
    isConnected,
  }
}
