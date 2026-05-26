'use client'

import type { LeaderboardEntry } from '@/hooks/useLeaderboard'
import { generateUsername } from '@/lib/username'

interface LeaderboardRowProps {
  entry: LeaderboardEntry
}

const PIXEL_FONT = "'Press Start 2P', monospace"
const BRAND_ORANGE = '#FF4C00'
const BRAND_PURPLE = '#B430FF'

// Top-5 highlight: 1-3 in brand orange (podium), 4-5 in brand purple
// (runners-up). Everything below 5 falls back to the muted defaults.
function rankAccentColor(rank: number): string | null {
  if (rank <= 3) return BRAND_ORANGE
  if (rank <= 5) return BRAND_PURPLE
  return null
}

function rankSuffix(rank: number): string {
  if (rank === 1) return '1ST'
  if (rank === 2) return '2ND'
  if (rank === 3) return '3RD'
  return `${rank}TH`
}

// Every row uses the same name/score/padding. Only the rank label on the
// #1 row is bumped up so the leader visibly pops without making the whole
// row taller than the rest. The rank column width is the same on every
// row so the right edges of "1ST" / "2ND" / "3RD" all line up and the
// name column starts at a single x — otherwise the bigger 1st-place
// label bleeds into the name column.
const ROW_NAME_FS = 9
const ROW_SCORE_FS = 10
const ROW_PAD_Y = 10
const DEFAULT_RANK_FS = 9
const FIRST_RANK_FS = 16
const RANK_WIDTH = 60

export default function LeaderboardRow({ entry }: LeaderboardRowProps) {
  // URL field hidden — unverified user-entered URLs are an injection /
  // phishing vector. Re-enable once URL verification is in place.
  const isFirst = entry.rank === 1
  const accent = rankAccentColor(entry.rank)
  const rankColor = accent ?? 'rgba(255,255,255,0.55)'
  const rankFs = isFirst ? FIRST_RANK_FS : DEFAULT_RANK_FS

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: `${ROW_PAD_Y}px 16px`,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        maxWidth: 500,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Rank */}
      <span
        style={{
          fontSize: rankFs,
          fontWeight: 700,
          width: RANK_WIDTH,
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
            fontSize: ROW_NAME_FS,
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
          fontSize: ROW_SCORE_FS,
          letterSpacing: 2,
          color: accent ?? '#FFFFFF',
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
