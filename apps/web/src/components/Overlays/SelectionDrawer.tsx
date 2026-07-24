'use client'

import React, { useMemo, useEffect, useRef } from 'react'
import type { PixelView } from '@/lib/mock'
import type { TxStep } from '@/hooks/useBuyPixels'
import { ZERO_ADDRESS } from '@/constants/map'
import { formatUSDT } from '@/lib/colorUtils'
import { generateUsername } from '@/lib/username'
import { MINIPAY_DEPOSIT_URL } from '@/lib/deeplinks'
import { isOverSpendCap } from '@/lib/buyLimits'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'
import { useMaps } from '@/hooks/useMaps'
import { track } from '@/lib/analytics'
import TxProgress from './TxProgress'
import SuccessState from './SuccessState'

interface OwnerGroup {
  owner: string
  color: string
  label: string
  url: string
  count: number
  price: bigint
  pixelIds: number[]
}

interface SelectionDrawerProps {
  visible: boolean
  selectedIds: Set<number>
  pixelData: PixelView[]
  totalPrice: bigint
  priceLoading: boolean
  insufficientBalance: boolean
  userBalance: bigint
  txStep: TxStep
  txHash: string | null
  /** Last error from the buy flow, if any — already mapped to a short,
   *  human-readable line (see lib/buyErrors). Shown under the pixel list;
   *  raw viem/wallet dumps are kept to the console, never rendered here. */
  txError: string | null
  userAddress?: string
  profilesMap?: Map<string, { label: string; url: string }>
  onRemovePixels: (ids: number[]) => void
  onClear: () => void
  onBuy: () => void
  onDone: () => void
}

export default function SelectionDrawer({
  visible,
  selectedIds,
  pixelData,
  totalPrice,
  priceLoading,
  insufficientBalance,
  userBalance,
  txStep,
  txHash,
  txError,
  userAddress,
  profilesMap,
  onRemovePixels,
  onClear,
  onBuy,
  onDone,
}: SelectionDrawerProps) {
  const isTxActive = txStep === 'approving' || txStep === 'buying' || txStep === 'confirming'
  const pixelCount = selectedIds.size

  // Each buy is settled in a single stablecoin — the user's highest-balance
  // one. We surface that symbol in copy so the rule reads as obvious instead
  // of needing explanation.
  const { preferred, totalAmount, isLoading: balancesLoading } = useStablecoinBalance()
  const payToken = preferred?.symbol ?? 'USDC'
  const { currentMapId } = useMaps()

  // Compute insufficient locally from the values we already render. The
  // parent also derives this through useBuyPixels.checkBalance, but that path
  // sets state in an effect and can lag the first render of the drawer —
  // computing here keeps the CTA state in sync with the numbers on screen.
  const insufficient = totalPrice > 0n && userBalance < totalPrice || insufficientBalance

  // Per-buy spend cap (MiniPay's $10 approval limit). Blocked before the wallet
  // opens so the player gets a clear "trim your pick" nudge instead of an opaque
  // wallet rejection. Insufficient-funds takes visual precedence when both hold.
  const overCap = isOverSpendCap(totalPrice)

  // Impression affordability is derived from THIS component's own balance
  // hook — the same instance the loading gate below trusts — never from the
  // parent `userBalance` prop. That prop is recomputed in a separate page
  // effect and lags by a commit, so the moment balances resolve it can still
  // read 0; mixing the two sources would fire a false "insufficient" with
  // balanceUsd: 0 and the fire-once ref would make it permanent. `balanceUsd`
  // and `totalAmount` come from one hook call, so they can't race each other.
  // (The CTA button still uses the parent prop for display — unchanged.)
  const totalPriceUsd = Number(totalPrice) / 1_000_000
  const balanceUsd = preferred?.amount ?? 0
  const impressionInsufficient =
    !priceLoading && !balancesLoading && totalPriceUsd > 0 && balanceUsd < totalPriceUsd
  // A "split currency" block is a distinct, fixable cause: the user holds
  // enough across all their stablecoins combined, but each buy settles in a
  // single coin (their highest-balance one), so the preferred balance alone
  // falls short. Worth separating from being genuinely broke.
  const splitCurrencyBlocked = impressionInsufficient && totalAmount >= totalPriceUsd

  // Fire a single funnel impression per drawer-open once prices AND balances
  // have settled, so the pre-buy drop-off (checkout_opened → pixel_buy_started)
  // can be split into named causes instead of one opaque "62% left". The ref
  // resets when the drawer closes so a later re-open counts again.
  const insufficientFiredRef = useRef(false)
  useEffect(() => {
    if (!visible) {
      insufficientFiredRef.current = false
      return
    }
    if (insufficientFiredRef.current) return
    // Wait for a settled idle state — during a tx the numbers can flip and
    // would misclassify the cause. (Price/balance loading is already folded
    // into impressionInsufficient.)
    if (txStep !== 'idle') return
    if (!impressionInsufficient) return

    insufficientFiredRef.current = true
    const base = {
      mapId: currentMapId,
      needUsd: totalPriceUsd - balanceUsd,
      balanceUsd,
      token: payToken,
      pixelCount,
    }
    if (splitCurrencyBlocked) {
      track('checkout_split_currency_blocked', { ...base, totalUsd: totalAmount })
    } else {
      track('checkout_insufficient_funds', base)
    }
  }, [
    visible,
    txStep,
    impressionInsufficient,
    splitCurrencyBlocked,
    totalPriceUsd,
    balanceUsd,
    totalAmount,
    currentMapId,
    payToken,
    pixelCount,
  ])

  // Group selected pixels by owner
  const groups = useMemo(() => {
    const map = new Map<string, OwnerGroup>()
    for (const id of selectedIds) {
      const px = pixelData[id]
      if (!px) continue
      const existing = map.get(px.owner)
      if (existing) {
        existing.count++
        existing.price += px.currentPrice
        existing.pixelIds.push(id)
      } else {
        map.set(px.owner, {
          owner: px.owner,
          color: px.color,
          label: px.label,
          url: px.url,
          count: 1,
          price: px.currentPrice,
          pixelIds: [id],
        })
      }
    }
    // Sort: unowned first, then by price desc
    return Array.from(map.values()).sort((a, b) => {
      if (a.owner === ZERO_ADDRESS) return -1
      if (b.owner === ZERO_ADDRESS) return 1
      return Number(b.price - a.price)
    })
  }, [selectedIds, pixelData])

  const ownerCount = groups.filter(g => g.owner !== ZERO_ADDRESS).length

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 56,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'var(--card-bg)',
        borderRadius: '18px 18px 0 0',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        maxHeight: '55vh',
        paddingBottom: 14,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Drag handle */}
      <div style={{ width: 32, height: 3, borderRadius: 2, background: '#c0b8ae', margin: '10px auto 8px', flexShrink: 0 }} />

      {/* Success state */}
      {txStep === 'success' && txHash && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <SuccessState pixelCount={pixelCount} totalPaid={`${formatUSDT(totalPrice)} ${payToken}`} txHash={txHash} onDone={onDone} />
        </div>
      )}

      {/* TX in progress */}
      {isTxActive && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 20px', maxWidth: 500, margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 7, fontFamily: "'Press Start 2P', monospace", color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 6 }}>THE DAMAGE</div>
            <div style={{ fontSize: 18, fontFamily: "'Press Start 2P', monospace", color: 'var(--text)' }}>{formatUSDT(totalPrice)} <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{payToken}</span></div>
          </div>
          <TxProgress step={txStep} />
          <div style={{ flex: 1 }} />
          <button
            disabled
            className="pixel-btn pixel-btn-filled font-display"
            style={{ width: '100%', fontSize: 10, letterSpacing: 2, padding: 12, opacity: 0.5, pointerEvents: 'none' }}
          >
            MAKING MOVES…
          </button>
        </div>
      )}

      {/* Idle / error — full buy view with breakdown */}
      {(txStep === 'idle' || txStep === 'error') && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 20px', overflow: 'hidden', maxWidth: 500, margin: '0 auto', width: '100%' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 7, fontFamily: "'Press Start 2P', monospace", color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 6 }}>THE DAMAGE</div>
            <div style={{ fontSize: 18, fontFamily: "'Press Start 2P', monospace", color: 'var(--text)' }}>
              {priceLoading ? '...' : `${formatUSDT(totalPrice)}`} <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{payToken}</span>
            </div>
            <div style={{ fontSize: 7, fontFamily: "'Press Start 2P', monospace", color: 'var(--text-muted)', marginTop: 6, letterSpacing: 1 }}>
              {pixelCount} spots · {ownerCount > 0 ? `${ownerCount} player${ownerCount > 1 ? 's' : ''} to outbid` : 'free real estate'}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, flexShrink: 0 }}>
            <button
              onClick={onClear}
              className="font-display"
              style={{
                fontSize: 9,
                letterSpacing: 2,
                color: 'var(--brand-orange)',
                border: '1px solid var(--brand-orange)',
                padding: '6px 16px',
                cursor: 'pointer',
                background: 'transparent',
                textTransform: 'uppercase',
              }}
            >
              CLEAR
            </button>
          </div>

          {/* Balance + warnings. Each buy is settled in a single stablecoin —
              the user's preferred (highest-balance) one — so the balance and
              the deficit are reported in THAT currency. The one-currency
              rule is stated inline so the user understands why they can't
              just spend their other balances. */}
          <div style={{ fontSize: 7, fontFamily: "'Press Start 2P', monospace", color: 'var(--text-muted)', marginBottom: 4, flexShrink: 0, textAlign: 'center', letterSpacing: 1 }}>
            balance: {formatUSDT(userBalance)} {payToken}
          </div>
          {insufficient && (
            <div style={{ marginBottom: 6, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <div style={{ fontSize: 7, color: 'var(--error)', textAlign: 'center', letterSpacing: 1, fontFamily: "'Press Start 2P', monospace" }}>
                need {formatUSDT(totalPrice - userBalance)} more {payToken}
              </div>
              <div style={{ fontSize: 6, color: 'var(--text-muted)', textAlign: 'center', letterSpacing: 1, fontFamily: "'Press Start 2P', monospace", maxWidth: 260, lineHeight: 1.5 }}>
                one currency per buy — top up {payToken.toLowerCase()} or pick fewer pixels
              </div>
              <a
                href={MINIPAY_DEPOSIT_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  track('topup_clicked', {
                    mapId: currentMapId,
                    shortfallUsd: Number(totalPrice - userBalance) / 1_000_000,
                    token: payToken,
                  })
                }
                className="pixel-btn pixel-btn-sm font-display"
                style={{ fontSize: 8, letterSpacing: 2, textDecoration: 'none' }}
              >
                TOP UP BALANCE
              </a>
            </div>
          )}
          {overCap && !insufficient && (
            <div style={{ marginBottom: 6, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <div style={{ fontSize: 7, color: 'var(--error)', textAlign: 'center', letterSpacing: 1, fontFamily: "'Press Start 2P', monospace" }}>
                over the $10 cap
              </div>
              <div style={{ fontSize: 6, color: 'var(--text-muted)', textAlign: 'center', letterSpacing: 1, fontFamily: "'Press Start 2P', monospace", maxWidth: 260, lineHeight: 1.5 }}>
                each buy is capped at $10 to keep your wallet safe — trim your pick to lock it in
              </div>
            </div>
          )}
          {userAddress && groups.some(g => g.owner.toLowerCase() === userAddress.toLowerCase()) && (
            <div style={{ fontSize: 7, color: '#e6a817', marginBottom: 2, flexShrink: 0 }}>
              ⚠ you already own some of these pixels — buying again will increase their price
            </div>
          )}

          {/* Breakdown list */}
          <div style={{ fontSize: 6, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 4, flexShrink: 0 }}>THE LOWDOWN</div>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
            {groups.map((group) => {
              const isUnowned = group.owner === ZERO_ADDRESS
              return (
                <div
                  key={group.owner}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '5px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {/* Color dot — owner colors stay as-is */}
                  {isUnowned ? (
                    <div style={{ width: 12, height: 12, borderRadius: 3, border: '0.5px dashed #c0b8ae', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: group.color || '#888', flexShrink: 0 }} />
                  )}

                  {/* Name — URL hidden, unverified user URLs are an XSS / phishing risk */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {(() => {
                      const prof = profilesMap?.get(group.owner.toLowerCase())
                      const name = prof?.label || group.label || (isUnowned ? 'unowned' : generateUsername(group.owner))
                      return (
                        <div style={{ fontSize: 8, color: isUnowned ? 'var(--text-muted)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'uppercase' }}>
                          {name}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Count + price */}
                  <span style={{ fontSize: 7, color: 'var(--text-muted)', flexShrink: 0, textTransform: 'uppercase' }}>{group.count} px</span>
                  <span style={{ fontSize: 8, fontWeight: 500, color: 'var(--text)', flexShrink: 0 }}>{formatUSDT(group.price)}</span>

                  {/* Remove button */}
                  <button
                    onClick={() => onRemovePixels(group.pixelIds)}
                    style={{ fontSize: 8, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>

          {/* Error — the short, human-readable reason from the buy flow.
              Fall back to a generic line only when the error string is empty. */}
          {txStep === 'error' && (
            <div style={{ fontSize: 7, color: 'var(--error)', marginBottom: 4, flexShrink: 0, lineHeight: 1.5, wordBreak: 'break-word' }}>
              {txError && txError.trim().length > 0 ? txError : "That didn't work. Try again?"}
            </div>
          )}

          {/* Buy button */}
          <button
            onClick={onBuy}
            disabled={insufficient || overCap || priceLoading}
            className="pixel-btn pixel-btn-filled font-display"
            style={{
              width: '100%',
              fontSize: 10,
              letterSpacing: 2,
              padding: 12,
              opacity: insufficient || overCap || priceLoading ? 0.5 : 1,
              cursor: insufficient || overCap || priceLoading ? 'default' : 'pointer',
              pointerEvents: insufficient || overCap || priceLoading ? 'none' : 'auto',
              flexShrink: 0,
            }}
          >
            {priceLoading
              ? 'CHECKING PRICES…'
              : insufficient
                ? 'NOT ENOUGH FUNDS'
                : overCap
                  ? 'TRIM TO $10'
                  : `LOCK IT IN — ${formatUSDT(totalPrice)} ${payToken}`}
          </button>
        </div>
      )}
    </div>
  )
}
