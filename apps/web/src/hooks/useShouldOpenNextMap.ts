'use client'

import { useEffect, useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { celo } from 'viem/chains'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { getMapsForChain, type ChainId, type MapContract } from '@/lib/maps/contracts'
import { getMaskData } from '@/lib/maps/masks'
import { useRevealedMapIds } from '@/hooks/useRevealedMapIds'
import { shouldOpenNextMap } from '@/lib/maps/assignment'
import type {
  MapId,
  MapSnapshot,
  OpenNextDecision,
  PixelState,
} from '@/lib/maps/types'
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
 *   1. NEXT_PUBLIC_MAP_THRESHOLD_USD env override (per-environment in Vercel).
 *   2. Hardcoded $2 default per the launch plan.
 *
 * See `project_map_threshold_knob.md` in agent memory for tuning notes.
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
 * Adapter: PixelView[] (row-major over the map's grid) -> PixelState[].
 * The map's grid width and bundled mask come from the per-map MapContract
 * + MaskData so x/y math matches each continent's deployed dimensions.
 */
export function pixelViewsToStates(
  views: Array<{ owner: string; currentPrice: bigint }>,
  width: number,
  mask: Uint8Array,
): PixelState[] {
  const out: PixelState[] = []
  for (let i = 0; i < views.length; i++) {
    const v = views[i]
    const x = i % width
    const y = Math.floor(i / width)
    const land = isLand(i, mask)
    out.push({
      id: i,
      x,
      y,
      owner:
        v.owner && v.owner !== '0x0000000000000000000000000000000000000000'
          ? v.owner.toLowerCase()
          : null,
      currentPrice: Number(v.currentPrice) / PIXEL_PRICE_USDT_DIVISOR,
      isLand: land,
    })
  }
  return out
}

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

/**
 * Session-cache key for the per-map fill snapshot. Includes the sorted
 * revealed ids: the effect's first run happens with the pre-/api/reveals
 * default ([0]), and a cache entry written then must not shadow the
 * fetch for the full revealed set once it loads — with a chain-only key,
 * a just-revealed map showed no fill data ("?") for the whole session.
 */
export function cacheKeyFor(chainId: ChainId, revealedIds: number[]): string {
  return `${CACHE_KEY}:${chainId}:${[...revealedIds].sort((a, b) => a - b).join('-')}`
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
  contract: MapContract,
): Promise<Array<{ owner: string; currentPrice: bigint }>> {
  const readContract = publicClient.readContract.bind(publicClient) as Parameters<
    typeof fetchAllPixelsFromContract
  >[0]
  const { mask } = getMaskData(contract.slug)
  return fetchAllPixelsFromContract(
    readContract,
    contract.address,
    contract.width,
    contract.height,
    mask,
  )
}

export function useShouldOpenNextMap(): ShouldOpenNextMapResult {
  const publicClient = usePublicClient()
  const { chainId } = useAccount()
  const revealedIds = useRevealedMapIds()
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
      const effectiveChain = (chainId ?? celo.id) as ChainId
      const cacheKey = cacheKeyFor(effectiveChain, revealedIds)

      try {
        const cached = parseCache(sessionStorage.getItem(cacheKey))
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
        const maps = getMapsForChain(effectiveChain, revealedIds)
        const snapshots: MapSnapshot[] = []
        const summaries: MapFillSummary[] = []

        for (const m of maps) {
          const views = await fetchSnapshotForMap(publicClient!, m)
          const { mask } = getMaskData(m.slug)
          const pixels = pixelViewsToStates(views, m.width, mask)
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
          sessionStorage.setItem(cacheKey, JSON.stringify(cached))
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
  }, [publicClient, chainId, revealedIds])

  return state
}
