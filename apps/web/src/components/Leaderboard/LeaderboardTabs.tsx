'use client'

import type { LeaderboardScope, LeaderboardTab } from '@/hooks/useLeaderboard'
import { BOARD_LABELS } from '@/lib/maps/leaderboards'

interface LeaderboardTabsProps {
  activeTab: LeaderboardTab
  onTabChange: (tab: LeaderboardTab) => void
  scope?: LeaderboardScope
  /**
   * Replaces the CAMPAIGN description when the window has closed.
   *
   * The gap between "the window closed" and "the payout is pinned" is where
   * "but I was first" complaints come from: with only two states a player
   * reads a closed board as final while it can still move. Naming the closed
   * state explicitly is what makes the third one meaningful.
   */
  campaignNote?: string | null
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
    key: 'CAMPAIGN',
    label: BOARD_LABELS.CAMPAIGN,
    // The only place the mechanic is explained in-app. Net gain means a player
    // raided late in the window watches their number fall, which reads as a bug
    // unless something says otherwise — and this sentence is that something.
    description: 'Who grew the most during the campaign. Pixels you gained, minus pixels raided from you.',
    globalDescription: 'Who grew the most during the campaign. Pixels you gained, minus pixels raided from you.',
  },
]

export default function LeaderboardTabs({
  activeTab,
  onTabChange,
  scope = 'local',
  campaignNote,
}: LeaderboardTabsProps) {
  const active = tabConfig.find(t => t.key === activeTab)
  const activeDescription =
    activeTab === 'CAMPAIGN' && campaignNote
      ? campaignNote
      : active && (scope === 'global' ? active.globalDescription : active.description)

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
