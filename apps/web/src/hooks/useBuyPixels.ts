'use client'

import { useState, useCallback } from 'react'
import { useWriteContract, useAccount, usePublicClient } from 'wagmi'
import { MONDETO_ABI, ERC20_ABI } from '@/lib/contract'
import { getBuilderCodeSuffix } from '@/lib/builderCode'
import { getContractByMapId } from '@/lib/maps/contracts'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'
import type { MapId } from '@/lib/maps/types'

export type TxStep = 'idle' | 'approving' | 'buying' | 'confirming' | 'success' | 'error'

// Standing-approval cap, in dollars. If the contract is ever compromised,
// user funds beyond this cap stay safe. Purchases that exceed the cap
// approve the exact amount + the slippage buffer instead.
const APPROVAL_CAP_DOLLARS = 10n

const BPS_DENOM = 10_000n

// Buyer-side slippage tolerance, in basis points. The execution-time price can
// drift slightly above the quoted price (gradual intra-epoch decay reverses, or
// another buyer bumps a pixel's saleCount). We accept up to this much over the
// quote and let the contract revert (SlippageExceeded) beyond it, so a
// front-run that doubles the price can't silently charge the buyer. The SAME
// buffer drives the token approval, so the allowance always covers the ceiling.
// Tunable per-environment via NEXT_PUBLIC_BUY_SLIPPAGE_BPS (default 2%).
const SLIPPAGE_BPS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_BUY_SLIPPAGE_BPS)
  return Number.isFinite(raw) && raw >= 0 ? BigInt(Math.floor(raw)) : 200n
})()

// How long a signed buy stays valid, in seconds. Past this the contract
// rejects it (DeadlineExpired) rather than executing a stale transaction at a
// possibly worse price. Tunable via NEXT_PUBLIC_BUY_DEADLINE_SECONDS
// (default 20 minutes).
const DEADLINE_SECONDS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_BUY_DEADLINE_SECONDS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20 * 60
})()

export function useBuyPixels(mapId?: MapId) {
  const contractAddress = getContractByMapId(mapId ?? 0)
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { preferred } = useStablecoinBalance()
  const [step, setStep] = useState<TxStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [insufficientBalance, setInsufficientBalance] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  const { writeContractAsync } = useWriteContract()

  const checkBalance = useCallback((totalPrice: bigint, userBalance: bigint) => {
    const insufficient = userBalance < totalPrice
    setInsufficientBalance(insufficient)
    return !insufficient
  }, [])

  const execute = useCallback(async (ids: number[], _totalPriceHint: bigint) => {
    if (!publicClient || !address) return

    if (!preferred) {
      setError('No stablecoin balance — top up before buying.')
      setStep('error')
      return
    }

    const tokenAddress = preferred.address
    const tokenDecimals = preferred.decimals

    try {
      setStep('approving')
      setError(null)

      const bigIds = ids.map((id) => BigInt(id))
      const dataSuffix = getBuilderCodeSuffix()

      // Read the canonical price + canonical-to-token decimal conversion.
      // `selectionPrice` returns the price in PRICE_DECIMALS units (the
      // contract's internal precision); we convert into the buyer's token
      // units before computing the approval amount.
      const [canonicalPrice, priceDecimalsRaw] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: MONDETO_ABI,
          functionName: 'selectionPrice',
          args: [bigIds],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: contractAddress,
          abi: MONDETO_ABI,
          functionName: 'PRICE_DECIMALS',
        }) as Promise<number>,
      ])
      const priceDecimals = Number(priceDecimalsRaw)

      // Slippage ceiling in PRICE_DECIMALS units — the same units the contract
      // compares `maxTotalCost` against, so no conversion is needed here.
      const maxTotalCost = (canonicalPrice * (BPS_DENOM + SLIPPAGE_BPS)) / BPS_DENOM
      // Reject the tx if it hasn't mined within the deadline window.
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)

      const tenToTokenDec = 10n ** BigInt(tokenDecimals)
      const tenToPriceDec = 10n ** BigInt(priceDecimals)
      const priceInToken = (canonicalPrice * tenToTokenDec) / tenToPriceDec
      // Approve the slippage ceiling (same buffer as maxTotalCost) so the
      // allowance always covers the most the contract could charge.
      const approveAmount = (priceInToken * (BPS_DENOM + SLIPPAGE_BPS)) / BPS_DENOM
      const capInToken = APPROVAL_CAP_DOLLARS * tenToTokenDec
      const safeApprove = approveAmount > capInToken ? approveAmount : capInToken

      // Skip approve if existing allowance already covers the purchase.
      const currentAllowance = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, contractAddress],
      })) as bigint

      if (currentAllowance < approveAmount) {
        const approveHash = await writeContractAsync({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [contractAddress, safeApprove],
          dataSuffix,
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
        // Wait for nonce to propagate on sequencer
        await new Promise((r) => setTimeout(r, 3000))
      } else {
        console.log('Allowance sufficient, skipping approve')
      }

      // Step 2: Buy pixels with the chosen token.
      setStep('buying')
      const buyHash = await writeContractAsync({
        address: contractAddress,
        abi: MONDETO_ABI,
        functionName: 'buyPixels',
        args: [bigIds, tokenAddress, maxTotalCost, deadline],
        dataSuffix,
      })

      setTxHash(buyHash)
      setStep('confirming')

      const receipt = await publicClient.waitForTransactionReceipt({ hash: buyHash })

      if (receipt.status === 'reverted') {
        // Try to surface the revert reason via a simulation re-run.
        try {
          await publicClient.simulateContract({
            address: contractAddress,
            abi: MONDETO_ABI,
            functionName: 'buyPixels',
            args: [bigIds, tokenAddress, maxTotalCost, deadline],
            account: address,
          })
        } catch (simErr) {
          console.error('Revert reason:', simErr)
          throw new Error(
            'Transaction reverted: ' +
              (simErr instanceof Error ? simErr.message.slice(0, 150) : 'unknown reason'),
          )
        }
        throw new Error('Transaction reverted on-chain')
      }

      setStep('success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Transaction failed'
      console.error('Buy failed:', msg)
      const short = msg.includes('User rejected')
        ? 'Transaction rejected by user'
        : msg.includes('nonce')
          ? 'Nonce error — please try again in a few seconds'
          : msg.includes('NotLand')
            ? 'Selected pixel is not land'
            : msg.includes('TokenNotAccepted')
              ? `${preferred.symbol} is not accepted by this map yet`
              : msg.includes('SlippageExceeded')
                ? 'Price moved above your limit — please review and try again'
                : msg.includes('DeadlineExpired')
                  ? 'Transaction expired — please try again'
                  : msg.includes('insufficient') || msg.includes('ERC20')
                    ? `Insufficient ${preferred.symbol} balance or allowance`
                    : msg.slice(0, 200)
      setError(short)
      setStep('error')
    }
  }, [writeContractAsync, publicClient, address, contractAddress, preferred])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setTxHash(null)
    setInsufficientBalance(false)
  }, [])

  return { execute, step, txHash, error, reset, insufficientBalance, checkBalance }
}
