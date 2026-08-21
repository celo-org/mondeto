'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import type { PixelView } from '@/lib/mock'
import type { PriceConfig } from '@/lib/priceCalc'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { getMapContractById } from '@/lib/maps/contracts'
import { getMaskData } from '@/lib/maps/masks'
import { useReadClient } from '@/hooks/useReadClient'
import { track } from '@/lib/analytics'
import { categorizeBuyError } from '@/lib/buyErrors'
import type { MapId } from '@/lib/maps/types'

export type LoadState = 'loading' | 'ready' | 'error'

const POLL_INTERVAL = 30_000
// Bounded auto-retry so a single RPC hiccup (common right after iOS wakes a
// suspended tab) doesn't leave the map permanently blank.
const RETRY_DELAYS_MS = [1500, 4000, 8000]

/**
 * Map-mount lifecycle, for the `map_mount_*` analytics events (schema in
 * lib/analytics.ts). One "mount" = the span from the map screen asking for a
 * full grid to the first paint of a full grid. `entry` is the page opening;
 * `switch` is the player picking another map after the previous mount
 * settled. A mount that is still pending when the map changes (the stored-map
 * restore that runs one effect after first render, or a player switching
 * while the first grid is still loading) is NOT restarted — it carries on and
 * completes against whichever map paints first, so the restore race can't
 * count as a start with no completion.
 */
type MountTrigger = 'entry' | 'switch'
interface PendingMount {
  startedAt: number
  trigger: MountTrigger
  attempts: number
}

/** First line only: viem's summary sits on line one, its URL/request dump below. */
function errorDetail(e: unknown): string {
  return String(e).split('\n')[0].slice(0, 100)
}

/**
 * Pixel map state for a single map.
 *
 * Pass a `mapId` to read from a specific deployed contract. Omitting it
 * (the single-map launch state) keeps the existing behavior — reads route
 * to the world map (id 0).
 */
export function usePixelMap(mapId?: MapId) {
  const readClient = useReadClient()
  const contract = getMapContractById(mapId ?? 0)
  const { mask } = getMaskData(contract.slug)
  const pixelDataRef = useRef<PixelView[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [version, setVersion] = useState(0)
  const [changedIds, setChangedIds] = useState<number[]>([])
  // The map's on-chain pricing config (halvingTime, initialPrice, …),
  // captured from the same config() read that prices the pixels. Used by
  // the falling-price UI (info panel line + DEALS view).
  const [priceConfig, setPriceConfig] = useState<PriceConfig | null>(null)
  const retryCountRef = useRef(0)

  const contractAddress = contract.address
  const resolvedMapId = contract.id

  // --- mount lifecycle -----------------------------------------------------
  // `generation` increments on every contract change; a load() captures the
  // generation it was started for, so a read that lands after the map moved
  // on can still write its (stale) pixels exactly as before but is never
  // taken as this mount's completion.
  const mountRef = useRef<PendingMount | null>(null)
  const generationRef = useRef(0)
  const readyGenerationRef = useRef(-1)
  const lastErrorRef = useRef<unknown>(null)

  // `entry`: fired from the first commit, before the load() effect below
  // kicks off the grid read. Ref-guarded so StrictMode's double effect run in
  // dev doesn't count as two starts.
  useEffect(() => {
    if (mountRef.current) return
    mountRef.current = { startedAt: Date.now(), trigger: 'entry', attempts: 0 }
    track('map_mount_started', { mapId: resolvedMapId, trigger: 'entry' })
    // Run once per hook mount; the map id is captured at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Only swap the config object when a field actually changed, so the
  // 30s poll doesn't re-render consumers with an identical config.
  const handleConfig = useCallback((cfg: PriceConfig) => {
    setPriceConfig(prev =>
      prev &&
      prev.initialPrice === cfg.initialPrice &&
      prev.minPrice === cfg.minPrice &&
      prev.halvingStartTimestamp === cfg.halvingStartTimestamp &&
      prev.halvingTime === cfg.halvingTime
        ? prev
        : cfg,
    )
  }, [])

  const fetchData = useCallback(async (): Promise<PixelView[]> => {
    return await fetchAllPixelsFromContract(
      readClient.readContract.bind(readClient) as Parameters<typeof fetchAllPixelsFromContract>[0],
      contractAddress,
      contract.width,
      contract.height,
      mask,
      handleConfig,
    )
  }, [readClient, contractAddress, contract.width, contract.height, mask, handleConfig])

  const load = useCallback(async () => {
    const generation = generationRef.current
    if (mountRef.current) mountRef.current.attempts += 1
    try {
      setLoadState('loading')
      const data = await fetchData()
      pixelDataRef.current = data
      retryCountRef.current = 0
      if (generation === generationRef.current) readyGenerationRef.current = generation
      setLoadState('ready')
      setVersion(v => v + 1)
    } catch (e) {
      console.warn('Failed to load pixel data:', e)
      if (generation === generationRef.current) lastErrorRef.current = e
      setLoadState('error')
    }
  }, [fetchData])

  // Reset state the instant the map (contract) changes, BEFORE the new
  // map's data arrives. Without this the previous map's pixels keep
  // rendering on the new map's grid for a beat — e.g. World pixels showing
  // on the Africa canvas until the Africa read resolves.
  useEffect(() => {
    pixelDataRef.current = []
    retryCountRef.current = 0
    setLoadState('loading')
    setPriceConfig(null)
    setVersion(v => v + 1)
    generationRef.current += 1
    // A settled previous mount means this change is a player-driven switch:
    // open a new mount. A still-pending one (entry in flight) carries on, and
    // its attempt count restarts so `attempts` stays "reads of the map that
    // painted" rather than also counting the superseded read.
    if (!mountRef.current) {
      mountRef.current = { startedAt: Date.now(), trigger: 'switch', attempts: 0 }
      track('map_mount_started', { mapId: resolvedMapId, trigger: 'switch' })
    } else {
      mountRef.current.attempts = 0
    }
  }, [contractAddress, resolvedMapId])

  // Auto-load on mount and whenever the fetch target changes.
  useEffect(() => {
    load()
  }, [load])

  // `completed`: the first commit in which a full grid for the CURRENT
  // generation is ready. This is a passive effect on the hook's owner (the
  // map screen), and React runs descendants' effects first — so by the time
  // it fires, the canvas's drawPixels effect for this same commit has already
  // painted the grid. Keyed on `version` too, because a superseded read can
  // leave loadState parked on 'ready' before the real one lands.
  useEffect(() => {
    const mount = mountRef.current
    if (!mount || loadState !== 'ready') return
    if (readyGenerationRef.current !== generationRef.current) return
    mountRef.current = null
    track('map_mount_completed', {
      mapId: resolvedMapId,
      trigger: mount.trigger,
      elapsedMs: Date.now() - mount.startedAt,
      attempts: mount.attempts,
    })
  }, [loadState, version, resolvedMapId])

  const refresh = useCallback(async () => {
    try {
      const data = await fetchData()
      pixelDataRef.current = data
      setLoadState('ready')
      setVersion(v => v + 1)
    } catch {
      // Silent fail on refresh
    }
  }, [fetchData])

  const poll = useCallback(async () => {
    try {
      const newData = await fetchData()
      const oldData = pixelDataRef.current
      const changed: number[] = []

      for (let i = 0; i < newData.length; i++) {
        if (oldData[i] && oldData[i].owner !== newData[i].owner) {
          changed.push(i)
        }
      }

      pixelDataRef.current = newData
      setVersion(v => v + 1)

      if (changed.length > 0) {
        setChangedIds(changed)
        setTimeout(() => setChangedIds([]), 1500)
      }
    } catch {
      // Silent fail — next poll will retry
    }
  }, [fetchData])

  useEffect(() => {
    if (loadState !== 'ready') return
    const interval = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [loadState, poll])

  // Bounded retry after a failed load. iOS Safari suspends background tabs;
  // the first read after the app is reopened often errors on a stale
  // connection, which previously left the map blank until the user manually
  // switched maps. Retry a few times with backoff instead.
  useEffect(() => {
    if (loadState !== 'error') return
    if (retryCountRef.current >= RETRY_DELAYS_MS.length) {
      // `failed`: terminal only. A single rejected read is not a failed
      // mount while the retry ladder is still running — if a retry paints
      // the grid, the mount completes (slowly) instead.
      const mount = mountRef.current
      if (mount) {
        mountRef.current = null
        const err = lastErrorRef.current
        track('map_mount_failed', {
          mapId: resolvedMapId,
          trigger: mount.trigger,
          elapsedMs: Date.now() - mount.startedAt,
          attempts: mount.attempts,
          category: categorizeBuyError(String(err)),
          detail: errorDetail(err),
        })
      }
      return
    }
    const delay = RETRY_DELAYS_MS[retryCountRef.current]
    retryCountRef.current += 1
    const t = setTimeout(() => {
      load()
    }, delay)
    return () => clearTimeout(t)
  }, [loadState, load, resolvedMapId])

  // Refetch when the tab/app returns to the foreground. Covers the iOS
  // "left my phone for a while" case where timers are frozen and the
  // existing data may be stale or the connection dropped.
  useEffect(() => {
    function onForeground() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      // refresh keeps the current pixels on screen while re-reading, so
      // there's no flash; if there's nothing yet, load() shows the proper
      // loading state.
      if (pixelDataRef.current.length > 0) refresh()
      else load()
    }
    document.addEventListener('visibilitychange', onForeground)
    window.addEventListener('focus', onForeground)
    return () => {
      document.removeEventListener('visibilitychange', onForeground)
      window.removeEventListener('focus', onForeground)
    }
  }, [refresh, load])

  return { pixelDataRef, loadState, load, refresh, version, changedIds, priceConfig }
}
