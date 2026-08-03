'use client'
import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from 'react'
import {
  TransformWrapper,
  TransformComponent,
  useTransformContext,
  useControls,
} from 'react-zoom-pan-pinch'
import { PAINT_SCALE } from '@/constants/map'
import { idToXY } from '@/lib/pixelMath'
import { useCurrentMapMeta } from '@/hooks/useCurrentMapMeta'
import type { PixelView } from '@/lib/mock'
import type { LoadState } from '@/hooks/usePixelMap'
import PixelLayer, { drawPixels, type MapView } from './PixelLayer'
import FlashLayer from './FlashLayer'
import TerritoryLabels from './TerritoryLabels'
import SelectionLayer from './SelectionLayer'

export interface WorldCanvasRef {
  drawInspectRing: (pixelId: number) => void
  clearInspectRing: () => void
  zoomIn: () => void
  zoomOut: () => void
  zoomToPixel: (pixelId: number, scale?: number) => void
  recenter: () => void
}

interface WorldCanvasProps {
  pixelData: PixelView[]
  mapView: MapView
  selectedIds: Set<number>
  onTogglePixel: (id: number) => void
  onAddPixel: (id: number) => void
  onInspectPixel?: (id: number) => void
  onScaleChange?: (scale: number) => void
  onTapWhileZoomedOut?: (id: number) => void
  loadState: LoadState
  version?: number
  userAddress?: string
  /** Connected wallet's current profile color, for their own pixels. */
  userColor?: string
  changedIds?: number[]
  profilesMap?: Map<string, { label: string; url?: string; color?: string }>
}

interface InnerCanvasProps extends WorldCanvasProps {
  pixelCanvasRef: React.RefObject<HTMLCanvasElement | null>
  selectionCanvasRef: React.RefObject<HTMLCanvasElement | null>
}

function InnerCanvas({
  pixelData,
  mapView,
  selectedIds,
  onTogglePixel,
  onAddPixel,
  onInspectPixel,
  onScaleChange,
  pixelCanvasRef,
  version,
  userAddress,
  userColor,
  changedIds,
  profilesMap,
  onTapWhileZoomedOut,
}: InnerCanvasProps) {
  const { width, height, mask } = useCurrentMapMeta()
  const context = useTransformContext()
  const prevScaleRef = useRef(1)

  useEffect(() => {
    const checkScale = () => {
      const currentScale = context.transformState.scale
      if (currentScale !== prevScaleRef.current) {
        prevScaleRef.current = currentScale
        onScaleChange?.(currentScale)
      }
    }

    const interval = setInterval(checkScale, 100)
    return () => clearInterval(interval)
  }, [context, onScaleChange])

  const scale = prevScaleRef.current
  const isPaintMode = scale >= PAINT_SCALE

  useEffect(() => {
    const canvas = pixelCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawPixels(ctx, pixelData, mapView, width, height, mask, userAddress, userColor)
  }, [pixelData, mapView, pixelCanvasRef, version, userAddress, userColor, width, height, mask])

  return (
    <div style={{ position: 'relative', width, height }}>
      <PixelLayer canvasRef={pixelCanvasRef} />
      <FlashLayer changedIds={changedIds ?? []} pixelData={pixelData} />
      {mapView === 'normal' && (
        <TerritoryLabels pixelData={pixelData} scale={scale} profilesMap={profilesMap} />
      )}
      <SelectionLayer
        selectedIds={selectedIds}
        isPaintMode={isPaintMode}
        scale={scale}
        onTogglePixel={onTogglePixel}
        onAddPixel={onAddPixel}
        onInspectPixel={onInspectPixel}
        onTapWhileZoomedOut={onTapWhileZoomedOut}
      />
    </div>
  )
}

// Invisible component that captures zoom controls into a ref
function ZoomCapture({ controlsRef }: { controlsRef: React.MutableRefObject<{ zoomIn: () => void; zoomOut: () => void; setTransform: (x: number, y: number, s: number, ms?: number) => void } | null> }) {
  const { zoomIn, zoomOut, setTransform } = useControls()
  useEffect(() => {
    controlsRef.current = { zoomIn, zoomOut, setTransform }
  }, [zoomIn, zoomOut, setTransform, controlsRef])
  return null
}

const WorldCanvas = forwardRef<WorldCanvasRef, WorldCanvasProps>(
  function WorldCanvas(props, ref) {
    const { width, height, slug } = useCurrentMapMeta()

    // Measure the wrapper so we can compute a per-map "fit" scale —
    // the scale at which the map just fills the viewport. This becomes
    // both the minimum scale (no zooming further out, so the map never
    // shrinks into a tiny floating shape) and the initial scale (so
    // each map opens at a comfortable, framed view). Re-measures on
    // resize via ResizeObserver.
    const containerRef = useRef<HTMLDivElement>(null)
    const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null)

    useEffect(() => {
      const el = containerRef.current
      if (!el) return
      const measure = () => {
        const w = el.clientWidth
        const h = el.clientHeight
        if (w > 0 && h > 0) setContainerSize({ w, h })
      }
      measure()
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }, [])

    const fitScale = useMemo(() => {
      if (!containerSize) return 3
      // Scale at which the map exactly fills the viewport. 0.92 leaves
      // a small margin so the map isn't kissing the screen edges.
      const fit = Math.min(containerSize.w / width, containerSize.h / height) * 0.92
      return Math.max(1, fit)
    }, [containerSize, width, height])

    // Minimum allowed zoom: 75% of the fit scale, so the map can shrink
    // a little for breathing room but never disappears into a tiny
    // shape floating in the ocean.
    const minScale = useMemo(() => Math.max(1, fitScale * 0.75), [fitScale])

    // Open already zoomed in far enough to select pixels (paint mode), so
    // the player can start claiming immediately instead of having to zoom
    // first. We open a notch past PAINT_SCALE for a comfortable tap target;
    // if the whole map already fills the screen above that (small map on a
    // big viewport), keep the fit view. They can pinch out to minScale for
    // the overview.
    const initialScale = useMemo(
      () => Math.max(fitScale, PAINT_SCALE + 1),
      [fitScale],
    )

    // Remount the TransformWrapper when the active map slug changes or
    // when the initial scale shifts meaningfully (e.g. desktop resize). A
    // stable key for the same map keeps in-session pan/zoom state.
    const transformKey = `${slug}:${Math.round(initialScale * 10)}`

    const pixelCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const selectionCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const zoomControlsRef = useRef<{ zoomIn: () => void; zoomOut: () => void; setTransform: (x: number, y: number, s: number, ms?: number) => void } | null>(null)
    const inspectRingRef = useRef<{
      x: number
      y: number
    } | null>(null)

    useImperativeHandle(ref, () => ({
      zoomIn() { zoomControlsRef.current?.zoomIn() },
      zoomOut() { zoomControlsRef.current?.zoomOut() },
      zoomToPixel(pid: number, scale?: number) {
        // Retry until both the zoom controls and the wrapper element are
        // ready. The geo-auto-zoom path calls this right after the map's
        // loadState flips to 'ready', which can be a few frames before
        // <ZoomCapture>'s useEffect attaches zoomControlsRef.
        const tryNow = (): boolean => {
          const ctrl = zoomControlsRef.current
          if (!ctrl) return false
          // IMPORTANT: read clientWidth/Height from the .react-transform-wrapper
          // (the OUTER element that has the viewport's dimensions), NOT from
          // the inner transformed element.
          const canvas = pixelCanvasRef.current
          if (!canvas) return false
          const wrapper = canvas.closest('.react-transform-wrapper') as HTMLElement | null
          if (!wrapper) return false
          const { x, y } = idToXY(pid, width)
          // Clamp the target scale to the minScale floor so callers
          // can't request a zoom that drops below the map's framed view.
          const s = Math.max(scale ?? PAINT_SCALE + 1, minScale)
          const tx = -x * s + wrapper.clientWidth / 2
          const ty = -y * s + wrapper.clientHeight / 2
          ctrl.setTransform(tx, ty, s, 300)
          return true
        }
        if (tryNow()) return
        const start = Date.now()
        const retry = () => {
          if (tryNow()) return
          if (Date.now() - start > 2000) return
          setTimeout(retry, 50)
        }
        setTimeout(retry, 50)
      },
      recenter() {
        const ctrl = zoomControlsRef.current
        if (!ctrl) return
        const canvas = pixelCanvasRef.current
        if (!canvas) return
        const wrapper = canvas.closest('.react-transform-wrapper')
        if (!wrapper) return
        const s = fitScale
        const ww = (wrapper as HTMLElement).clientWidth
        const wh = (wrapper as HTMLElement).clientHeight
        const tx = (ww - width * s) / 2
        const ty = (wh - height * s) / 2
        ctrl.setTransform(tx, ty, s, 300)
      },
      drawInspectRing(pid: number) {
        const canvas = selectionCanvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        // Clear previous inspect ring
        if (inspectRingRef.current) {
          const { x, y } = inspectRingRef.current
          ctx.clearRect(x - 0.5, y - 0.5, 2, 2)
        }
        const { x, y } = idToXY(pid, width)
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 0.2
        ctx.strokeRect(x + 0.05, y + 0.05, 0.9, 0.9)
        inspectRingRef.current = { x, y }
      },
      clearInspectRing() {
        const canvas = selectionCanvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        if (inspectRingRef.current) {
          const { x, y } = inspectRingRef.current
          ctx.clearRect(x - 0.5, y - 0.5, 2, 2)
          inspectRingRef.current = null
        }
      },
    }))

    const handleScaleChange = useCallback(
      (scale: number) => {
        props.onScaleChange?.(scale)
      },
      [props.onScaleChange],
    )

    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <TransformWrapper
          key={transformKey}
          minScale={minScale}
          maxScale={40}
          initialScale={initialScale}
          wheel={{ step: 2 }}
          pinch={{ step: 5 }}
          // A single tap now zooms in toward the tapped point (see
          // SelectionLayer / handleTapWhileZoomedOut), so the library's
          // double-click zoom is disabled to avoid a double-zoom.
          doubleClick={{ disabled: true }}
          limitToBounds={false}
          centerOnInit
          smooth
        >
          <ZoomCapture controlsRef={zoomControlsRef} />
          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%' }}
          >
            <InnerCanvas
              {...props}
              onScaleChange={handleScaleChange}
              pixelCanvasRef={pixelCanvasRef}
              selectionCanvasRef={selectionCanvasRef}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
    )
  },
)

export default WorldCanvas
