'use client'
import React, { useEffect, useRef, useState } from 'react'
import { MAX_SELECT } from '@/constants/map'

interface PaintModeBannerProps {
  visible: boolean
  scale: number
  pixelCount: number
  limitBump?: number
}

export default function PaintModeBanner({
  visible,
  scale,
  pixelCount,
  limitBump = 0,
}: PaintModeBannerProps) {
  const isAtLimit = pixelCount >= MAX_SELECT
  const [shaking, setShaking] = useState(false)
  const [flash, setFlash] = useState(false)
  const [floats, setFloats] = useState<number[]>([])
  const prevBumpRef = useRef(limitBump)
  const prevCountRef = useRef(pixelCount)
  const floatIdRef = useRef(0)

  // Trigger shake each time limitBump increments
  useEffect(() => {
    if (limitBump > prevBumpRef.current) {
      setShaking(true)
      const t = setTimeout(() => setShaking(false), 300)
      prevBumpRef.current = limitBump
      return () => clearTimeout(t)
    }
    prevBumpRef.current = limitBump
  }, [limitBump])

  // Trigger +1 float and flash when count increases
  useEffect(() => {
    if (pixelCount > prevCountRef.current && pixelCount > 0) {
      // Flash the counter
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 200)

      // Spawn a floating +1
      const id = ++floatIdRef.current
      setFloats(prev => [...prev, id])
      const t2 = setTimeout(() => {
        setFloats(prev => prev.filter(f => f !== id))
      }, 600)

      prevCountRef.current = pixelCount
      return () => { clearTimeout(t); clearTimeout(t2) }
    }
    prevCountRef.current = pixelCount
  }, [pixelCount])

  if (!visible) return null

  return (
    <div
      style={{
        // Stacked directly under the HEATMAP / MY LAND lime band (which
        // occupies y=56..82 — TopBar 56px + toggle 26px). Banner height 30,
        // so it ends at y=112. Anything map-overlay-related (e.g. selection
        // pill) should clear y=112 if it shows simultaneously.
        position: 'absolute',
        top: 82,
        left: 0,
        right: 0,
        height: 30,
        background: 'var(--card-bg)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        zIndex: 15,
        opacity: visible ? 1 : 0,
        transition: 'opacity 150ms ease',
      }}
    >
      <span
        style={{
          fontSize: 8,
          fontFamily: "'Press Start 2P', monospace",
          color: 'var(--text)',
          letterSpacing: 1,
        }}
      >
        GAME ON — pick your next move
      </span>
      <span
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}
      >
        {/* Floating +1 animations */}
        {floats.map(id => (
          <span
            key={id}
            style={{
              position: 'absolute',
              right: 0,
              fontSize: 8,
              fontFamily: "'Press Start 2P', monospace",
              color: 'var(--text)',
              pointerEvents: 'none',
              animation: 'floatUp 0.6s ease-out forwards',
            }}
          >
            +1
          </span>
        ))}
        <span
          className={shaking ? 'animate-shake' : ''}
          style={{
            fontSize: 9,
            fontFamily: "'Press Start 2P', monospace",
            color: isAtLimit ? 'var(--error)' : 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transform: flash ? 'scale(1.3)' : 'scale(1)',
            transition: 'transform 0.15s ease-out',
          }}
        >
          {isAtLimit && (
            <span
              style={{
                fontSize: 7,
                fontWeight: 700,
                background: 'var(--error)',
                color: '#fff',
                padding: '1px 4px',
                borderRadius: 3,
                letterSpacing: 0.5,
              }}
            >
              MAX
            </span>
          )}
          {pixelCount} / {MAX_SELECT}
        </span>
      </span>
    </div>
  )
}
