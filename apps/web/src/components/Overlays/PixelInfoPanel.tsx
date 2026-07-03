'use client'

import React from 'react'
import type { PixelView } from '@/lib/mock'
import { formatUSDT, ownerDefaultColor } from '@/lib/colorUtils'
import { dailyFallPct, dealDepth } from '@/lib/decay'
import { generateUsername } from '@/lib/username'
import { ZERO_ADDRESS } from '@/constants/map'
import { track } from '@/lib/analytics'

interface PixelInfoPanelProps {
  visible: boolean
  pixel: PixelView | null
  pixelId: number
  /** Map-global halving time in seconds (config().halvingTime) — while
   *  unsold, every pixel's price falls at a constant daily rate. */
  halvingTime?: bigint
  /** Map entry price (config().initialPrice, micro-USDT). */
  initialPrice?: bigint
  onBuyThisPixel: (id: number) => void
  onDismiss: () => void
}

function truncateAddress(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

export default function PixelInfoPanel({
  visible,
  pixel,
  pixelId,
  halvingTime,
  initialPrice,
  onBuyThisPixel,
  onDismiss,
}: PixelInfoPanelProps) {
  React.useEffect(() => {
    if (visible && pixel != null) {
      track('pixel_info_viewed', { pixelId, owned: pixel.owner !== ZERO_ADDRESS })
    }
    // fire once per inspected pixel — `pixel` object identity churns on poll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pixelId])

  if (!pixel) return null

  // While unsold, the price decays continuously — a constant daily rate,
  // not a countdown. The rate is map-global (one halving clock per map).
  const fallPct =
    halvingTime !== undefined && halvingTime > 0n
      ? dailyFallPct(Number(halvingTime))
      : null
  // A deal: current price has decayed below the map's entry price.
  const depthPct =
    initialPrice !== undefined
      ? Math.round(dealDepth(pixel.currentPrice, initialPrice) * 100)
      : 0

  const firstLetter = pixel.label ? pixel.label[0].toUpperCase() : '?'
  const firstLetterColor = pixel.label ? 'white' : 'var(--text-muted)'
  const prevPrice = pixel.currentPrice / 2n
  const ownerDisplay = pixel.label || generateUsername(pixel.owner)
  const isOwned = pixel.owner !== ZERO_ADDRESS
  // Owned pixels show the owner's color (on-chain, or the deterministic
  // per-address fallback when unset); truly unowned land stays cream.
  const avatarColor = isOwned
    ? pixel.color || ownerDefaultColor(pixel.owner)
    : '#e0d8ce'

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
      }}
    >
      {/* Drag handle */}
      <div
        style={{
          width: 32,
          height: 3,
          borderRadius: 2,
          background: '#c0b8ae',
          margin: '10px auto 0',
        }}
      />

      {/* Owner row */}
      <div
        style={{
          padding: '8px 14px 10px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* Avatar — owner color stays as-is */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            background: avatarColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 500, color: firstLetterColor }}>
            {firstLetter}
          </span>
        </div>

        {/* Middle */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)' }}>{ownerDisplay}</div>
          <div style={{ fontSize: 7, color: 'var(--text-muted)', letterSpacing: 0.5 }}>
            {truncateAddress(pixel.owner)}
          </div>
        </div>

        {/* Sale count */}
        <div>
          <div style={{ fontSize: 6, color: 'var(--text-muted)', letterSpacing: 0.5 }}>SALE #</div>
          <div style={{ fontSize: 8, color: 'var(--text)' }}>{pixel.saleCount}</div>
        </div>
      </div>

      {/* Label field */}
      <div style={{ padding: '7px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 6, color: 'var(--text-muted)', letterSpacing: 1 }}>LABEL</div>
        <div style={{ fontSize: 9, color: 'var(--text)' }}>{pixel.label || '—'}</div>
      </div>

      {/* URL field removed — unverified user-entered URLs are an injection /
          phishing vector. Re-add once URL verification is in place. */}

      {/* Price cards row */}
      <div style={{ padding: '8px 14px', display: 'flex', gap: 8 }}>
        {/* BUY PRICE */}
        <div
          style={{
            flex: 1,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 8px',
          }}
        >
          <div style={{ fontSize: 6, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 2 }}>
            BUY PRICE
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
            {formatUSDT(pixel.currentPrice)}
          </div>
          <div style={{ fontSize: 6, color: 'var(--text-muted)', marginTop: 1 }}>USDT</div>
        </div>

        {/* PREV SALE */}
        <div
          style={{
            flex: 1,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 8px',
          }}
        >
          <div style={{ fontSize: 6, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 2 }}>
            PREV SALE
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
            {formatUSDT(prevPrice)}
          </div>
          <div style={{ fontSize: 6, color: 'var(--text-muted)', marginTop: 1 }}>USDT</div>
        </div>

        {/* SOLD */}
        <div
          style={{
            flex: 1,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 8px',
          }}
        >
          <div style={{ fontSize: 6, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 2 }}>
            SOLD
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
            {pixel.saleCount}
          </div>
          <div style={{ fontSize: 6, color: 'var(--text-muted)', marginTop: 1 }}>×</div>
        </div>
      </div>

      {/* Falling price — continuous decay while unsold, map-global rate */}
      {fallPct !== null && (
        <div style={{ padding: '0 14px 4px' }}>
          <div style={{ fontSize: 6, color: 'var(--text-muted)', letterSpacing: 1 }}>
            UNSOLD PRICE FALLS ~{fallPct.toFixed(1)}%/DAY
          </div>
          {depthPct > 0 && (
            <div style={{ fontSize: 6, color: 'var(--brand-lime)', letterSpacing: 1, marginTop: 3 }}>
              NOW {depthPct}% UNDER ENTRY PRICE — SOMEONE WILL NOTICE
            </div>
          )}
        </div>
      )}

      {/* Buy button */}
      <div style={{ padding: '4px 14px 0' }}>
        <button
          onClick={() => onBuyThisPixel(pixelId)}
          className="pixel-btn pixel-btn-filled font-display"
          style={{
            width: '100%',
            fontSize: 10,
            letterSpacing: 2,
            padding: 12,
          }}
        >
          BUY THIS PIXEL
        </button>
      </div>

      {/* Note */}
      <div
        style={{
          fontSize: 7,
          color: 'var(--text-muted)',
          textAlign: 'center',
          marginTop: 5,
          paddingBottom: 14,
        }}
      >
        previous owner gets {formatUSDT(pixel.currentPrice)} USDT instantly
      </div>
    </div>
  )
}
