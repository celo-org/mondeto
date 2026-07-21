'use client'

import React, { useEffect, useState } from 'react'
import IntroScreen from '@/components/Overlays/IntroScreen'

// /dev/intro-preview — replays the intro carousel without needing to clear
// sessionStorage. Mounts the real component so animation + interaction
// changes show up unchanged. The "REPLAY" button bumps a key to force a
// fresh mount after the user dismisses it.
export default function IntroPreviewPage() {
  const [key, setKey] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try { localStorage.removeItem('mondeto-intro-seen') } catch {}
    setMounted(true)
  }, [key])

  const replay = () => {
    try { localStorage.removeItem('mondeto-intro-seen') } catch {}
    setMounted(false)
    setKey((k) => k + 1)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          zIndex: 200,
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          onClick={replay}
          className="pixel-btn pixel-btn-filled font-display"
          style={{ fontSize: 10, padding: '8px 16px' }}
        >
          REPLAY
        </button>
      </div>

      {mounted && <IntroScreen key={key} />}
    </div>
  )
}
