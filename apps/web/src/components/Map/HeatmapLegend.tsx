'use client'
import React from 'react'

interface HeatmapLegendProps {
  visible: boolean
}

export default function HeatmapLegend({ visible }: HeatmapLegendProps) {
  if (!visible) return null

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
            'linear-gradient(to right, #3A1E0A, #6B2F0E, #A14310, #D85614, #FF4C00, #FF8A4C, #FFC499, #FFFFFF)',
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
          1 sale
        </span>
        <span style={{ fontSize: 6, color: 'var(--text-muted)', fontFamily: "'Press Start 2P', monospace" }}>
          most sold
        </span>
      </div>
    </div>
  )
}
