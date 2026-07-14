'use client'

import { useState, useCallback, useRef } from 'react'
import { useWriteContract, useAccount, usePublicClient } from 'wagmi'
import { MONDETO_ABI, ERC20_ABI } from '@/lib/contract'
import { getAttributionSuffix } from '@/lib/attribution'
import { getFeeCurrency } from '@/lib/feeCurrency'
import { getContractByMapId } from '@/lib/maps/contracts'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'
import { getReferrer, track } from '@/lib/analytics'
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

// Pull the most specific message out of a (possibly viem-wrapped) error. viem
// masks provider failures as "An unknown RPC error occurred" at the top level
// while the real reason lives in `.cause`/`.details`/`.data` — surface that so
// MiniPay failures show why instead of a generic string.
function extractErrorDetail(e: unknown): string {
  if (!e || typeof e !== 'object') return typeof e === 'string' ? e : 'Transaction failed'
  const err = e as {
    shortMessage?: string
    details?: string
    message?: string
    cause?: {
      shortMessage?: string
      details?: string
      message?: string
      data?: { message?: string }
      cause?: { shortMessage?: string; message?: string; details?: string }
    }
  }
  return (
    err.cause?.cause?.details ||
    err.cause?.cause?.shortMessage ||
    err.cause?.cause?.message ||
    err.cause?.data?.message ||
    err.cause?.details ||
    err.cause?.shortMessage ||
    err.cause?.message ||
    err.details ||
    err.shortMessage ||
    err.message ||
    'Transaction failed'
  )
}

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
  // Re-entrancy guard: a second tap on BUY before React re-renders the
  // drawer must not start a parallel approve/buy sequence (= double
  // wallet prompts, potential double spend).
  const inFlight = useRef(false)

  const checkBalance = useCallback((totalPrice: bigint, userBalance: bigint) => {
    const insufficient = userBalance < totalPrice
    setInsufficientBalance(insufficient)
    return !insufficient
  }, [])

  const execute = useCallback(async (ids: number[], totalPriceHint: bigint) => {
    if (!publicClient || !address) return
    if (inFlight.current) return
    inFlight.current = true

    if (!preferred) {
      setError('No stablecoin balance — top up before buying.')
      setStep('error')
      inFlight.current = false
      return
    }

    const tokenAddress = preferred.address
    const tokenDecimals = preferred.decimals
    const eventProps = {
      mapId: mapId ?? 0,
      pixelCount: ids.length,
      totalPriceUsd: Number(totalPriceHint) / 1_000_000,
      token: preferred.symbol,
      ref: getReferrer() ?? undefined,
    }
    track('pixel_buy_started', eventProps)

    try {
      setStep('approving')
      setError(null)

      const bigIds = ids.map((id) => BigInt(id))
      const dataSuffix = getAttributionSuffix()
      // In MiniPay, pay gas in the same stablecoin being spent (CIP-64) — the
      // wallet holds no CELO. undefined elsewhere, so other wallets are unchanged.
      const feeCurrency = getFeeCurrency(tokenAddress)

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
        // Funnel step between started and succeeded: fired only when the
        // wallet actually surfaces an approval prompt. Buys that clear on a
        // standing allowance skip this, so the drop-off here measures the
        // approval wall specifically.
        track('pixel_buy_approve_shown', eventProps)
        // Estimate gas WITH feeCurrency via the read client and pass it
        // explicitly (see buyPixels below for why). undefined on failure so the
        // wallet falls back to estimating itself.
        let approveGas: bigint | undefined
        try {
          const g = await publicClient.estimateContractGas({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [contractAddress, safeApprove],
            account: address,
            ...(feeCurrency ? { feeCurrency } : {}),
          })
          approveGas = (g * 12n) / 10n
        } catch (err) {
          console.warn('approve gas estimate failed; wallet will estimate:', err)
        }
        const approveHash = await writeContractAsync({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [contractAddress, safeApprove],
          dataSuffix,
          // feeCurrency + gas are Celo (CIP-64) fields wagmi's generic write
          // type doesn't surface; spread them so the rest stays type-checked.
          ...(feeCurrency ? { feeCurrency } : {}),
          // Only force a gas limit OUTSIDE MiniPay. MiniPay's own docs example
          // sends `feeCurrency` with no explicit gas and estimates internally;
          // handing it a pre-computed gas limit gets the tx rejected.
          ...(approveGas && !feeCurrency ? { gas: approveGas } : {}),
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
        // Wait for nonce to propagate on sequencer
        await new Promise((r) => setTimeout(r, 3000))
      }

      // Step 2: Buy pixels with the chosen token.
      setStep('buying')
      // Estimate gas WITH feeCurrency via the read client (Forno) and pass it
      // explicitly. A fee-currency (CIP-64) tx costs more intrinsic gas, and
      // letting MiniPay estimate a fee-currency tx itself is a prime cause of
      // the opaque "unknown RPC error" — pre-estimating means the wallet only
      // has to sign + send. undefined on failure -> wallet estimates itself.
      let buyGas: bigint | undefined
      try {
        const g = await publicClient.estimateContractGas({
          address: contractAddress,
          abi: MONDETO_ABI,
          functionName: 'buyPixels',
          args: [bigIds, tokenAddress, maxTotalCost, deadline],
          account: address,
          ...(feeCurrency ? { feeCurrency } : {}),
        })
        buyGas = (g * 12n) / 10n
      } catch (err) {
        console.warn('buyPixels gas estimate failed; wallet will estimate:', err)
      }
      const buyHash = await writeContractAsync({
        address: contractAddress,
        abi: MONDETO_ABI,
        functionName: 'buyPixels',
        args: [bigIds, tokenAddress, maxTotalCost, deadline],
        dataSuffix,
        ...(feeCurrency ? { feeCurrency } : {}),
        // See approve above: no explicit gas in MiniPay — let the wallet estimate.
        ...(buyGas && !feeCurrency ? { gas: buyGas } : {}),
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

      track('pixel_buy_succeeded', { ...eventProps, txHash: buyHash })
      setStep('success')
    } catch (e) {
      // Unwrap the wallet-masked error so a real reason survives. Match against
      // both the top-level message and the unwrapped detail.
      const detail = extractErrorDetail(e)
      const msg = e instanceof Error ? e.message : String(e)
      const hay = `${msg} ${detail}`
      console.error('Buy failed:', detail, e)
      const short = hay.includes('User rejected')
        ? 'Transaction rejected by user'
        : hay.includes('nonce')
          ? 'Nonce error — please try again in a few seconds'
          : hay.includes('NotLand')
            ? 'Selected pixel is not land'
            : hay.includes('TokenNotAccepted')
              ? `${preferred.symbol} is not accepted by this map yet`
              : hay.includes('SlippageExceeded')
                ? 'Price moved above your limit — please review and try again'
                : hay.includes('DeadlineExpired')
                  ? 'Transaction expired — please try again'
                  : hay.includes('insufficient') || hay.includes('ERC20')
                    ? `Insufficient ${preferred.symbol} balance or allowance`
                    : detail.slice(0, 200)
      track('pixel_buy_failed', { ...eventProps, reason: short })
      // TEMP DIAGNOSTIC (remove after MiniPay "permission denied" is fixed):
      // MiniPay masks the real reason, so surface its raw error code/name/detail
      // on-screen inside MiniPay only — desktop UX is unchanged.
      const inMiniPay =
        typeof window !== 'undefined' &&
        Boolean((window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay)
      if (inMiniPay) {
        const anyE = e as {
          code?: unknown
          name?: unknown
          cause?: { code?: unknown; name?: unknown }
        }
        const dbg = `code=${anyE?.code ?? anyE?.cause?.code} name=${anyE?.name ?? anyE?.cause?.name} :: ${detail.slice(0, 180)}`
        console.error('BUY DEBUG (minipay):', dbg, e)
        setError(`${short} — DEBUG ${dbg}`)
      } else {
        setError(short)
      }
      setStep('error')
    } finally {
      inFlight.current = false
    }
  }, [writeContractAsync, publicClient, address, contractAddress, preferred, mapId])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setTxHash(null)
    setInsufficientBalance(false)
  }, [])

  return { execute, step, txHash, error, reset, insufficientBalance, checkBalance }
}
