'use client'
import React, { useRef, useEffect } from 'react'
import { ZERO_ADDRESS } from '@/constants/map'
import { idToXY } from '@/lib/pixelMath'
import { isLand } from '@/lib/landMask'
import { useCurrentMapMeta } from '@/hooks/useCurrentMapMeta'
import type { PixelView } from '@/lib/mock'

const S = 4

interface OwnerMarkersProps {
  pixelData: PixelView[]
  userAddress?: string
  isDark?: boolean
}

export default function OwnerMarkers({ pixelData, userAddress, isDark = true }: OwnerMarkersProps) {
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

    // Collect own pixel positions once
    const ownedPixels: { x: number; y: number }[] = []
    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i, mask)) continue
      if (pixelData[i].owner === ZERO_ADDRESS) continue
      if (pixelData[i].owner.toLowerCase() === addr) {
        ownedPixels.push(idToXY(i, WIDTH))
      }
    }

    if (ownedPixels.length === 0) return

    const accentRGB = isDark ? [167, 255, 5] : [34, 34, 34]

    const animate = () => {
      ctx.clearRect(0, 0, WIDTH * S, HEIGHT * S)

      // Pulsing opacity: 0.4 → 1.0 over 2s sine
      const t = (Date.now() % 2000) / 2000
      const alpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2))

      const accent = `rgba(${accentRGB[0]},${accentRGB[1]},${accentRGB[2]},${alpha})`

      for (const { x, y } of ownedPixels) {
        const sx = x * S
        const sy = y * S

        // Border
        ctx.strokeStyle = accent
        ctx.lineWidth = 1
        ctx.strokeRect(sx + 0.5, sy + 0.5, S - 1, S - 1)

        // Center stud
        ctx.fillStyle = accent
        ctx.beginPath()
        ctx.arc(sx + S / 2, sy + S / 2, S * 0.22, 0, Math.PI * 2)
        ctx.fill()

        // Stud highlight
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.5})`
        ctx.beginPath()
        ctx.arc(sx + S / 2 - S * 0.05, sy + S / 2 - S * 0.05, S * 0.12, 0, Math.PI * 2)
        ctx.fill()
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
      width={WIDTH * S}
      height={HEIGHT * S}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: WIDTH,
        height: HEIGHT,
        pointerEvents: 'none',
      }}
    />
  )
}
