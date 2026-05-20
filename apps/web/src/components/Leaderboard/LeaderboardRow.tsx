'use client'

import type { LeaderboardEntry } from '@/hooks/useLeaderboard'
import { generateUsername } from '@/lib/username'

interface LeaderboardRowProps {
  entry: LeaderboardEntry
}

const PIXEL_FONT = "'Press Start 2P', monospace"
const BRAND_LIME = '#A7FF05'

function rankSuffix(rank: number): string {
  if (rank === 1) return '1ST'
  if (rank === 2) return '2ND'
  if (rank === 3) return '3RD'
  return `${rank}TH`
}

export default function LeaderboardRow({ entry }: LeaderboardRowProps) {
  // URL field hidden — unverified user-entered URLs are an injection /
  // phishing vector. Re-enable once URL verification is in place.
  const isTop3 = entry.rank <= 3
  const rankColor = isTop3 ? BRAND_LIME : 'rgba(255,255,255,0.55)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: isTop3 ? '14px 16px' : '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        maxWidth: 500,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Rank */}
      <span
        style={{
          fontSize: isTop3 ? 12 : 9,
          fontWeight: 700,
          width: 44,
          textAlign: 'right',
          color: rankColor,
          flexShrink: 0,
          fontFamily: PIXEL_FONT,
          letterSpacing: 2,
        }}
      >
        {rankSuffix(entry.rank)}
      </span>

      {/* Name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: isTop3 ? 10 : 9,
            fontFamily: PIXEL_FONT,
            letterSpacing: 2,
            color: '#FFFFFF',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {entry.label || generateUsername(entry.owner)}
        </div>
      </div>

      {/* Score */}
      <span
        style={{
          fontSize: isTop3 ? 12 : 10,
          letterSpacing: 2,
          color: isTop3 ? BRAND_LIME : '#FFFFFF',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          fontFamily: PIXEL_FONT,
        }}
      >
        {entry.value}
      </span>

      {/* Unit */}
      <span
        style={{
          fontSize: 7,
          color: 'rgba(255,255,255,0.45)',
          flexShrink: 0,
          fontFamily: PIXEL_FONT,
        }}
      >
        {entry.unit}
      </span>
    </div>
  )
}
