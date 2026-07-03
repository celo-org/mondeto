'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useMaps } from '@/hooks/useMaps'
import { useShouldOpenNextMap } from '@/hooks/useShouldOpenNextMap'
import type { MapId } from '@/lib/maps/types'

/**
 * Top-bar map switcher.
 *
 * Renders a small "MAP N/M" pill in the TopBar. When only one map is
 * revealed, the component returns null so the launch single-map UI is
 * untouched. Tapping the pill opens a bottom sheet listing each revealed
 * map with display name, fill percent, and a home-map badge.
 *
 * Fill % per map is pulled from `useShouldOpenNextMap().perMap`, which
 * already fetches and caches per-map pixel snapshots; no extra reads here.
 *
 * The bottom sheet is portalled to <body> so its `position: fixed`
 * anchors to the viewport rather than to the TopBar's absolute container.
 */
export default function MapSwitcher() {
  const { revealedMaps, homeMapId, currentMapId, setCurrentMapId } = useMaps()
  const { perMap } = useShouldOpenNextMap()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (revealedMaps.length <= 1) return null

  const currentIndex = revealedMaps.findIndex((m) => m.id === currentMapId)
  const displayIndex = currentIndex >= 0 ? currentIndex : 0

  const fillFor = (id: MapId): string => {
    const summary = perMap.find((p) => p.mapId === id)
    if (!summary) return '?'
    return `${Math.round(summary.fillPct)}% claimed`
  }

  const handlePick = (id: MapId) => {
    setCurrentMapId(id)
    setOpen(false)
  }

  const sheet = (
    <div
      role="dialog"
      aria-label="Map switcher"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--card-bg)',
          borderTop: '1px solid var(--border)',
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
          padding: '16px 14px 24px',
          maxHeight: '70vh',
          overflowY: 'auto',
          color: 'var(--text)',
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontFamily: "'Press Start 2P', monospace",
            letterSpacing: 2,
            marginBottom: 14,
            textAlign: 'center',
            color: 'var(--text)',
          }}
        >
          PICK A MAP
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {revealedMaps.map((m) => {
            const isCurrent = m.id === currentMapId
            const isHome = m.id === homeMapId
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => handlePick(m.id)}
                  aria-current={isCurrent ? 'true' : undefined}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '12px 12px',
                    background: isCurrent ? 'var(--button-bg)' : 'transparent',
                    color: isCurrent ? 'var(--button-text)' : 'var(--text)',
                    border: '1px solid var(--text-muted)',
                    borderRadius: 'var(--radius-md)',
                    fontFamily: "'Press Start 2P', monospace",
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 9, letterSpacing: 2 }}>{m.displayName}</span>
                    {isHome && (
                      <span
                        style={{
                          fontSize: 6,
                          letterSpacing: 1,
                          padding: '2px 5px',
                          borderRadius: 4,
                          border: '1px solid currentColor',
                        }}
                      >
                        HOME
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 7, letterSpacing: 1, opacity: 0.85 }}>{fillFor(m.id)}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <Link
          href="/atlas"
          onClick={() => setOpen(false)}
          style={{
            display: 'block',
            marginTop: 14,
            width: '100%',
            padding: '10px',
            background: 'transparent',
            color: 'var(--text)',
            border: '1px solid var(--text)',
            borderRadius: 'var(--radius-md)',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 7,
            letterSpacing: 2,
            textAlign: 'center',
            textDecoration: 'none',
          }}
        >
          SEE ATLAS →
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            marginTop: 8,
            width: '100%',
            padding: '10px',
            background: 'transparent',
            color: 'var(--text-muted)',
            border: '1px dashed var(--text-muted)',
            borderRadius: 'var(--radius-md)',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 7,
            letterSpacing: 2,
            cursor: 'pointer',
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Switch map"
        style={{
          fontSize: 7,
          fontFamily: "'Press Start 2P', monospace",
          letterSpacing: 1,
          borderRadius: 999,
          padding: '4px 9px',
          background: 'transparent',
          color: 'var(--text)',
          border: '1px solid var(--text-muted)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        MAP {displayIndex + 1}/{revealedMaps.length}
      </button>

      {open && mounted ? createPortal(sheet, document.body) : null}
    </>
  )
}
