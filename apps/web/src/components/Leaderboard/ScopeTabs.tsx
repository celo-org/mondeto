'use client'

import type { LeaderboardScope } from '@/hooks/useLeaderboard'

interface ScopeTabsProps {
  activeScope: LeaderboardScope
  onScopeChange: (scope: LeaderboardScope) => void
}

const scopeConfig: { key: LeaderboardScope; label: string }[] = [
  { key: 'LOCAL', label: 'LOCAL' },
  { key: 'GLOBAL', label: 'GLOBAL' },
]

export default function ScopeTabs({ activeScope, onScopeChange }: ScopeTabsProps) {
  return (
    <div
      style={{
        height: 30,
        background: 'var(--card-bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
      }}
    >
      {scopeConfig.map((scope) => {
        const isActive = scope.key === activeScope
        return (
          <button
            key={scope.key}
            onClick={() => onScopeChange(scope.key)}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 8,
              fontFamily: "'Press Start 2P', monospace",
              letterSpacing: 2,
              lineHeight: '30px',
              cursor: 'pointer',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              background: 'none',
              border: 'none',
              borderBottomWidth: 2,
              borderBottomStyle: 'solid',
              borderBottomColor: isActive ? 'var(--text)' : 'transparent',
              padding: 0,
            }}
          >
            {scope.label}
          </button>
        )
      })}
    </div>
  )
}
