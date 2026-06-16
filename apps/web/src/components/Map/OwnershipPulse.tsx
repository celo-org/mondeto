'use client'
import React, { useRef, useEffect } from 'react'
import { idToXY } from '@/lib/pixelMath'
import { isLand } from '@/lib/landMask'
import { useCurrentMapMeta } from '@/hooks/useCurrentMapMeta'
import type { PixelView } from '@/lib/mock'

interface OwnershipPulseProps {
  pixelData: PixelView[]
  userAddress?: string
  isDark?: boolean
}

export default function OwnershipPulse({ pixelData, userAddress, isDark = true }: OwnershipPulseProps) {
  const { width: WIDTH, height: HEIGHT, mask } = useCurrentMapMeta()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!userAddress) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const addr = userAddress.toLowerCase()
    const accent = isDark ? [167, 255, 5] : [26, 26, 26] // brand lime #A7FF05

    // Collect owned pixel positions
    const ownedPixels: { x: number; y: number }[] = []
    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i, mask)) continue
      if (pixelData[i].owner.toLowerCase() === addr) {
        ownedPixels.push(idToXY(i, WIDTH))
      }
    }

    if (ownedPixels.length === 0) return

    const animate = () => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT)
      // Pulsing outer glow: expands and fades over 2s cycle
      const t = (Date.now() % 2000) / 2000
      const phase = Math.sin(t * Math.PI * 2)

      // Glow ring: varies size and opacity
      const spread = 0.08 + 0.06 * phase
      const alpha = 0.3 + 0.25 * phase

      ctx.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${alpha})`
      ctx.lineWidth = 0.12 + 0.06 * phase

      for (const { x, y } of ownedPixels) {
        ctx.beginPath()
        ctx.rect(x - spread, y - spread, 1 + spread * 2, 1 + spread * 2)
        ctx.stroke()
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [pixelData, userAddress, isDark])

  if (!userAddress) return null

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
