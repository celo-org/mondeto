'use client'
import React from 'react'
import { dailyFallPct, halvingPeriodDays } from '@/lib/decay'

interface DealsLegendProps {
  visible: boolean
  /** Map-global halving time in seconds (config().halvingTime). */
  halvingTimeSeconds?: number
}

/**
 * Legend for the DEALS map view. Sibling of HeatmapLegend — same card,
 * lime ramp instead of the warm heat ramp. Mirrors interpolateLimeGradient
 * in PixelLayer.
 */
export default function DealsLegend({ visible, halvingTimeSeconds }: DealsLegendProps) {
  if (!visible) return null

  const hasHalving = Boolean(halvingTimeSeconds && halvingTimeSeconds > 0)
  const fallPct = hasHalving ? dailyFallPct(halvingTimeSeconds!) : null
  const halvingDays = hasHalving ? Math.round(halvingPeriodDays(halvingTimeSeconds!)) : null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 68,
        left: 10,
        right: 10,
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '6px 10px',
        zIndex: 5,
      }}
    >
      <div
        style={{
          height: 8,
          background:
            'linear-gradient(to right, #223300, #548002, #A7FF05, #E0FF9E)',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 2,
        }}
      >
        <span style={{ fontSize: 6, color: 'var(--text-muted)', fontFamily: "'Press Start 2P', monospace" }}>
          BARELY CHEAPER
        </span>
        <span style={{ fontSize: 6, color: 'var(--text-muted)', fontFamily: "'Press Start 2P', monospace" }}>
          DEEPEST DEAL
        </span>
      </div>
      <div
        style={{
          fontSize: 6,
          color: 'var(--text-muted)',
          fontFamily: "'Press Start 2P', monospace",
          marginTop: 4,
          letterSpacing: 0.5,
          lineHeight: 1.5,
        }}
      >
        {fallPct !== null && halvingDays !== null
          ? `BRIGHTER = CHEAPER RIGHT NOW. PRICE HALVES EVERY ~${halvingDays} DAYS, SO IT DROPS ~${fallPct.toFixed(1)}%/DAY UNTIL SOMEONE BUYS.`
          : 'BRIGHTER = CHEAPER RIGHT NOW. THE LONGER LAND SITS UNSOLD, THE CHEAPER IT GETS.'}
      </div>
    </div>
  )
}
