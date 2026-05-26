'use client'
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
  useCallback,
} from 'react'
import {
  TransformWrapper,
  TransformComponent,
  useTransformContext,
  useControls,
} from 'react-zoom-pan-pinch'
import { WIDTH, HEIGHT, PAINT_SCALE } from '@/constants/map'
import { idToXY } from '@/lib/pixelMath'
import type { PixelView } from '@/lib/mock'
import type { LoadState } from '@/hooks/usePixelMap'
import PixelLayer, { drawPixels } from './PixelLayer'
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
  mapView: 'normal' | 'heatmap' | 'myland'
  isDark: boolean
  selectedIds: Set<number>
  onTogglePixel: (id: number) => void
  onAddPixel: (id: number) => void
  onInspectPixel?: (id: number) => void
  onScaleChange?: (scale: number) => void
  onTapWhileZoomedOut?: (id: number) => void
  loadState: LoadState
  version?: number
  userAddress?: string
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
  isDark,
  selectedIds,
  onTogglePixel,
  onAddPixel,
  onInspectPixel,
  onScaleChange,
  pixelCanvasRef,
  version,
  userAddress,
  changedIds,
  profilesMap,
  onTapWhileZoomedOut,
}: InnerCanvasProps) {
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
    drawPixels(ctx, pixelData, mapView, isDark, userAddress)
  }, [pixelData, mapView, isDark, pixelCanvasRef, version, userAddress])

  return (
    <div style={{ position: 'relative', width: WIDTH, height: HEIGHT }}>
      <PixelLayer
        pixelData={pixelData}
        mapView={mapView}
        isDark={isDark}
        canvasRef={pixelCanvasRef}
      />
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

function getSavedZoom(): number {
  try {
    const v = sessionStorage.getItem('mondeto-zoom')
    if (v) { const n = parseFloat(v); if (n >= 1 && n <= 40) return n }
  } catch {}
  return 3
}

const WorldCanvas = forwardRef<WorldCanvasRef, WorldCanvasProps>(
  function WorldCanvas(props, ref) {
    const savedZoom = useRef(getSavedZoom())
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
        // <ZoomCapture>'s useEffect attaches zoomControlsRef. Default
        // scale lands the user just inside paint mode; the geo path
        // passes a smaller value so first-load shows the broader region.
        const tryNow = (): boolean => {
          const ctrl = zoomControlsRef.current
          if (!ctrl) return false
          // IMPORTANT: read clientWidth/Height from the .react-transform-wrapper
          // (the OUTER element that has the viewport's dimensions), NOT from
          // the inner transformed element. `parentElement.parentElement` lands
          // on the latter — which is the canvas's own size — so dividing by it
          // for the center math snaps the target to the canvas's top-left
          // instead of the viewport center.
          const canvas = pixelCanvasRef.current
          if (!canvas) return false
          const wrapper = canvas.closest('.react-transform-wrapper') as HTMLElement | null
          if (!wrapper) return false
          const { x, y } = idToXY(pid)
          const s = scale ?? PAINT_SCALE + 1
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
        // Find the TransformWrapper's outer wrapper element
        const canvas = pixelCanvasRef.current
        if (!canvas) return
        const wrapper = canvas.closest('.react-transform-wrapper')
        if (!wrapper) return
        const s = 3
        const ww = (wrapper as HTMLElement).clientWidth
        const wh = (wrapper as HTMLElement).clientHeight
        const tx = (ww - WIDTH * s) / 2
        const ty = (wh - HEIGHT * s) / 2
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
        const { x, y } = idToXY(pid)
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
      <TransformWrapper
        minScale={1}
        maxScale={40}
        initialScale={savedZoom.current}
        wheel={{ step: 2 }}
        pinch={{ step: 5 }}
        doubleClick={{ step: 0.7 }}
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
    )
  },
)

export default WorldCanvas
