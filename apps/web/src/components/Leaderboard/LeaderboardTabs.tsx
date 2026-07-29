'use client'

import type { LeaderboardScope, LeaderboardTab } from '@/hooks/useLeaderboard'
import { BOARD_LABELS } from '@/lib/maps/leaderboards'

interface LeaderboardTabsProps {
  activeTab: LeaderboardTab
  onTabChange: (tab: LeaderboardTab) => void
  scope?: LeaderboardScope
}

const PIXEL_FONT = "'Press Start 2P', monospace"
const BRAND_LIME = '#A7FF05'

// Labels come from BOARD_LABELS so the tabs, the FAQ and the drift test can
// never disagree on what a board is called.
const tabConfig: {
  key: LeaderboardTab
  label: string
  description: string
  globalDescription: string
}[] = [
  {
    key: 'AREA',
    label: BOARD_LABELS.AREA,
    description: 'Who owns the most pixels on the map.',
    globalDescription: 'Most land owned across all maps (share of each board).',
  },
  {
    key: 'EMPIRE',
    label: BOARD_LABELS.EMPIRE,
    description: 'Biggest connected empire.',
    globalDescription: 'Biggest connected empire on any single map.',
  },
  {
    key: 'TYCOONS',
    label: BOARD_LABELS.TYCOONS,
    description: 'Who holds the single most valuable pixel.',
    globalDescription: 'Single most valuable pixel held anywhere.',
  },
]

export default function LeaderboardTabs({ activeTab, onTabChange, scope = 'local' }: LeaderboardTabsProps) {
  const active = tabConfig.find(t => t.key === activeTab)
  const activeDescription =
    active && (scope === 'global' ? active.globalDescription : active.description)

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
      {activeDescription && (
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
          {activeDescription}
        </div>
      )}
    </div>
  )
}
