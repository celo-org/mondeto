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
// approve the exact amount + 2% drift buffer instead.
const APPROVAL_CAP_DOLLARS = 10n

// Buyer-side slippage tolerance. The execution-time price can drift slightly
// above the quoted price (gradual intra-epoch decay reverses, or another buyer
// bumps a pixel's saleCount). We accept up to this much over the quote and let
// the contract revert beyond it, so a front-run that doubles the price can't
// silently charge the buyer. Expressed as a percentage of the canonical quote.
const SLIPPAGE_TOLERANCE_BPS = 200n // 2%

// How long a signed buy stays valid. Past this the contract rejects it rather
// than executing a stale transaction at a possibly worse price.
const DEADLINE_WINDOW_SECONDS = 20 * 60

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
      console.log('On-chain canonical price:', canonicalPrice.toString(), 'priceDecimals:', priceDecimals)

      const tenToTokenDec = 10n ** BigInt(tokenDecimals)
      const tenToPriceDec = 10n ** BigInt(priceDecimals)
      const priceInToken = (canonicalPrice * tenToTokenDec) / tenToPriceDec
      const approveAmount = (priceInToken * 102n) / 100n
      const capInToken = APPROVAL_CAP_DOLLARS * tenToTokenDec
      const safeApprove = approveAmount > capInToken ? approveAmount : capInToken

      // Slippage + deadline guards passed to buyPixels. maxTotalCost is in the
      // contract's PRICE_DECIMALS base units (the same units selectionPrice
      // returns and totalCost accumulates in), so cap the canonical price
      // directly — no token-decimal conversion.
      const maxTotalCost = (canonicalPrice * (10000n + SLIPPAGE_TOLERANCE_BPS)) / 10000n
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_WINDOW_SECONDS)

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
