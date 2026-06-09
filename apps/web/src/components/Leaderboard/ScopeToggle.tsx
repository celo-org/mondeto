'use client'

import type { LeaderboardScope } from '@/hooks/useLeaderboard'

interface ScopeToggleProps {
  scope: LeaderboardScope
  onChange: (scope: LeaderboardScope) => void
  /** Label for the local scope, e.g. the current map's display name. */
  localLabel: string
}

const PIXEL_FONT = "'Press Start 2P', monospace"
const BRAND_LIME = '#A7FF05'

/**
 * LOCAL | GLOBAL switch for the leaderboard. LOCAL ranks the current map;
 * GLOBAL ranks the normalized cross-map board. Hide this when only one map
 * is revealed (there's no cross-map distinction to make).
 */
export default function ScopeToggle({ scope, onChange, localLabel }: ScopeToggleProps) {
  const options: { key: LeaderboardScope; label: string }[] = [
    { key: 'local', label: localLabel },
    { key: 'global', label: 'GLOBAL' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 6,
        padding: '10px 14px',
        background: 'var(--card-bg)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {options.map((o) => {
        const isActive = o.key === scope
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-current={isActive ? 'true' : undefined}
            style={{
              fontFamily: PIXEL_FONT,
              fontSize: 8,
              letterSpacing: 2,
              padding: '7px 14px',
              borderRadius: 999,
              cursor: 'pointer',
              background: isActive ? BRAND_LIME : 'transparent',
              color: isActive ? '#0a0a0a' : 'rgba(255,255,255,0.6)',
              border: `1px solid ${isActive ? BRAND_LIME : 'rgba(255,255,255,0.25)'}`,
              whiteSpace: 'nowrap',
              maxWidth: 160,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
