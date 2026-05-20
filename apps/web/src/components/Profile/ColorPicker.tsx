'use client'

import { useCallback } from 'react'

interface ColorPickerProps {
  color: string
  onChange: (color: string) => void
}

export default function ColorPicker({ color, onChange }: ColorPickerProps) {
  const handleNative = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    [onChange],
  )
  const handleHexInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    [onChange],
  )

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.15)',
        padding: '14px 16px',
        marginBottom: 8,
      }}
    >
      <div
        className="font-display"
        style={{
          fontSize: 11,
          color: 'var(--text)',
          letterSpacing: 3,
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        COLOR
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', width: 36, height: 36 }}>
          <input
            type="color"
            value={color}
            onChange={handleNative}
            aria-label="Pick color"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.2)',
              appearance: 'none',
              WebkitAppearance: 'none',
              cursor: 'pointer',
              padding: 0,
              background: color,
            }}
          />
          <style>{`
            input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
            input[type=color]::-webkit-color-swatch { border: none; border-radius: 50%; }
          `}</style>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              width: '100%',
              height: 18,
              background: color,
            }}
          />
          <input
            type="text"
            value={color}
            onChange={handleHexInput}
            spellCheck={false}
            style={{
              fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace",
              background: 'var(--bg)',
              border: '1px solid rgba(255,255,255,0.15)',
              padding: '4px 8px',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
        </div>
      </div>
    </div>
  )
}
