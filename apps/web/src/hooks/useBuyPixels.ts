'use client'

import { useState, useCallback } from 'react'
import { useWriteContract, useAccount, usePublicClient } from 'wagmi'
import { MONDETO_ABI, USDT_ABI } from '@/lib/contract'
import { USDT_ADDRESS } from '@/lib/contract'
import { getBuilderCodeSuffix } from '@/lib/builderCode'
import { getContractByMapId } from '@/lib/maps/contracts'
import type { MapId } from '@/lib/maps/types'

export type TxStep = 'idle' | 'approving' | 'buying' | 'confirming' | 'success' | 'error'

export function useBuyPixels(mapId?: MapId) {
  const contractAddress = getContractByMapId(mapId ?? 0)
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [step, setStep] = useState<TxStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [insufficientBalance, setInsufficientBalance] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  const usdtAddress = USDT_ADDRESS

  const { writeContractAsync } = useWriteContract()

  const checkBalance = useCallback((totalPrice: bigint, userBalance: bigint) => {
    const insufficient = userBalance < totalPrice
    setInsufficientBalance(insufficient)
    return !insufficient
  }, [])

  const execute = useCallback(async (ids: number[], _totalPriceHint: bigint) => {
    if (!publicClient || !address) return

    try {
      setStep('approving')
      setError(null)

      const bigIds = ids.map(id => BigInt(id))
      const dataSuffix = getBuilderCodeSuffix()

      // Get real price from contract
      let realPrice = _totalPriceHint
      try {
        const onChainPrice = await publicClient.readContract({
          address: contractAddress,
          abi: MONDETO_ABI,
          functionName: 'selectionPrice',
          args: [bigIds],
        }) as bigint
        realPrice = onChainPrice
      } catch (e) {
        console.warn('Failed to read on-chain price, using hint:', e)
      }

      // Check current allowance — skip approve if already sufficient
      const currentAllowance = await publicClient.readContract({
        address: usdtAddress,
        abi: USDT_ABI,
        functionName: 'allowance',
        args: [address, contractAddress],
      }) as bigint

      const approveAmount = realPrice * 102n / 100n

      if (currentAllowance < approveAmount) {
        // Cap standing approvals at $10 USDT so that if the contract is
        // ever compromised, user funds beyond the cap remain safe. For
        // purchases above the cap we approve the exact amount + 2% drift
        // buffer. Approval limits can only be enforced on the spender side
        // (here in the frontend) — the token contract is what owns the
        // allowance ledger.
        const APPROVAL_CAP_USDT = 10_000_000n // $10 USDT (6 decimals)
        const safeApprove = approveAmount > APPROVAL_CAP_USDT ? approveAmount : APPROVAL_CAP_USDT
        const approveHash = await writeContractAsync({
          address: usdtAddress,
          abi: USDT_ABI,
          functionName: 'approve',
          args: [contractAddress, safeApprove],
          dataSuffix,
        })

        // Wait for approve to fully confirm
        await publicClient.waitForTransactionReceipt({ hash: approveHash })

        // Wait for nonce to propagate on sequencer
        await new Promise(r => setTimeout(r, 3000))
      }

      // Step 2: Buy pixels
      setStep('buying')
      const buyHash = await writeContractAsync({
        address: contractAddress,
        abi: MONDETO_ABI,
        functionName: 'buyPixels',
        args: [bigIds],
        dataSuffix,
      })

      setTxHash(buyHash)
      setStep('confirming')

      const receipt = await publicClient.waitForTransactionReceipt({ hash: buyHash })

      if (receipt.status === 'reverted') {
        // Try to get the revert reason
        try {
          await publicClient.simulateContract({
            address: contractAddress,
            abi: MONDETO_ABI,
            functionName: 'buyPixels',
            args: [bigIds],
            account: address,
          })
        } catch (simErr) {
          console.error('Revert reason:', simErr)
          throw new Error('Transaction reverted: ' + (simErr instanceof Error ? simErr.message.slice(0, 150) : 'unknown reason'))
        }
        throw new Error('Transaction reverted on-chain')
      }

      setStep('success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Transaction failed'
      console.error('Buy failed:', msg)
      const short = msg.includes('User rejected') ? 'Transaction rejected by user'
        : msg.includes('nonce') ? 'Nonce error — please try again in a few seconds'
        : msg.includes('NotLand') ? 'Selected pixel is not land'
        : msg.includes('insufficient') || msg.includes('ERC20') ? 'Insufficient USDT balance or allowance'
        : msg.slice(0, 200)
      setError(short)
      setStep('error')
    }
  }, [writeContractAsync, usdtAddress, publicClient, address, contractAddress])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setTxHash(null)
    setInsufficientBalance(false)
  }, [])

  return { execute, step, txHash, error, reset, insufficientBalance, checkBalance }
}
