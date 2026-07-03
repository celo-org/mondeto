'use client'
import React, { useRef, useEffect } from 'react'
import { TILE_GAP, TILE_RADIUS } from '@/constants/map'
import { idToXY } from '@/lib/pixelMath'
import { ownerDefaultColor } from '@/lib/colorUtils'
import { useCurrentMapMeta } from '@/hooks/useCurrentMapMeta'
import type { PixelView } from '@/lib/mock'

interface FlashLayerProps {
  changedIds: number[]
  pixelData: PixelView[]
}

const FLASH_DURATION = 1200

export default function FlashLayer({ changedIds, pixelData }: FlashLayerProps) {
  const { width: WIDTH, height: HEIGHT } = useCurrentMapMeta()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (changedIds.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const gap = TILE_GAP
    const rad = TILE_RADIUS
    const startTime = Date.now()

    // Collect pixel positions and target colors
    const targets = changedIds.map(id => {
      const { x, y } = idToXY(id, WIDTH)
      const px = pixelData[id]
      const color = px?.color || ownerDefaultColor(px?.owner)
      // Parse target color to RGB
      const m = color.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
      const tr = m ? parseInt(m[1], 16) : 136
      const tg = m ? parseInt(m[2], 16) : 136
      const tb = m ? parseInt(m[3], 16) : 136
      return { x, y, tr, tg, tb }
    })

    const animate = () => {
      const elapsed = Date.now() - startTime
      const t = Math.min(1, elapsed / FLASH_DURATION)

      ctx.clearRect(0, 0, WIDTH, HEIGHT)

      for (const { x, y, tr, tg, tb } of targets) {
        // Interpolate from white to target color
        const r = Math.round(255 + (tr - 255) * t)
        const g = Math.round(255 + (tg - 255) * t)
        const b = Math.round(255 + (tb - 255) * t)
        // Fade out opacity in the second half
        const alpha = t < 0.5 ? 0.8 : 0.8 * (1 - (t - 0.5) / 0.5)

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.beginPath()
        ctx.roundRect(x + gap / 2, y + gap / 2, 1 - gap, 1 - gap, rad)
        ctx.fill()
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [changedIds, pixelData])

  if (changedIds.length === 0) return null

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: WIDTH,
        height: HEIGHT,
        pointerEvents: 'none',
        imageRendering: 'pixelated',
      }}
    />
  )
}
