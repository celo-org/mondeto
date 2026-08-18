'use client'

import { useState, useCallback, useRef } from 'react'
import { useWriteContract, useAccount, usePublicClient, useSwitchChain } from 'wagmi'
import { celo } from 'viem/chains'
import { MONDETO_ABI, ERC20_ABI } from '@/lib/contract'
import { getAttributionSuffix } from '@/lib/attribution'
import { getFeeCurrency } from '@/lib/feeCurrency'
import { getContractByMapId } from '@/lib/maps/contracts'
import { classifyBuy, isUserRejectedError } from '@/lib/buyErrors'
import type { BuyBlockedReason, GasFallbackLevel } from '@/lib/buyErrors'
import {
  APPROVAL_CAP_USD,
  BPS_DENOM,
  SLIPPAGE_BPS,
  isOverSpendCap,
  OVER_SPEND_CAP_MESSAGE,
  PRICE_MOVED_MESSAGE,
} from '@/lib/buyLimits'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'
import { getReferrer, track } from '@/lib/analytics'
import type { MapId } from '@/lib/maps/types'

export type TxStep = 'idle' | 'approving' | 'buying' | 'confirming' | 'success' | 'error'

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
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
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

    // Shared by every event this function emits. Built before the pre-wallet
    // guards below so a blocked buy reports the same shape as one that ran —
    // `token` is the only field that can't exist yet, since the guards include
    // "no stablecoin at all".
    const baseProps = {
      mapId: mapId ?? 0,
      pixelCount: ids.length,
      totalPriceUsd: Number(totalPriceHint) / 1_000_000,
      ref: getReferrer() ?? undefined,
    }
    // The three guards below stop the buy BEFORE `pixel_buy_started` fires, so
    // they are absent from the started/failed funnel by construction — counting
    // them as failures would break that funnel's arithmetic, and leaving them
    // silent is what made them invisible in the first place. They get their own
    // event instead: never preceded by `pixel_buy_started`, never followed by
    // `pixel_buy_failed`, and safe to sum separately.
    const trackBlocked = (reason: BuyBlockedReason) => {
      track('pixel_buy_blocked', { ...baseProps, reason })
    }

    // The contracts live on Celo. If the wallet is on another chain (common when
    // testing in a browser wallet that defaults to Ethereum), prompt a switch —
    // which also ADDS Celo to the wallet if it's missing — before touching any
    // funds. Without this the buy tx silently hangs on the wrong network.
    if (chainId !== celo.id) {
      try {
        await switchChainAsync({ chainId: celo.id })
      } catch (e) {
        // Split rather than filing everything as a rejection: a wallet that
        // fails `wallet_addEthereumChain` outright is a compatibility problem
        // we can act on, while a decline is a user choice we can't. Calling
        // both "rejected" would bury the actionable one.
        trackBlocked(
          isUserRejectedError(e, e instanceof Error ? e.message : String(e))
            ? 'chain_switch_rejected'
            : 'chain_switch_failed',
        )
        setError('Switch your wallet to the Celo network to buy.')
        setStep('error')
        inFlight.current = false
        return
      }
    }

    if (!preferred) {
      trackBlocked('no_stablecoin_balance')
      setError('No stablecoin balance — top up before buying.')
      setStep('error')
      inFlight.current = false
      return
    }

    // Enforce the $10 approval cap before opening the wallet. A purchase over
    // the cap would request an approval MiniPay rejects, failing with an opaque
    // error — so block it here with a clear message. Also covers the
    // single-pixel path (onBuyThisPixel), which never renders the drawer gate.
    if (isOverSpendCap(totalPriceHint)) {
      trackBlocked('over_spend_cap')
      setError(OVER_SPEND_CAP_MESSAGE)
      setStep('error')
      inFlight.current = false
      return
    }

    const tokenAddress = preferred.address
    const tokenDecimals = preferred.decimals
    const eventProps = { ...baseProps, token: preferred.symbol }
    // A gas estimate that fell back is not a failure — the buy usually still
    // goes out — but it is the tell for the MiniPay CIP-64 hazard, so it has to
    // be visible on its own rather than only when the buy later dies.
    // `level: 'ceiling'` is always preceded by `'without_fee_currency'` for the
    // same stage — the ceiling branch is nested inside the retry's catch — so
    // count `without_fee_currency` to size the affected buys. `ceiling` is a
    // strict subset, and summing raw events overstates by roughly 2x.
    const trackGasFallback = (stage: 'approve' | 'buy', level: GasFallbackLevel, err: unknown) => {
      track('pixel_buy_gas_fallback', {
        ...eventProps,
        stage,
        level,
        // Unwrapped, not the raw message. viem masks provider failures as "An
        // unknown RPC error occurred" at the top level and puts the real reason
        // in `.cause`/`.details` — so for the MiniPay estimate failure this
        // event exists to explain, the raw first 100 chars are boilerplate and
        // a URL while `permission denied` sits well past the cut. Using the
        // unwrapped detail also keeps the authenticated RPC URL out of PostHog.
        detail: extractErrorDetail(err).slice(0, 100),
      })
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
      const capInToken = APPROVAL_CAP_USD * tenToTokenDec
      // Authoritative cap check against the LIVE price. The pick was within $10
      // when chosen (the instant guard cleared it), so if the buffered approval
      // now tops the cap the price ticked up in between — tell the player that
      // plainly and block, so the tx never reaches MiniPay to be rejected.
      if (approveAmount > capInToken) {
        track('pixel_buy_over_cap', { ...eventProps, reason: 'price_moved' })
        setError(PRICE_MOVED_MESSAGE)
        setStep('error')
        return
      }
      // In range: approve the flat $10 standing allowance (fewer repeat prompts).
      const safeApprove = capInToken

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
        // Estimate gas via the read client (Forno) and pass it explicitly
        // (see buyPixels below for why this matters in MiniPay).
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
          console.warn('approve gas estimate (feeCurrency) failed:', err)
          // In MiniPay we must NEVER send without a gas limit — a gas-less send
          // makes the wallet run its own eth_estimateGas, which returns
          // "permission denied". Retry the estimate without feeCurrency (widely
          // accepted), padding for the CIP-64 intrinsic overhead; last resort a
          // safe ceiling so the tx still goes out with a limit.
          if (feeCurrency) {
            trackGasFallback('approve', 'without_fee_currency', err)
            try {
              const g = await publicClient.estimateContractGas({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [contractAddress, safeApprove],
                account: address,
              })
              approveGas = (g * 12n) / 10n + 60_000n
            } catch (err2) {
              console.warn('approve gas fallback failed; using ceiling:', err2)
              trackGasFallback('approve', 'ceiling', err2)
              approveGas = 150_000n
            }
          }
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
          // Always pass an explicit gas limit when we have one. REQUIRED in
          // MiniPay (feeCurrency set): without it viem asks MiniPay to estimate
          // and MiniPay returns "permission denied". This mirrors the on-chain
          // config that worked (CIP-64 tx + explicit gas).
          ...(approveGas ? { gas: approveGas } : {}),
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
        // Wait for nonce to propagate on sequencer
        await new Promise((r) => setTimeout(r, 3000))
      }

      // Step 2: Buy pixels with the chosen token.
      setStep('buying')
      // Estimate gas via the read client (Forno) and pass it explicitly. A
      // fee-currency (CIP-64) tx costs more intrinsic gas. Passing the limit is
      // REQUIRED in MiniPay: a gas-less send makes viem call MiniPay's own
      // eth_estimateGas, which returns "permission denied" and kills the buy.
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
        console.warn('buyPixels gas estimate (feeCurrency) failed:', err)
        // MiniPay: never fall through to a gas-less send (see approve above).
        // Retry without feeCurrency, then a pixel-count-scaled ceiling.
        if (feeCurrency) {
          trackGasFallback('buy', 'without_fee_currency', err)
          try {
            const g = await publicClient.estimateContractGas({
              address: contractAddress,
              abi: MONDETO_ABI,
              functionName: 'buyPixels',
              args: [bigIds, tokenAddress, maxTotalCost, deadline],
              account: address,
            })
            buyGas = (g * 12n) / 10n + 100_000n
          } catch (err2) {
            console.warn('buyPixels gas fallback failed; using ceiling:', err2)
            trackGasFallback('buy', 'ceiling', err2)
            buyGas = 300_000n + BigInt(bigIds.length) * 80_000n
          }
        }
      }
      const buyHash = await writeContractAsync({
        address: contractAddress,
        abi: MONDETO_ABI,
        functionName: 'buyPixels',
        args: [bigIds, tokenAddress, maxTotalCost, deadline],
        dataSuffix,
        ...(feeCurrency ? { feeCurrency } : {}),
        // See approve above: always pass an explicit gas limit — required in
        // MiniPay so viem never asks the wallet to estimate.
        ...(buyGas ? { gas: buyGas } : {}),
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
      // A wallet rejection is the user backing out on purpose, not a failure.
      // Silently return them to the buying frame (BUY button ready again) —
      // no red error, nothing to dismiss.
      if (isUserRejectedError(e, hay)) {
        track('pixel_buy_rejected', eventProps)
        setError(null)
        setStep('idle')
        return
      }
      // Keep the raw error in the console for debugging; show players only the
      // short, human-readable line — never the raw viem/wallet dump.
      console.error('Buy failed:', detail, e)
      const { message: short, category } = classifyBuy(hay, preferred.symbol)
      // `reason` is player copy and moves with wording; `category` is the
      // stable key to segment on. `detail` carries the unwrapped raw error
      // (truncated, same as profile_save_failed) so a rising `unknown` bucket
      // can be read and turned into a new branch instead of guessed at.
      track('pixel_buy_failed', {
        ...eventProps,
        reason: short,
        category,
        detail: detail.slice(0, 100),
      })
      setError(short)
      setStep('error')
    } finally {
      inFlight.current = false
    }
  }, [writeContractAsync, publicClient, address, chainId, switchChainAsync, contractAddress, preferred, mapId])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setTxHash(null)
    setInsufficientBalance(false)
  }, [])

  return { execute, step, txHash, error, reset, insufficientBalance, checkBalance }
}
