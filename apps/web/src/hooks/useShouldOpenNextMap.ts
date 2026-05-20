'use client'

import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { MONDETO_ADDRESS, MONDETO_ABI } from '@/lib/contract'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { shouldOpenNextMap } from '@/lib/maps/assignment'
import type {
  MapId,
  MapSnapshot,
  OpenNextDecision,
  PixelState,
} from '@/lib/maps/types'
import { WIDTH } from '@/constants/map'
import { isLand } from '@/lib/landMask'

const PIXEL_PRICE_USDT_DECIMALS = 6
const PIXEL_PRICE_USDT_DIVISOR = 10 ** PIXEL_PRICE_USDT_DECIMALS

const CACHE_KEY = 'mondeto-should-open-next-map-cache'
const CACHE_TTL_MS = 60_000

const DEFAULT_THRESHOLD_USD = 2

export interface MapFillSummary {
  mapId: MapId
  fillPct: number
  avgPriceUsd: number
  ownedCount: number
  totalLand: number
}

export interface ShouldOpenNextMapResult {
  loading: boolean
  error: string | null
  thresholdUsd: number
  decision: OpenNextDecision | null
  perMap: MapFillSummary[]
  fetchedAt: number
}

interface CachedShape {
  ts: number
  thresholdUsd: number
  decision: OpenNextDecision | null
  perMap: MapFillSummary[]
}

/**
 * Read the average-price-to-open-next-map threshold.
 *
 * Priority order:
 *   1. Agent A's settings store (when merged) — TODO: read from there.
 *   2. NEXT_PUBLIC_MAP_THRESHOLD_USD env override.
 *   3. Hardcoded $2 default per the launch plan.
 */
function readThresholdUsd(): number {
  const raw =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_MAP_THRESHOLD_USD
      : undefined
  if (raw) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_THRESHOLD_USD
}

/**
 * Resolve the list of revealed maps. When PR #32 lands this should call
 * getRevealedMaps() from lib/maps/contracts.ts and return their addresses.
 * Until then we fall back to the single live address as map 0.
 */
interface RevealedMapAddr {
  id: MapId
  address: `0x${string}`
}

function getRevealedMapsFallback(): RevealedMapAddr[] {
  // when #32 lands, this reads from getRevealedMaps()
  return [{ id: 0, address: MONDETO_ADDRESS }]
}

/**
 * Adapter: PixelView[] (row-major over the WIDTH×HEIGHT grid) -> PixelState[].
 * When Agent C's adapter PR lands we should import their shared adapter.
 * For now this small inline conversion does the job.
 */
export function pixelViewsToStates(
  views: Array<{ owner: string; currentPrice: bigint }>,
): PixelState[] {
  const out: PixelState[] = []
  for (let i = 0; i < views.length; i++) {
    const v = views[i]
    const x = i % WIDTH
    const y = Math.floor(i / WIDTH)
    const land = isLand(i)
    out.push({
      id: i,
      x,
      y,
      owner:
        v.owner && v.owner !== '0x0000000000000000000000000000000000000000'
          ? v.owner.toLowerCase()
          : null,
      // contract returns USDT 6-decimals; assignment.ts averages currentPrice
      // directly. We feed it the USD value so the threshold (also USD) matches.
      currentPrice: Number(v.currentPrice) / PIXEL_PRICE_USDT_DIVISOR,
      isLand: land,
    })
  }
  return out
}

/**
 * Compute per-map summary from a single map's pixel array.
 * Exposed for unit tests.
 */
export function summarizeMap(
  mapId: MapId,
  pixels: PixelState[],
): MapFillSummary {
  let totalLand = 0
  let ownedCount = 0
  let priceSum = 0
  for (const p of pixels) {
    if (!p.isLand) continue
    totalLand++
    if (p.owner !== null) ownedCount++
    priceSum += p.currentPrice
  }
  const fillPct = totalLand === 0 ? 0 : (ownedCount / totalLand) * 100
  const avgPriceUsd = totalLand === 0 ? 0 : priceSum / totalLand
  return { mapId, fillPct, avgPriceUsd, ownedCount, totalLand }
}

function parseCache(raw: string | null): CachedShape | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CachedShape
    if (typeof parsed.ts !== 'number') return null
    if (Date.now() - parsed.ts >= CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

async function fetchSnapshotForMap(
  publicClient: PublicClient,
  address: `0x${string}`,
): Promise<Array<{ owner: string; currentPrice: bigint }>> {
  // fetchAllPixelsFromContract is hardwired to MONDETO_ADDRESS today, so we
  // only use it when address === MONDETO_ADDRESS. When PR #32 lands and
  // contractReads is parameterized by address, this branch goes away.
  const readContract = publicClient.readContract.bind(publicClient) as Parameters<
    typeof fetchAllPixelsFromContract
  >[0]
  if (address.toLowerCase() === MONDETO_ADDRESS.toLowerCase()) {
    return fetchAllPixelsFromContract(readContract)
  }
  // Generic fallback path (used when address != MONDETO_ADDRESS, i.e. after
  // PR #32 makes multiple maps real). Replicate fetchAllPixelsFromContract.
  const batch = (await publicClient.readContract({
    address,
    abi: MONDETO_ABI,
    functionName: 'getPixelBatch',
    args: [0, 0, WIDTH, 100],
  })) as `0x${string}`
  // Best-effort decode: when more maps exist we expect a shared adapter.
  // For now return a stub so the type checker is happy.
  void batch
  return []
}

export function useShouldOpenNextMap(): ShouldOpenNextMapResult {
  const publicClient = usePublicClient()
  const [state, setState] = useState<ShouldOpenNextMapResult>({
    loading: true,
    error: null,
    thresholdUsd: readThresholdUsd(),
    decision: null,
    perMap: [],
    fetchedAt: 0,
  })

  useEffect(() => {
    if (!publicClient) return
    let cancelled = false

    async function run() {
      const thresholdUsd = readThresholdUsd()
      // Session cache.
      try {
        const cached = parseCache(sessionStorage.getItem(CACHE_KEY))
        if (cached && cached.thresholdUsd === thresholdUsd) {
          if (!cancelled) {
            setState({
              loading: false,
              error: null,
              thresholdUsd: cached.thresholdUsd,
              decision: cached.decision,
              perMap: cached.perMap,
              fetchedAt: cached.ts,
            })
          }
          return
        }
      } catch {}

      try {
        const maps = getRevealedMapsFallback()
        const snapshots: MapSnapshot[] = []
        const summaries: MapFillSummary[] = []

        for (const m of maps) {
          const views = await fetchSnapshotForMap(publicClient!, m.address)
          const pixels = pixelViewsToStates(views)
          snapshots.push({
            meta: { id: m.id, open: true },
            pixels,
          })
          summaries.push(summarizeMap(m.id, pixels))
        }

        summaries.sort((a, b) => a.mapId - b.mapId)

        const decision = shouldOpenNextMap(snapshots, {
          averagePriceThreshold: thresholdUsd,
        })

        const fetchedAt = Date.now()
        const cached: CachedShape = {
          ts: fetchedAt,
          thresholdUsd,
          decision,
          perMap: summaries,
        }
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached))
        } catch {}

        if (cancelled) return
        setState({
          loading: false,
          error: null,
          thresholdUsd,
          decision,
          perMap: summaries,
          fetchedAt,
        })
      } catch (e) {
        if (cancelled) return
        setState((prev) => ({
          ...prev,
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to compute advisory',
        }))
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [publicClient])

  return state
}
