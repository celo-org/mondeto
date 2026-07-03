'use client'

import type { LeaderboardEntry } from '@/hooks/useLeaderboard'
import { generateUsername } from '@/lib/username'

interface LeaderboardRowProps {
  entry: LeaderboardEntry
  /** Render a RULER badge on this row — the parent sets it for the rank-1
   *  holder of a map's LAND board (the reigning "Ruler of <map>"). */
  isRuler?: boolean
  /** Optional per-map breakdown chip (global board), e.g. "W·AF·EU". */
  breakdown?: string
  /** This row is the connected player — lime frame + YOU tag. */
  isYou?: boolean
  /** Rank-proximity nudge under the name, e.g. "12 PX FROM #3". */
  gapText?: string
}

const PIXEL_FONT = "'Press Start 2P', monospace"
const BRAND_ORANGE = '#FF4C00'
const BRAND_PURPLE = '#B430FF'
const BRAND_LIME = '#A7FF05'

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

export default function LeaderboardRow({ entry, isRuler, breakdown, isYou, gapText }: LeaderboardRowProps) {
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
        // The player's own row gets a full lime frame; everyone else keeps
        // the plain divider.
        border: isYou ? `1px solid ${BRAND_LIME}` : undefined,
        borderBottom: isYou ? `1px solid ${BRAND_LIME}` : '1px solid rgba(255,255,255,0.08)',
        background: isYou ? 'rgba(167,255,5,0.08)' : undefined,
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
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: ROW_NAME_FS,
            fontFamily: PIXEL_FONT,
            letterSpacing: 2,
            color: '#FFFFFF',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {entry.label || generateUsername(entry.owner)}
          </span>
          {isRuler && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 6,
                letterSpacing: 1,
                padding: '2px 5px',
                borderRadius: 4,
                color: BRAND_LIME,
                border: `1px solid ${BRAND_LIME}`,
              }}
            >
              RULER
            </span>
          )}
          {isYou && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 6,
                letterSpacing: 1,
                padding: '2px 5px',
                borderRadius: 4,
                color: '#0A0A0A',
                background: BRAND_LIME,
                fontWeight: 700,
              }}
            >
              YOU
            </span>
          )}
        </div>
        {gapText && (
          <div
            style={{
              marginTop: 3,
              fontSize: 6,
              letterSpacing: 1,
              color: BRAND_LIME,
              fontFamily: PIXEL_FONT,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {gapText}
          </div>
        )}
        {breakdown && (
          <div
            style={{
              marginTop: 3,
              fontSize: 6,
              letterSpacing: 1,
              color: 'rgba(255,255,255,0.4)',
              fontFamily: PIXEL_FONT,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {breakdown}
          </div>
        )}
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
