'use client'
import React from 'react'
import { WIDTH, HEIGHT, TILE_GAP, TILE_RADIUS, ZERO_ADDRESS } from '@/constants/map'
import { idToXY } from '@/lib/pixelMath'
import { isLand } from '@/lib/landMask'
import type { PixelView } from '@/lib/mock'

export type MapView = 'normal' | 'heatmap' | 'myland'

// Heatmap ramp: dark amber → brand orange → white-hot. Mirrors the legend
// gradient and the 8 --heat-* tokens in globals.css.
function interpolateWarmGradient(ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio))
  const stops = [
    { p: 0.00, r: 0x3A, g: 0x1E, b: 0x0A },
    { p: 0.15, r: 0x6B, g: 0x2F, b: 0x0E },
    { p: 0.30, r: 0xA1, g: 0x43, b: 0x10 },
    { p: 0.45, r: 0xD8, g: 0x56, b: 0x14 },
    { p: 0.60, r: 0xFF, g: 0x4C, b: 0x00 },
    { p: 0.75, r: 0xFF, g: 0x8A, b: 0x4C },
    { p: 0.90, r: 0xFF, g: 0xC4, b: 0x99 },
    { p: 1.00, r: 0xFF, g: 0xFF, b: 0xFF },
  ]
  let lo = stops[0], hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].p && t <= stops[i + 1].p) { lo = stops[i]; hi = stops[i + 1]; break }
  }
  const f = hi.p === lo.p ? 0 : (t - lo.p) / (hi.p - lo.p)
  const r = Math.round(lo.r + (hi.r - lo.r) * f)
  const g = Math.round(lo.g + (hi.g - lo.g) * f)
  const b = Math.round(lo.b + (hi.b - lo.b) * f)
  return `rgb(${r},${g},${b})`
}

export function drawPixels(
  ctx: CanvasRenderingContext2D,
  pixelData: PixelView[],
  mapView: MapView,
  isDark: boolean,
  userAddress?: string,
) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT)

  const gap = TILE_GAP
  const rad = TILE_RADIUS
  const userAddr = userAddress?.toLowerCase()
  const unownedColor = isDark ? '#dddddd' : '#555555'
  const fadedColor = isDark ? 'rgba(221,221,221,0.25)' : 'rgba(85,85,85,0.25)'

  if (mapView === 'heatmap') {
    let maxSales = 0
    for (let i = 0; i < pixelData.length; i++) {
      if (pixelData[i].saleCount > maxSales) {
        maxSales = pixelData[i].saleCount
      }
    }

    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i)) continue
      const pixel = pixelData[i]
      const { x, y } = idToXY(i)

      if (pixel.saleCount === 0) {
        ctx.fillStyle = unownedColor
      } else {
        const ratio = maxSales > 0 ? pixel.saleCount / maxSales : 0
        ctx.fillStyle = interpolateWarmGradient(ratio)
      }

      ctx.beginPath()
      ctx.roundRect(x + gap / 2, y + gap / 2, 1 - gap, 1 - gap, rad)
      ctx.fill()
    }
  } else if (mapView === 'myland') {
    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i)) continue
      const pixel = pixelData[i]
      const { x, y } = idToXY(i)
      const isOwned = pixel.owner !== ZERO_ADDRESS
      const isMine = userAddr && isOwned && pixel.owner.toLowerCase() === userAddr

      if (isMine) {
        // My pixels: full color
        ctx.fillStyle = pixel.color || '#888888'
      } else {
        // Everything else: faded out
        ctx.fillStyle = fadedColor
      }

      ctx.beginPath()
      ctx.roundRect(x + gap / 2, y + gap / 2, 1 - gap, 1 - gap, rad)
      ctx.fill()
    }
  } else {
    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i)) continue
      const pixel = pixelData[i]
      const { x, y } = idToXY(i)
      const isOwned = pixel.owner !== ZERO_ADDRESS

      if (isOwned) {
        ctx.fillStyle = pixel.color || '#888888'
      } else {
        ctx.fillStyle = unownedColor
      }

      ctx.beginPath()
      ctx.roundRect(x + gap / 2, y + gap / 2, 1 - gap, 1 - gap, rad)
      ctx.fill()
    }
  }
}

interface PixelLayerProps {
  pixelData: PixelView[]
  mapView: MapView
  isDark: boolean
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>
}

export default function PixelLayer({ canvasRef }: PixelLayerProps) {
  return (
    <canvas
      ref={el => { canvasRef.current = el }}
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
