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

// Visual hierarchy steps from 1st → 5th, then everyone else lands on the
// default tier. Each step shrinks the rank/name/score type sizes and the
// row padding so the top of the board reads as a clear ladder.
interface RowTier {
  rankFs: number
  nameFs: number
  scoreFs: number
  padY: number
}

const DEFAULT_TIER: RowTier = { rankFs: 9, nameFs: 9, scoreFs: 10, padY: 10 }

const RANK_TIERS: readonly RowTier[] = [
  { rankFs: 13, nameFs: 11, scoreFs: 13, padY: 16 }, // 1st
  { rankFs: 12, nameFs: 10, scoreFs: 12, padY: 14 }, // 2nd
  { rankFs: 11, nameFs: 10, scoreFs: 11, padY: 13 }, // 3rd
  { rankFs: 10, nameFs: 9, scoreFs: 11, padY: 12 }, // 4th
  DEFAULT_TIER, // 5th — same dimensions as default, ends the visual ladder
]

function tierFor(rank: number): RowTier {
  return rank >= 1 && rank <= RANK_TIERS.length
    ? RANK_TIERS[rank - 1]
    : DEFAULT_TIER
}

export default function LeaderboardRow({ entry }: LeaderboardRowProps) {
  // URL field hidden — unverified user-entered URLs are an injection /
  // phishing vector. Re-enable once URL verification is in place.
  const tier = tierFor(entry.rank)
  const isPodium = entry.rank <= 3
  const rankColor = isPodium ? BRAND_LIME : 'rgba(255,255,255,0.55)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: `${tier.padY}px 16px`,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        maxWidth: 500,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Rank */}
      <span
        style={{
          fontSize: tier.rankFs,
          fontWeight: 700,
          width: 44,
          textAlign: 'center',
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
            fontSize: tier.nameFs,
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
          fontSize: tier.scoreFs,
          letterSpacing: 2,
          color: isPodium ? BRAND_LIME : '#FFFFFF',
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
