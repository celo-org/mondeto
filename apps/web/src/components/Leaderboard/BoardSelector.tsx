'use client'

export interface BoardOption {
  key: string
  label: string
}

interface BoardSelectorProps {
  options: BoardOption[]
  value: string
  onChange: (key: string) => void
}

const PIXEL_FONT = "'Press Start 2P', monospace"
const BRAND_LIME = '#A7FF05'

/**
 * Horizontal selector for which map's leaderboard to show — one chip per map.
 * Lets players view any map's board straight from /ranks instead of going back
 * to the map to switch first. Scrolls horizontally so it scales as more maps
 * ship. Only rendered when there's more than one board to choose between.
 */
export default function BoardSelector({ options, value, onChange }: BoardSelectorProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '10px 14px',
        background: 'var(--card-bg)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {options.map((o) => {
        const isActive = o.key === value
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
              flexShrink: 0,
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
