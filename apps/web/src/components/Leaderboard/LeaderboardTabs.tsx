'use client'

import type { LeaderboardTab } from '@/hooks/useLeaderboard'

interface LeaderboardTabsProps {
  activeTab: LeaderboardTab
  onTabChange: (tab: LeaderboardTab) => void
}

const PIXEL_FONT = "'Press Start 2P', monospace"
const BRAND_LIME = '#A7FF05'

const tabConfig: { key: LeaderboardTab; label: string; description: string }[] = [
  {
    key: 'AREA',
    label: 'LAND',
    description: 'Who owns the most pixels on the map.',
  },
  {
    key: 'EMPIRE',
    label: 'EMPIRE',
    description: 'Biggest connected empire.',
  },
  {
    key: 'TYCOONS',
    label: 'TYCOONS',
    description: 'Who holds the single most valuable pixel.',
  },
]

export default function LeaderboardTabs({ activeTab, onTabChange }: LeaderboardTabsProps) {
  const active = tabConfig.find(t => t.key === activeTab)

  return (
    <div>
      <div
        style={{
          height: 38,
          background: 'var(--card-bg)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
        }}
      >
        {tabConfig.map((tab) => {
          const isActive = tab.key === activeTab
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 9,
                fontFamily: PIXEL_FONT,
                letterSpacing: 2,
                lineHeight: '38px',
                cursor: 'pointer',
                color: isActive ? BRAND_LIME : 'rgba(255,255,255,0.55)',
                background: 'none',
                border: 'none',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: isActive ? BRAND_LIME : 'transparent',
                padding: 0,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      {active && (
        <div
          style={{
            padding: '12px 14px',
            fontSize: 9,
            color: 'var(--brand-orange)',
            fontFamily: PIXEL_FONT,
            letterSpacing: 1.5,
            lineHeight: 1.5,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'var(--card-bg)',
          }}
        >
          {active.description}
        </div>
      )}
    </div>
  )
}
