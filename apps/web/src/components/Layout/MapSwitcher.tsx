'use client'

import React, { useMemo, useState } from 'react'
import { useMaps } from '@/hooks/useMaps'
import type { PixelView } from '@/lib/mock'
import { ZERO_ADDRESS } from '@/constants/map'
import { isLand } from '@/lib/landMask'
import type { MapId } from '@/lib/maps/types'

interface MapSwitcherProps {
  /**
   * Optional pixel data for the *current* map. We use it to compute a
   * fill-percent for the currently selected map; other maps show "?" until
   * Agent A wires per-map snapshots. Cheap inline calc — no fetching here.
   */
  currentMapPixels?: PixelView[]
}

/**
 * Top-bar map switcher.
 *
 * Renders a small "MAP N/M" pill in the TopBar. When only one map is
 * revealed, the component returns null so the launch single-map UI is
 * untouched. Tapping the pill opens a bottom sheet listing each revealed
 * map with id, fill percent (where known), and a home-map badge.
 */
export default function MapSwitcher({ currentMapPixels }: MapSwitcherProps) {
  const { revealedMaps, homeMapId, currentMapId, setCurrentMapId } = useMaps()
  const [open, setOpen] = useState(false)

  // Compute land-pixel claim percentage for the current map only. Cheap:
  // it iterates pixel data we already have in memory.
  const currentFillPct = useMemo(() => {
    if (!currentMapPixels || currentMapPixels.length === 0) return null
    let land = 0
    let claimed = 0
    for (let i = 0; i < currentMapPixels.length; i++) {
      if (!isLand(i)) continue
      land += 1
      if (currentMapPixels[i].owner && currentMapPixels[i].owner !== ZERO_ADDRESS) {
        claimed += 1
      }
    }
    if (land === 0) return null
    return Math.round((claimed / land) * 100)
  }, [currentMapPixels])

  // Hide entirely while the launch lineup is single-map. The TopBar then
  // looks identical to the original UI.
  if (revealedMaps.length <= 1) return null

  const currentIndex = revealedMaps.findIndex((m) => m.id === currentMapId)
  const displayIndex = currentIndex >= 0 ? currentIndex : 0

  const handlePick = (id: MapId) => {
    setCurrentMapId(id)
    setOpen(false)
  }

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
        MAP {displayIndex}/{revealedMaps.length - 1}
      </button>

      {open && (
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
              {revealedMaps.map((m, i) => {
                const isCurrent = m.id === currentMapId
                const isHome = m.id === homeMapId
                // Only the current map has a fill % at the moment. Per the
                // spec, other maps show "?" — DAU and fill-per-map will be
                // wired to the analytics events later. Computing it here
                // would mean fetching N getPixelBatch calls on render,
                // which is too expensive for a switcher sheet.
                const fillLabel = isCurrent && currentFillPct !== null ? `${currentFillPct}% claimed` : '?'
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
                        <span style={{ fontSize: 9, letterSpacing: 2 }}>MAP {m.id}</span>
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
                      <span style={{ fontSize: 7, letterSpacing: 1, opacity: 0.85 }}>{fillLabel}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                marginTop: 16,
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
      )}
    </>
  )
}
