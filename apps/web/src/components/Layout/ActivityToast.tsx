'use client'

import React, { useEffect } from 'react'
import { useActivityFeed } from '@/hooks/useActivityFeed'
import { track } from '@/lib/analytics'
import type { MapId } from '@/lib/maps/types'

interface ActivityToastProps {
  mapId: MapId
}

/**
 * Live purchase feed — a single toast that slides into the bottom-left corner
 * whenever someone buys pixels on the current map, then auto-dismisses.
 *
 * Self-contained: it owns its data via `useActivityFeed`, so the page just
 * mounts `<ActivityToast mapId={currentMapId} />`. Placed bottom-left at
 * z-index 13 so it never covers the map, top bar, zoom buttons (right side),
 * or the buy CTA. Hover pauses; tap dismisses.
 */
export default function ActivityToast({ mapId }: ActivityToastProps) {
  const { current, pause, resume, dismiss } = useActivityFeed(mapId)

  useEffect(() => {
    if (current) track('activity_feed_shown', { mapId, batchId: current.id })
  }, [current, mapId])

  if (!current) return null

  return (
    <div
      // Re-key on id so the entrance animation replays for each new toast.
      key={current.id}
      onClick={dismiss}
      onMouseEnter={pause}
      onMouseLeave={resume}
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        bottom: 64,
        left: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: 220,
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: 'var(--text)',
        fontSize: 9,
        letterSpacing: 0.5,
        borderRadius: 10,
        padding: '7px 10px',
        zIndex: 13,
        cursor: 'pointer',
        animation: 'activityIn 250ms ease',
      }}
    >
      <span
        aria-hidden
        style={{
          flex: '0 0 auto',
          width: 8,
          height: 8,
          borderRadius: 2,
          background: current.color,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
        }}
      />
      <span
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span style={{ fontWeight: 500 }}>{current.name}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {'  +'}
          {current.pixelCount} px · ${current.amount}
        </span>
      </span>
    </div>
  )
}
