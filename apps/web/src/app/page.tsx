'use client'
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useAccount } from 'wagmi'
import WorldCanvas, { type WorldCanvasRef } from '@/components/Map/WorldCanvas'
import TopBar from '@/components/Layout/TopBar'
import MapSwitcher from '@/components/Layout/MapSwitcher'
import AwayFromHomeIndicator from '@/components/Layout/AwayFromHomeIndicator'
import PaintModeBanner from '@/components/Map/PaintModeBanner'
import HeatmapLegend from '@/components/Map/HeatmapLegend'
import ZoomHintToast from '@/components/Layout/ZoomHintToast'
import CampaignBanner from '@/components/Layout/CampaignBanner'
import BridgeBanner from '@/components/Layout/BridgeBanner'
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
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'
import { useMaps } from '@/hooks/useMaps'
import { fetchLandMaskFromContract, isLandXY } from '@/lib/landMask'
import { MONDETO_ABI } from '@/lib/contract'
import { getContractByMapId } from '@/lib/maps/contracts'
import { decodeBytes } from '@/lib/decodeBytes'
import { uint24ToHex } from '@/lib/colorUtils'
import { PAINT_SCALE } from '@/constants/map'
import { useReadClient } from '@/hooks/useReadClient'
import { geoToPixel, pixelId as pixelIdFn } from '@/lib/pixelMath'

export default function Home() {
  // Dark is the only theme now; downstream map components still take the flag
  // so we pin it to true at the boundary rather than threading every callsite.
  const isDark = true
  const { address, isConnected } = useAccount()
  const addrStr = address as string | undefined
  // Guaranteed-defined read client (wagmi → fallback viem client). The
  // map UI is browse-first and shouldn't bail just because no wallet is
  // resolved yet or because Privy's WagmiProvider hasn't initialized.
  const publicClient = useReadClient()

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

  const walletBalance = useStablecoinBalance()

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

  // Auto-zoom to the player's region on first visit. Uses Vercel's
  // IP-derived coordinates via /api/geo instead of the browser
  // geolocation API — that path hangs in MiniPay's WebView even with a
  // Permissions-Policy header, and city-level precision is plenty for
  // a country-sized zoom. Bonus: no permission prompt to dismiss.
  useEffect(() => {
    if (loadState !== 'ready') return
    if (typeof window === 'undefined') return

    try {
      const alreadyZoomed = sessionStorage.getItem('mondeto-geo-zoomed')
      if (alreadyZoomed) {
        return
      }
    } catch {}

    const ctrl = new AbortController()
    const HARD_TIMEOUT_MS = 8_000
    const hardTimeout = setTimeout(() => {
      ctrl.abort()
      console.warn('[geo] /api/geo timed out after', HARD_TIMEOUT_MS, 'ms')
    }, HARD_TIMEOUT_MS)

    fetch('/api/geo', { signal: ctrl.signal })
      .then(async (r) => {
        clearTimeout(hardTimeout)
        if (!r.ok) throw new Error(`/api/geo ${r.status}`)
        const data = (await r.json()) as {
          lat: number | null
          lng: number | null
          city: string | null
          country: string | null
        }
        if (data.lat === null || data.lng === null) {
          console.warn('[geo] no IP geo headers (local dev?)')
          return
        }
        const { lat, lng } = data
        const { x, y } = geoToPixel(lat, lng)
        const targetId = pixelIdFn(x, y)
        const landed = isLandXY(x, y)

        // The canvas ref + its internal TransformWrapper need a few
        // frames to be ready after loadState flips to 'ready'. Retry
        // up to ~2s until the ref is attached, then fire the zoom.
        // Only mark sessionStorage AFTER the zoom actually succeeds so
        // a slow canvas mount doesn't strand later loads on the world
        // view.
        const start = Date.now()
        const tryZoom = () => {
          const ref = canvasRef.current
          if (ref) {
            // Scale 10 everywhere — at narrower viewport widths it
            // gets a smaller absolute area on screen, but the per-tile
            // size stays the same so the picking feel is consistent.
            // (We previously bumped to 18 on mobile but it overshot.)
            ref.zoomToPixel(targetId, 10)
            try {
              sessionStorage.setItem('mondeto-geo-zoomed', '1')
            } catch {}
            console.log(
              `[geo] zoomed to pixel (${x}, ${y}) from lat/lng ${lat.toFixed(2)},${lng.toFixed(2)} — land=${landed} via /api/geo (${data.city ?? '?'}, ${data.country ?? '?'})`,
            )
            return
          }
          if (Date.now() - start > 2000) {
            console.warn('[geo] canvas ref never attached, giving up')
            return
          }
          setTimeout(tryZoom, 100)
        }
        tryZoom()
      })
      .catch((err: unknown) => {
        clearTimeout(hardTimeout)
        if ((err as { name?: string } | undefined)?.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'unknown error'
        console.warn('[geo] /api/geo failed:', message)
      })

    return () => {
      ctrl.abort()
      clearTimeout(hardTimeout)
    }
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

  // Use real on-chain balance when wallet connected. Each buy is settled in
  // a single stablecoin — the user's highest-balance one (`preferred`) — so
  // the affordability check has to key off THAT specific balance, not a
  // total summed across all three. Otherwise we'd green-light a $3 buy for
  // a wallet holding $2 USDC + $1 USDm and the on-chain transferFrom would
  // revert. Stored in 6-decimal units to match pixel prices on-chain.
  useEffect(() => {
    if (walletBalance.isConnected) {
      const preferredAmount = walletBalance.preferred?.amount ?? 0
      const parsed = Math.floor(preferredAmount * 1_000_000)
      setUserBalance(BigInt(parsed))
    }
  }, [walletBalance.isConnected, walletBalance.preferred?.amount])

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
      <TopBar title="MONDETO" />

      {/* HEATMAP / MY LAND toggle — sits under the TopBar on the lime band */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: 0,
          right: 0,
          height: 26,
          zIndex: 9,
          background: 'var(--brand-lime)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 14px',
          gap: 6,
        }}
      >
        {(['heatmap', 'myland'] as const).map((v, i) => {
          const active = mapView === v
          return (
            <React.Fragment key={v}>
              {i > 0 && (
                <span
                  className="font-display"
                  style={{ fontSize: 10, color: 'var(--brand-black)', letterSpacing: 2 }}
                >
                  /
                </span>
              )}
              <button
                onClick={() => setMapView(mapView === v ? 'normal' : v)}
                className="font-display"
                style={{
                  fontSize: 10,
                  letterSpacing: 2,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--brand-black)',
                  opacity: active ? 1 : 0.5,
                  cursor: 'pointer',
                  padding: 0,
                  textTransform: 'uppercase',
                }}
              >
                {v === 'myland' ? 'MY LAND' : 'HEATMAP'}
              </button>
            </React.Fragment>
          )
        })}
      </div>

      {/* WorldCanvas — blue ocean is the wrapper background; land pixels are
          drawn by PixelLayer on top. */}
      <div
        style={{
          position: 'absolute',
          top: 82,
          bottom: 56,
          left: 0,
          right: 0,
          background: 'var(--brand-blue)',
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

      {/* Zoom controls \u2014 brand pixel icons */}
      <div
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <button
          onClick={() => canvasRef.current?.zoomIn()}
          aria-label="Zoom in"
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <img src="/brand/icons/zoom-in.svg" alt="" width={36} height={36} style={{ imageRendering: 'pixelated' }} />
        </button>
        <button
          onClick={() => canvasRef.current?.recenter()}
          aria-label="Recenter"
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <img src="/brand/icons/centre.svg" alt="" width={36} height={36} style={{ imageRendering: 'pixelated' }} />
        </button>
        <button
          onClick={() => canvasRef.current?.zoomOut()}
          aria-label="Zoom out"
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <img src="/brand/icons/zoom-out.svg" alt="" width={36} height={36} style={{ imageRendering: 'pixelated' }} />
        </button>
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
      {/* Browser-only — points users with empty Celo wallets at Squid to
          bridge in. The component self-hides in MiniPay (where the in-drawer
          TOP UP BALANCE deeplink to MiniPay Add Cash handles the same case). */}
      <BridgeBanner />

      {/* Selection review pill — user taps this to open drawer. When no
          wallet is connected we swap to a "connect to buy" hint since the
          drawer's BALANCE / LOCK IT IN flow has no meaning yet. The
          existing CONNECT button in the top-right is the actual CTA. */}
      {pixelCount > 0 && activeOverlay === 'none' && isConnected && (
        <button
          onClick={handleOpenDrawer}
          className="pixel-btn pixel-btn-filled font-display"
          style={{
            position: 'absolute',
            bottom: 90,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 15,
            fontSize: 10,
            letterSpacing: 2,
            padding: '10px 24px',
            whiteSpace: 'nowrap',
          }}
        >
          REVIEW {pixelCount} PIXELS
        </button>
      )}
      {pixelCount > 0 && activeOverlay === 'none' && !isConnected && (
        <div
          style={{
            position: 'absolute',
            bottom: 90,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 15,
            fontSize: 9,
            fontFamily: "'Press Start 2P', monospace",
            letterSpacing: 2,
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            padding: '10px 18px',
            textAlign: 'center',
            maxWidth: 320,
          }}
        >
          connect your wallet to buy
        </div>
      )}

      {/* Dim layer — only rendered when an overlay is active */}
      {activeOverlay !== 'none' && (
        <DimLayer
          visible={true}
          locked={isDrawerLocked}
          onDismiss={handleDismissOverlay}
        />
      )}

      {/* Selection drawer — only rendered when open AND a wallet is
          connected (the BALANCE + LOCK IT IN flow has no meaning otherwise). */}
      {activeOverlay === 'drawer' && isConnected && (
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
          txError={buy.error}
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
