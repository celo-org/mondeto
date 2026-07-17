'use client'

import { useState, useCallback, useRef } from 'react'
import { useWriteContract, useAccount, usePublicClient, useSwitchChain } from 'wagmi'
import { celo } from 'viem/chains'
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

// ---------------------------------------------------------------------------
// TEMP MiniPay diagnostic (remove once the "permission denied" buy is fixed).
// MiniPay masks the real reason and viem re-wraps it, so we can't tell WHICH
// RPC method the wallet rejected. Patch the injected provider's `request` once
// and keep a small ring buffer of recent {method, params, error} — the buy
// catch then reports the exact call MiniPay denied.
// ---------------------------------------------------------------------------
type MiniPayCall = { method: string; params: string; error?: string }
const miniPayCallLog: MiniPayCall[] = []
let providerInstrumented = false

function shortParams(params: unknown): string {
  try {
    // For tx methods (eth_sendTransaction / eth_estimateGas) the first param is
    // the tx object. Pull only the fee-relevant fields — the raw `data` calldata
    // is long and would push feeCurrency/gas out of the truncated readout.
    const first = Array.isArray(params) ? params[0] : params
    if (first && typeof first === 'object') {
      const tx = first as Record<string, unknown>
      const keys = [
        'to',
        'from',
        'value',
        'gas',
        'gasPrice',
        'maxFeePerGas',
        'maxPriorityFeePerGas',
        'feeCurrency',
        'nonce',
        'type',
      ]
      const picked: string[] = []
      for (const k of keys) if (k in tx) picked.push(`${k}=${String(tx[k])}`)
      if ('data' in tx && typeof tx.data === 'string') {
        picked.push(`data(${tx.data.length}ch,sel=${tx.data.slice(0, 10)})`)
      }
      if (picked.length) return `{${picked.join(' ')}}`
    }
    const s = JSON.stringify(params, (_k, v) => (typeof v === 'bigint' ? `${v}` : v))
    return s.length > 200 ? `${s.slice(0, 200)}…` : s
  } catch {
    return '<unserializable>'
  }
}

function instrumentMiniPayProvider() {
  if (providerInstrumented) return
  if (typeof window === 'undefined') return
  const eth = window.ethereum as
    | { isMiniPay?: boolean; request?: (...a: unknown[]) => Promise<unknown> }
    | undefined
  if (!eth?.isMiniPay || typeof eth.request !== 'function') return
  const original = eth.request.bind(eth)
  try {
    eth.request = async (...args: unknown[]) => {
      const arg = (args[0] ?? {}) as { method?: string; params?: unknown }
      const entry: MiniPayCall = {
        method: String(arg?.method ?? '?'),
        params: shortParams(arg?.params),
      }
      miniPayCallLog.push(entry)
      if (miniPayCallLog.length > 12) miniPayCallLog.shift()
      try {
        return await original(...args)
      } catch (e) {
        entry.error = extractErrorDetail(e)
        throw e
      }
    }
    providerInstrumented = true
  } catch (e) {
    // Some providers freeze `request`; don't let instrumentation break buys.
    console.warn('MiniPay provider instrument failed:', e)
  }
}

// The most relevant call for the readout: the last one that errored, else the
// last one attempted.
function lastMiniPayFailure(): string {
  const failed = [...miniPayCallLog].reverse().find((c) => c.error)
  const c = failed ?? miniPayCallLog[miniPayCallLog.length - 1]
  if (!c) return 'no provider calls captured'
  return `${c.method} ${c.params}${c.error ? ` -> ${c.error.slice(0, 100)}` : ''}`
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

    // The contracts live on Celo. If the wallet is on another chain (common when
    // testing in a browser wallet that defaults to Ethereum), prompt a switch —
    // which also ADDS Celo to the wallet if it's missing — before touching any
    // funds. Without this the buy tx silently hangs on the wrong network.
    if (chainId !== celo.id) {
      try {
        await switchChainAsync({ chainId: celo.id })
      } catch {
        setError('Switch your wallet to the Celo network to buy.')
        setStep('error')
        inFlight.current = false
        return
      }
    }

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

    // TEMP diagnostic: patch MiniPay's provider so a failure names the exact
    // RPC call it rejected. Also record what we last handed the wallet.
    instrumentMiniPayProvider()
    const sendDiag: { step: string; to?: string; feeCurrency?: string; gas?: string } = {
      step: 'init',
    }

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
              approveGas = 150_000n
            }
          }
        }
        sendDiag.step = 'approve'
        sendDiag.to = tokenAddress
        sendDiag.feeCurrency = feeCurrency ?? 'none'
        sendDiag.gas = approveGas ? `${approveGas}` : 'none'
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
            buyGas = 300_000n + BigInt(bigIds.length) * 80_000n
          }
        }
      }
      sendDiag.step = 'buy'
      sendDiag.to = contractAddress
      sendDiag.feeCurrency = feeCurrency ?? 'none'
      sendDiag.gas = buyGas ? `${buyGas}` : 'none'
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
        // Name the exact provider call MiniPay rejected + what we handed it, so
        // a still-failing buy is self-explanatory on-device.
        const sent = `[${sendDiag.step}] to=${sendDiag.to?.slice(0, 10)} fee=${sendDiag.feeCurrency?.slice(0, 10)} gas=${sendDiag.gas}`
        const rpc = lastMiniPayFailure()
        const dbg = `code=${anyE?.code ?? anyE?.cause?.code} name=${anyE?.name ?? anyE?.cause?.name} :: ${detail.slice(0, 120)}`
        console.error('BUY DEBUG (minipay):', dbg, '|', sent, '| rpc:', rpc, e)
        setError(`${short} — DEBUG ${dbg} | SENT ${sent} | RPC ${rpc}`)
      } else {
        setError(short)
      }
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
