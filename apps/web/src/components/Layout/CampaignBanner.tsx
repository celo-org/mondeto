'use client'
import React, { useState } from 'react'

// Update this for each campaign — set to null to hide
const CAMPAIGN_TEXT = '15 USDT prize pool — top 3 per leaderboard win — rewards drop today 5pm GMT — climb the ranks'

export default function CampaignBanner() {
  const [dismissed, setDismissed] = useState(false)

  if (!CAMPAIGN_TEXT || dismissed) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 56,
        left: 0,
        right: 0,
        zIndex: 14,
        height: 20,
        background: '#A7FF05',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          whiteSpace: 'nowrap',
          animation: 'marquee 18s linear infinite',
          fontSize: 7,
          fontFamily: "'Press Start 2P', monospace",
          letterSpacing: 1,
          color: '#000000',
        }}
      >
        <span style={{ paddingRight: 80 }}>{CAMPAIGN_TEXT}</span>
        <span style={{ paddingRight: 80 }}>{CAMPAIGN_TEXT}</span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{
          position: 'absolute',
          right: 4,
          background: '#A7FF05',
          border: 'none',
          color: '#000000',
          fontSize: 8,
          cursor: 'pointer',
          padding: '0 4px',
          fontFamily: "'Press Start 2P', monospace",
        }}
      >
        x
      </button>
    </div>
  )
}
