'use client'
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import WorldCanvas, { type WorldCanvasRef } from '@/components/Map/WorldCanvas'
import TopBar from '@/components/Layout/TopBar'
import MapSwitcher from '@/components/Layout/MapSwitcher'
import AwayFromHomeIndicator from '@/components/Layout/AwayFromHomeIndicator'
import PaintModeBanner from '@/components/Map/PaintModeBanner'
import HeatmapLegend from '@/components/Map/HeatmapLegend'
import ZoomHintToast from '@/components/Layout/ZoomHintToast'
import CampaignBanner from '@/components/Layout/CampaignBanner'
import BottomNav from '@/components/Layout/BottomNav'
import DimLayer from '@/components/Overlays/DimLayer'
import SelectionDrawer from '@/components/Overlays/SelectionDrawer'
import PixelInfoPanel from '@/components/Overlays/PixelInfoPanel'
import IntroScreen from '@/components/Overlays/IntroScreen'
import { usePixelMap } from '@/hooks/usePixelMap'
import { useSelection } from '@/hooks/useSelection'
import { usePixelPrice } from '@/hooks/usePixelPrice'
import { useBuyPixels } from '@/hooks/useBuyPixels'
import { useProfile } from '@/hooks/useProfile'
import { useUSDTBalance } from '@/hooks/useUSDTBalance'
import { useMaps } from '@/hooks/useMaps'
import { fetchLandMaskFromContract } from '@/lib/landMask'
import { MONDETO_ABI } from '@/lib/contract'
import { getContractByMapId } from '@/lib/maps/contracts'
import { decodeBytes } from '@/lib/decodeBytes'
import { uint24ToHex } from '@/lib/colorUtils'
import { PAINT_SCALE } from '@/constants/map'
import { useTheme } from '@/lib/theme'
import { geoToPixel, pixelId as pixelIdFn } from '@/lib/pixelMath'

export default function Home() {
  const { isDark } = useTheme()
  const { address } = useAccount()
  const addrStr = address as string | undefined
  const publicClient = usePublicClient()

  const { currentMapId } = useMaps()
  const mondetoAddress = getContractByMapId(currentMapId)

  const { pixelDataRef, loadState, load, refresh, version, changedIds } = usePixelMap(currentMapId)
  const {
    selectedIds,
    togglePixel,
    addPixel,
    removePixel,
    clearSelection,
    pixelCount,
    limitBump,
  } = useSelection()

  const { totalPrice, isLoading: priceLoading } = usePixelPrice(selectedIds, currentMapId)
  const buy = useBuyPixels(currentMapId)
  const profile = useProfile(addrStr, currentMapId)

  const walletBalance = useUSDTBalance()

  const [drawerProfiles, setDrawerProfiles] = useState<Map<string, { label: string; url: string }>>(new Map())
  const [mapProfiles, setMapProfiles] = useState<Map<string, { label: string; url?: string; color?: string }>>(new Map())

  const [mapView, setMapView] = useState<'normal' | 'heatmap' | 'myland'>('normal')
  const [currentScale, setCurrentScale] = useState(1)
  const [activeOverlay, setActiveOverlay] = useState<'none' | 'drawer' | 'info'>('none')
  const [tappedPixelId, setTappedPixelId] = useState<number | null>(null)
  const [userBalance, setUserBalance] = useState(0n)

  const canvasRef = useRef<WorldCanvasRef | null>(null)
  const hasZoomedPast4xRef = useRef(false)

  const isPaintMode = currentScale >= PAINT_SCALE

  // Fetch land mask and reload when chain or current map changes
  useEffect(() => {
    clearSelection()
    if (publicClient) {
      fetchLandMaskFromContract(
        publicClient.readContract.bind(publicClient) as Parameters<typeof fetchLandMaskFromContract>[0],
        mondetoAddress,
        MONDETO_ABI,
      ).then(() => load())
    }
  }, [publicClient, load, mondetoAddress])

  // Geolocation auto-zoom on first visit. Lands the user on their region
  // so they can start picking pixels right away. We ask once, remember the
  // decision, and skip on subsequent visits.
  useEffect(() => {
    if (loadState !== 'ready') return
    if (typeof window === 'undefined' || !navigator.geolocation) return

    try {
      const decided = localStorage.getItem('mondeto-geo-decision')
      if (decided === 'declined') return
      const alreadyZoomed = sessionStorage.getItem('mondeto-geo-zoomed')
      if (alreadyZoomed) return
    } catch {}

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { x, y } = geoToPixel(pos.coords.latitude, pos.coords.longitude)
        const targetId = pixelIdFn(x, y)
        try {
          localStorage.setItem('mondeto-geo-decision', 'granted')
          sessionStorage.setItem('mondeto-geo-zoomed', '1')
        } catch {}

        // The canvas ref + its internal TransformWrapper need a few frames
        // to be ready after loadState flips to 'ready'. Retry up to ~2s
        // until the ref is attached, then fire the zoom.
        const start = Date.now()
        const tryZoom = () => {
          const ref = canvasRef.current
          if (ref) {
            ref.zoomToPixel(targetId)
            console.log(`[geo] zoomed to pixel (${x}, ${y}) from lat/lng ${pos.coords.latitude.toFixed(2)},${pos.coords.longitude.toFixed(2)}`)
            return
          }
          if (Date.now() - start > 2000) {
            console.warn('[geo] canvas ref never attached, giving up')
            return
          }
          setTimeout(tryZoom, 100)
        }
        tryZoom()
      },
      (err) => {
        console.warn('[geo] permission denied or error:', err.message)
        try {
          localStorage.setItem('mondeto-geo-decision', 'declined')
        } catch {}
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    )
  }, [loadState])

  // Fetch profiles for territory labels
  useEffect(() => {
    if (!publicClient || loadState !== 'ready') return
    const owners = new Set<string>()
    for (const px of pixelDataRef.current) {
      if (px.owner !== '0x0000000000000000000000000000000000000000') {
        owners.add(px.owner.toLowerCase())
      }
    }
    if (owners.size === 0) return

    async function fetchProfiles() {
      const profiles = new Map<string, { label: string; url?: string; color?: string }>()
      const ownerArr = [...owners]
      for (let i = 0; i < ownerArr.length; i += 10) {
        const batch = ownerArr.slice(i, i + 10)
        const results = await Promise.allSettled(
          batch.map(addr =>
            publicClient!.readContract({
              address: mondetoAddress,
              abi: MONDETO_ABI,
              functionName: 'profiles',
              args: [addr as `0x${string}`],
            })
          )
        )
        for (let j = 0; j < results.length; j++) {
          const r = results[j]
          if (r.status === 'fulfilled' && r.value) {
            const [color, labelBytes, urlBytes] = r.value as [number, unknown, unknown]
            const label = decodeBytes(labelBytes)
            const url = decodeBytes(urlBytes)
            if (label) {
              profiles.set(batch[j], { label, url, color: color ? uint24ToHex(color) : '' })
            }
          }
        }
      }
      setMapProfiles(profiles)
    }
    fetchProfiles()
  }, [publicClient, loadState, version])

  // Use real on-chain balance when wallet connected
  useEffect(() => {
    if (walletBalance.isConnected && walletBalance.balance) {
      const parsed = Math.floor(parseFloat(walletBalance.balance) * 1_000_000)
      setUserBalance(BigInt(parsed))
    }
  }, [walletBalance.isConnected, walletBalance.balance])

  // Check balance when price changes
  useEffect(() => {
    if (totalPrice > 0n) {
      buy.checkBalance(totalPrice, userBalance)
    }
  }, [totalPrice, userBalance, buy.checkBalance])

  const handleScaleChange = useCallback((scale: number) => {
    setCurrentScale(scale)
    if (scale >= PAINT_SCALE) {
      hasZoomedPast4xRef.current = true
    }
    // Persist zoom for navigation back
    try { sessionStorage.setItem('mondeto-zoom', String(scale)) } catch {}
  }, [])

  const effectiveAddr = addrStr || '0xYOUR000000000000000000000000000000000001'

  const handleAddPixel = useCallback((id: number) => {
    addPixel(id)
  }, [addPixel])

  const handleTogglePixel = useCallback((id: number) => {
    togglePixel(id)
  }, [togglePixel])

  const handleTapWhileZoomedOut = useCallback((id: number) => {
    canvasRef.current?.zoomToPixel(id)
  }, [])

  const handleInspectPixel = useCallback((id: number) => {
    setTappedPixelId(id)
    setActiveOverlay('info')
    canvasRef.current?.drawInspectRing(id)
  }, [])

  const handleDismissOverlay = useCallback(() => {
    setActiveOverlay('none')
    setTappedPixelId(null)
    canvasRef.current?.clearInspectRing()
    buy.reset()
  }, [buy])

  const handleBuy = useCallback(() => {
    buy.execute([...selectedIds], totalPrice)
  }, [selectedIds, totalPrice, buy])

  const handleDone = useCallback(() => {
    clearSelection()
    setActiveOverlay('none')
    buy.reset()
    // Refresh immediately, then again after 2s to catch RPC propagation delay
    refresh()
    setTimeout(() => refresh(), 2000)
  }, [clearSelection, buy, refresh])

  const handleRemovePixels = useCallback((ids: number[]) => {
    for (const id of ids) removePixel(id)
  }, [removePixel])

  const handleClear = useCallback(() => {
    clearSelection()
    setActiveOverlay('none')
  }, [clearSelection])

  const handleBuyThisPixel = useCallback((id: number) => {
    clearSelection()
    addPixel(id)
    setActiveOverlay('drawer')
    canvasRef.current?.clearInspectRing()
    setTappedPixelId(null)
  }, [clearSelection, addPixel])

  // Open drawer only when user taps the review pill
  const handleOpenDrawer = useCallback(async () => {
    buy.reset()
    setActiveOverlay('drawer')

    // Fetch profiles for owners in selection
    if (publicClient) {
      const owners = new Set<string>()
      for (const id of selectedIds) {
        const px = pixelDataRef.current[id]
        if (px && px.owner !== '0x0000000000000000000000000000000000000000') {
          owners.add(px.owner.toLowerCase())
        }
      }
      const profiles = new Map<string, { label: string; url: string }>()
      const results = await Promise.allSettled(
        [...owners].map(addr =>
          publicClient.readContract({
            address: mondetoAddress,
            abi: MONDETO_ABI,
            functionName: 'profiles',
            args: [addr as `0x${string}`],
          })
        )
      )
      const ownerArr = [...owners]
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value) {
          const [, labelBytes, urlBytes] = r.value as [number, unknown, unknown]
          profiles.set(ownerArr[i], {
            label: decodeBytes(labelBytes),
            url: decodeBytes(urlBytes),
          })
        }
      }
      setDrawerProfiles(profiles)
    }
  }, [buy, selectedIds, pixelDataRef, publicClient])

  const tappedPixel = tappedPixelId !== null ? pixelDataRef.current[tappedPixelId] ?? null : null
  const showDim = activeOverlay !== 'none'
  const isDrawerLocked = buy.step === 'approving' || buy.step === 'buying' || buy.step === 'confirming'

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: 'var(--bg)',
      }}
    >
      {/* Top bar */}
      <TopBar title="MONDETO">
        <MapSwitcher currentMapPixels={pixelDataRef.current} />
        {(['heatmap', 'myland'] as const).map(v => (
          <button
            key={v}
            onClick={() => setMapView(mapView === v ? 'normal' : v)}
            style={{
              fontSize: 6,
              fontFamily: "'Press Start 2P', monospace",
              letterSpacing: 1,
              borderRadius: 8,
              padding: '3px 6px',
              background: mapView === v ? 'var(--button-bg)' : 'transparent',
              color: mapView === v ? 'var(--button-text)' : 'var(--text)',
              border: '1px solid var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {v === 'myland' ? 'my land' : v}
          </button>
        ))}
      </TopBar>

      <AwayFromHomeIndicator />

      {/* WorldCanvas */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          bottom: 56,
          left: 0,
          right: 0,
        }}
      >
        <WorldCanvas
          ref={canvasRef}
          pixelData={pixelDataRef.current}
          mapView={mapView}
          isDark={isDark}
          selectedIds={selectedIds}
          onTogglePixel={handleTogglePixel}
          onAddPixel={handleAddPixel}
          onInspectPixel={handleInspectPixel}
          onScaleChange={handleScaleChange}
          onTapWhileZoomedOut={handleTapWhileZoomedOut}
          version={version}
          loadState={loadState}
          userAddress={addrStr}
          changedIds={changedIds}
          profilesMap={mapProfiles}
        />
      </div>

      {/* Zoom +/- buttons */}
      <div
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <button
          onClick={() => canvasRef.current?.zoomIn()}
          style={{
            width: 40, height: 40, borderRadius: 8,
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            fontSize: 20, fontWeight: 700, color: 'var(--text)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >+</button>
        <button
          onClick={() => canvasRef.current?.recenter()}
          style={{
            width: 40, height: 40, borderRadius: 8,
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            fontSize: 12, color: 'var(--text)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx={12} cy={12} r={3} />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </button>
        <button
          onClick={() => canvasRef.current?.zoomOut()}
          style={{
            width: 40, height: 40, borderRadius: 8,
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            fontSize: 20, fontWeight: 700, color: 'var(--text)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >{'\u2212'}</button>
      </div>

      {/* Paint mode banner */}
      <PaintModeBanner
        visible={isPaintMode}
        scale={Math.round(currentScale)}
        pixelCount={pixelCount}
        limitBump={limitBump}
      />

      {/* Heatmap legend */}
      <HeatmapLegend visible={mapView === 'heatmap'} />

      {/* Zoom hint toast */}
      <ZoomHintToast hasZoomedPast4x={hasZoomedPast4xRef.current} />
      {/* <CampaignBanner /> */}

      {/* Selection review pill — user taps this to open drawer */}
      {pixelCount > 0 && activeOverlay === 'none' && (
        <button
          onClick={handleOpenDrawer}
          style={{
            position: 'absolute',
            bottom: 90,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 15,
            background: 'var(--button-bg)',
            color: 'var(--button-text)',
            fontSize: 8,
            fontFamily: "'Press Start 2P', monospace",
            letterSpacing: 2,
            padding: '14px 28px',
            borderRadius: 11,
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          [ REVIEW {pixelCount} PIXELS ]
        </button>
      )}

      {/* Dim layer — only rendered when an overlay is active */}
      {activeOverlay !== 'none' && (
        <DimLayer
          visible={true}
          locked={isDrawerLocked}
          onDismiss={handleDismissOverlay}
        />
      )}

      {/* Selection drawer — only rendered when open */}
      {activeOverlay === 'drawer' && (
        <SelectionDrawer
          visible={true}
          selectedIds={selectedIds}
          pixelData={pixelDataRef.current}
          totalPrice={totalPrice}
          priceLoading={priceLoading}
          insufficientBalance={buy.insufficientBalance}
          userBalance={userBalance}
          txStep={buy.step}
          txHash={buy.txHash}
          userAddress={effectiveAddr}
          profilesMap={drawerProfiles}
          onRemovePixels={handleRemovePixels}
          onClear={handleClear}
          onBuy={handleBuy}
          onDone={handleDone}
        />
      )}

      {/* Pixel info panel — only rendered when open */}
      {activeOverlay === 'info' && (
        <PixelInfoPanel
          visible={true}
          pixel={tappedPixel}
          pixelId={tappedPixelId ?? 0}
          onBuyThisPixel={handleBuyThisPixel}
          onDismiss={handleDismissOverlay}
        />
      )}

      {/* Bottom nav */}
      <BottomNav activeRoute="/" />
      <IntroScreen />
    </div>
  )
}
