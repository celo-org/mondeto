'use client'

import React, { useState, useEffect } from 'react'

const BULLETS = [
  { h: 'CLAIM LAND',       p: 'Buy pixels and paint the map your color' },
  { h: 'HOLD YOUR GROUND', p: 'Someone wants your land? They pay you double' },
  { h: 'HUNT FOR DEALS',   p: 'Land without buyers gets cheaper over time' },
  { h: 'OUTRANK OTHERS',   p: 'Climb the leaderboard and win prizes' },
]

export default function IntroScreen() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const seen = sessionStorage.getItem('mondeto-intro-seen')
    if (!seen) setVisible(true)
  }, [])

  if (!visible) return null

  const dismiss = () => {
    sessionStorage.setItem('mondeto-intro-seen', '1')
    setVisible(false)
  }

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        cursor: 'pointer',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 360, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <img
          src="/brand/logo/logo.svg"
          alt=""
          width={56}
          height={56}
          style={{ imageRendering: 'pixelated' as const }}
        />
        <img
          src="/brand/wordmark/wordmark-white.svg"
          alt="MONDETO"
          style={{ height: 28, marginTop: 16 }}
        />
        <div
          className="font-mono"
          style={{
            fontSize: 11,
            letterSpacing: 2,
            color: 'rgba(255,255,255,0.8)',
            marginTop: 8,
            textTransform: 'uppercase',
          }}
        >
          Own the world, one pixel at a time
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20, marginTop: 40 }}>
          {BULLETS.map((b) => (
            <div key={b.h}>
              <div
                className="font-display"
                style={{ fontSize: 12, letterSpacing: 3, color: 'var(--brand-lime)' }}
              >
                &gt; {b.h}
              </div>
              <div
                className="font-mono"
                style={{ fontSize: 12, color: '#FFFFFF', marginTop: 4, lineHeight: 1.4 }}
              >
                {b.p}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); dismiss() }}
          className="pixel-btn font-display"
          style={{ marginTop: 40, fontSize: 12, padding: '12px 32px' }}
        >
          START
        </button>
      </div>
    </div>
  )
}
