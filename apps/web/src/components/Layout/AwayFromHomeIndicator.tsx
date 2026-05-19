'use client'

import React from 'react'
import { useMaps } from '@/hooks/useMaps'

/**
 * Small label that appears just under the TopBar when the user is browsing
 * a map other than their home map. Tapping `[ home ]` jumps back.
 *
 * Hidden whenever current === home, when the user isn't connected, or when
 * only one map is revealed (the launch single-map state).
 */
export default function AwayFromHomeIndicator() {
  const { revealedMaps, homeMapId, currentMapId, setCurrentMapId } = useMaps()

  if (revealedMaps.length <= 1) return null
  if (homeMapId === null) return null
  if (currentMapId === homeMapId) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        zIndex: 9,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '4px 10px',
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 6,
        letterSpacing: 1,
        color: 'var(--text-muted)',
        background: 'var(--card-bg)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span>YOU&apos;RE ON MAP {currentMapId}</span>
      <button
        type="button"
        onClick={() => setCurrentMapId(homeMapId)}
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 6,
          letterSpacing: 1,
          color: 'var(--text)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        [ HOME ]
      </button>
    </div>
  )
}
