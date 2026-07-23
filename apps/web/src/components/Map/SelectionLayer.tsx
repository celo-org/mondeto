'use client'
import React, { useRef, useEffect, useCallback } from 'react'
import { idToXY, pixelId, screenToPixel } from '@/lib/pixelMath'
import { isLandXY } from '@/lib/landMask'
import { useCurrentMapMeta } from '@/hooks/useCurrentMapMeta'

interface SelectionLayerProps {
  selectedIds: Set<number>
  isPaintMode: boolean
  scale: number
  onTogglePixel: (id: number) => void
  onAddPixel: (id: number) => void
  onInspectPixel?: (id: number) => void
  onTapWhileZoomedOut?: (id: number) => void
}

const S = 4 // render scale for high-res overlay

export default function SelectionLayer({
  selectedIds,
  isPaintMode,
  scale,
  onTogglePixel,
  onAddPixel,
  onInspectPixel,
  onTapWhileZoomedOut,
}: SelectionLayerProps) {
  const { width: WIDTH, height: HEIGHT, mask } = useCurrentMapMeta()
  const interactionRef = useRef<HTMLCanvasElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const isPaintingRef = useRef(false)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)
  const movedRef = useRef(false)

  // Animate selection overlay: pulsing green border + stud
  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (selectedIds.size === 0) {
      ctx.clearRect(0, 0, WIDTH * S, HEIGHT * S)
      cancelAnimationFrame(rafRef.current)
      return
    }

    // Pre-compute positions
    const positions = Array.from(selectedIds).map(id => idToXY(id, WIDTH))

    const animate = () => {
      ctx.clearRect(0, 0, WIDTH * S, HEIGHT * S)

      const t = (Date.now() % 2000) / 2000
      const alpha = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2))
      const accent = `rgba(0,255,65,${alpha})`
      const highlight = `rgba(255,255,255,${alpha * 0.5})`

      for (const { x, y } of positions) {
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
        ctx.fillStyle = highlight
        ctx.beginPath()
        ctx.arc(sx + S / 2 - S * 0.05, sy + S / 2 - S * 0.05, S * 0.12, 0, Math.PI * 2)
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [selectedIds])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = interactionRef.current
      if (!canvas) return

      isPaintingRef.current = true
      movedRef.current = false
      longPressFiredRef.current = false
      startPosRef.current = { x: e.clientX, y: e.clientY }

      // Long-press to inspect only applies once zoomed in (paint mode).
      if (!isPaintMode) return
      const pixel = screenToPixel(e.clientX, e.clientY, canvas, scale, WIDTH, HEIGHT)
      if (!pixel) return

      longPressTimerRef.current = setTimeout(() => {
        // Only land is inspectable/buyable. Ocean has no on-chain record and
        // buying it reverts NotLand, so a long-press on water is a no-op —
        // same as a tap on water (see handlePointerUp's isLandXY gate).
        if (!movedRef.current && onInspectPixel && isLandXY(pixel.x, pixel.y, WIDTH, mask)) {
          longPressFiredRef.current = true
          const pid = pixelId(pixel.x, pixel.y, WIDTH)
          onInspectPixel(pid)
        }
      }, 500)
    },
    [isPaintMode, scale, onInspectPixel, mask, WIDTH],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isPaintingRef.current) return

      const start = startPosRef.current
      if (start) {
        const dx = e.clientX - start.x
        const dy = e.clientY - start.y
        if (Math.sqrt(dx * dx + dy * dy) > 3) {
          movedRef.current = true
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
          }
        }
      }

      // Dragging only marks movement — pan is handled by the zoom wrapper.
    },
    [],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }

      const cleanTap = !longPressFiredRef.current && !movedRef.current
      const canvas = interactionRef.current

      if (cleanTap && canvas) {
        const pixel = screenToPixel(e.clientX, e.clientY, canvas, scale, WIDTH, HEIGHT)
        if (pixel) {
          if (isPaintMode) {
            // Zoomed in: a tap selects the land pixel.
            if (isLandXY(pixel.x, pixel.y, WIDTH, mask)) {
              onTogglePixel(pixelId(pixel.x, pixel.y, WIDTH))
            }
          } else {
            // Zoomed out: pixels are too small to target, so a tap zooms in
            // toward that point (one tap instead of double-click) and the
            // page surfaces a "zoom in to select" hint.
            onTapWhileZoomedOut?.(pixelId(pixel.x, pixel.y, WIDTH))
          }
        }
      }

      isPaintingRef.current = false
      startPosRef.current = null
    },
    [isPaintMode, scale, onTogglePixel, onTapWhileZoomedOut, mask, WIDTH, HEIGHT],
  )

  return (
    <>
      {/* High-res visual overlay (no pixelated, smooth rendering) */}
      <canvas
        ref={overlayRef}
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
      {/* Interaction canvas (handles pointer events). Always captures so a
          tap while zoomed out can trigger the zoom-in hint; clean taps vs
          pans are distinguished by movement, and pan/pinch still reach the
          zoom wrapper (we never stopPropagation). */}
      <canvas
        ref={interactionRef}
        width={WIDTH}
        height={HEIGHT}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: WIDTH,
          height: HEIGHT,
          pointerEvents: 'auto',
          opacity: 0,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </>
  )
}
