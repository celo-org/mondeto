'use client'
import React from 'react'
import { TILE_GAP, TILE_RADIUS, ZERO_ADDRESS } from '@/constants/map'
import { idToXY } from '@/lib/pixelMath'
import { isLand } from '@/lib/landMask'
import { ownerDefaultColor } from '@/lib/colorUtils'
import { dealDepth } from '@/lib/decay'
import { useCurrentMapMeta } from '@/hooks/useCurrentMapMeta'
import type { PixelView } from '@/lib/mock'

export type MapView = 'normal' | 'heatmap' | 'myland' | 'deals'

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

// Deals ramp: dark moss → brand lime (#A7FF05) → pale lime. Deeper discount
// under the entry price = brighter. Mirrors the DealsLegend gradient.
function interpolateLimeGradient(ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio))
  const stops = [
    { p: 0.00, r: 0x22, g: 0x33, b: 0x00 },
    { p: 0.35, r: 0x54, g: 0x80, b: 0x02 },
    { p: 0.70, r: 0xA7, g: 0xFF, b: 0x05 },
    { p: 1.00, r: 0xE0, g: 0xFF, b: 0x9E },
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
  width: number,
  height: number,
  mask: Uint8Array,
  userAddress?: string,
  /** The connected wallet's current (possibly unsaved) profile color, used
   *  for their own pixels so the map matches what they see on the profile
   *  screen even before they save it on-chain. */
  userColor?: string,
  /** The map's on-chain entry price (config().initialPrice, micro-USDT).
   *  Required by the 'deals' view to spot pixels priced under entry;
   *  until it loads, the deals view shows everything dimmed. */
  initialPrice?: bigint,
) {
  ctx.clearRect(0, 0, width, height)

  const gap = TILE_GAP
  const rad = TILE_RADIUS
  const userAddr = userAddress?.toLowerCase()
  const unownedColor = '#dddddd'
  const fadedColor = 'rgba(221,221,221,0.25)'
  // Deals view: sold land that isn't a deal right now. Solid grey so it reads as
  // "taken", not as ocean — a translucent fade blends into the blue water below.
  const soldColor = '#5b5b5b'

  // Resolve an owned pixel's fill:
  //   1. on-chain per-owner color (what everyone agrees on) wins;
  //   2. else, for the connected user's OWN pixels, their live profile color
  //      so their view matches the profile screen even before they save;
  //   3. else, a deterministic per-address color (so unclaimed-looking grey
  //      never shows and every viewer computes the same hue).
  // Cached per owner so the hash isn't recomputed for every pixel.
  const ownerColorCache = new Map<string, string>()
  const ownedFill = (pixel: PixelView): string => {
    if (pixel.color) return pixel.color
    const owner = pixel.owner
    if (userColor && userAddr && owner.toLowerCase() === userAddr) {
      return userColor
    }
    let c = ownerColorCache.get(owner)
    if (!c) {
      c = ownerDefaultColor(owner)
      ownerColorCache.set(owner, c)
    }
    return c
  }

  if (mapView === 'heatmap') {
    let maxSales = 0
    for (let i = 0; i < pixelData.length; i++) {
      if (pixelData[i].saleCount > maxSales) {
        maxSales = pixelData[i].saleCount
      }
    }

    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i, mask)) continue
      const pixel = pixelData[i]
      const { x, y } = idToXY(i, width)

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
  } else if (mapView === 'deals') {
    // A deal = current price below the map's entry price (long-unsold land
    // decaying under initialPrice). Normalize the ramp by the deepest
    // discount on the map — same trick as the heatmap's maxSales — so the
    // brightest lime always marks the best deal available right now.
    const entry = initialPrice ?? 0n
    const depths = new Float64Array(pixelData.length)
    let maxDepth = 0
    if (entry > 0n) {
      for (let i = 0; i < pixelData.length; i++) {
        if (!isLand(i, mask)) continue
        const d = dealDepth(pixelData[i].currentPrice, entry)
        depths[i] = d
        if (d > maxDepth) maxDepth = d
      }
    }

    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i, mask)) continue
      const { x, y } = idToXY(i, width)
      const depth = depths[i]

      if (depth > 0 && maxDepth > 0) {
        ctx.fillStyle = interpolateLimeGradient(depth / maxDepth)
      } else if (pixelData[i].owner !== ZERO_ADDRESS) {
        // Sold, and not a deal right now — solid grey (see soldColor) so it
        // reads as "taken" instead of blending into the ocean.
        ctx.fillStyle = soldColor
      } else {
        // Unsold and at/above entry price — dim it, like myland dims others'.
        ctx.fillStyle = fadedColor
      }

      ctx.beginPath()
      ctx.roundRect(x + gap / 2, y + gap / 2, 1 - gap, 1 - gap, rad)
      ctx.fill()
    }
  } else if (mapView === 'myland') {
    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i, mask)) continue
      const pixel = pixelData[i]
      const { x, y } = idToXY(i, width)
      const isOwned = pixel.owner !== ZERO_ADDRESS
      const isMine = userAddr && isOwned && pixel.owner.toLowerCase() === userAddr

      if (isMine) {
        ctx.fillStyle = ownedFill(pixel)
      } else {
        ctx.fillStyle = fadedColor
      }

      ctx.beginPath()
      ctx.roundRect(x + gap / 2, y + gap / 2, 1 - gap, 1 - gap, rad)
      ctx.fill()
    }
  } else {
    for (let i = 0; i < pixelData.length; i++) {
      if (!isLand(i, mask)) continue
      const pixel = pixelData[i]
      const { x, y } = idToXY(i, width)
      const isOwned = pixel.owner !== ZERO_ADDRESS

      if (isOwned) {
        ctx.fillStyle = ownedFill(pixel)
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
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>
}

export default function PixelLayer({ canvasRef }: PixelLayerProps) {
  const { width, height } = useCurrentMapMeta()
  return (
    <canvas
      ref={el => { canvasRef.current = el }}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: 'none',
        imageRendering: 'pixelated',
      }}
    />
  )
}
