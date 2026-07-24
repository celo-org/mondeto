'use client'

import { useEffect, useState } from 'react'
import type { MapId } from '@/lib/maps/types'

// Cache TTL so navigating away + back doesn't re-fetch.
const CACHE_KEY = 'mondeto-analytics-cache'
const CACHE_TTL_MS = 60_000

export interface AnalyticsData {
  loading: boolean
  error: string | null

  // Counts of unique buyer addresses
  dailyActiveUsers: number
  weeklyActiveUsers: number
  allTimePlayers: number

  // Tx counts
  txCount24h: number
  txCount7d: number
  txCountAllTime: number

  // Volume in 6-decimal USDT raw units
  volume24h: bigint
  volume7d: bigint
  volumeAllTime: bigint

  // Treasury take = primary-sale proceeds + resale fees (6-decimal USDT units)
  feeRateBps: number
  revenueAllTime: bigint
  primaryProceedsAllTime: bigint
  resaleVolumeAllTime: bigint

  // Time window covered by the analysis
  windowStartBlock: bigint
  windowEndBlock: bigint
  fetchedAt: number
}

// Server response shape — bigints arrive as decimal strings.
interface AnalyticsResponse {
  dailyActiveUsers: number
  weeklyActiveUsers: number
  allTimePlayers: number
  txCount24h: number
  txCount7d: number
  txCountAllTime: number
  volume24h: string
  volume7d: string
  volumeAllTime: string
  feeRateBps: number
  revenueAllTime: string
  primaryProceedsAllTime: string
  resaleVolumeAllTime: string
  windowStartBlock: string
  windowEndBlock: string
  fetchedAt: number
}

const EMPTY: AnalyticsData = {
  loading: true,
  error: null,
  dailyActiveUsers: 0,
  weeklyActiveUsers: 0,
  allTimePlayers: 0,
  txCount24h: 0,
  txCount7d: 0,
  txCountAllTime: 0,
  volume24h: 0n,
  volume7d: 0n,
  volumeAllTime: 0n,
  feeRateBps: 0,
  revenueAllTime: 0n,
  primaryProceedsAllTime: 0n,
  resaleVolumeAllTime: 0n,
  windowStartBlock: 0n,
  windowEndBlock: 0n,
  fetchedAt: 0,
}

function fromResponse(r: AnalyticsResponse): AnalyticsData {
  return {
    loading: false,
    error: null,
    dailyActiveUsers: r.dailyActiveUsers,
    weeklyActiveUsers: r.weeklyActiveUsers,
    allTimePlayers: r.allTimePlayers,
    txCount24h: r.txCount24h,
    txCount7d: r.txCount7d,
    txCountAllTime: r.txCountAllTime,
    volume24h: BigInt(r.volume24h ?? '0'),
    volume7d: BigInt(r.volume7d ?? '0'),
    volumeAllTime: BigInt(r.volumeAllTime ?? '0'),
    feeRateBps: r.feeRateBps,
    revenueAllTime: BigInt(r.revenueAllTime ?? '0'),
    primaryProceedsAllTime: BigInt(r.primaryProceedsAllTime ?? '0'),
    resaleVolumeAllTime: BigInt(r.resaleVolumeAllTime ?? '0'),
    windowStartBlock: BigInt(r.windowStartBlock ?? '0'),
    windowEndBlock: BigInt(r.windowEndBlock ?? '0'),
    fetchedAt: r.fetchedAt,
  }
}

/**
 * Game analytics for a map.
 *
 * The numbers are reconstructed from the full `PixelsPurchased` log history —
 * a wide `getLogs` scan that must be chunked under the RPC's ~5k-block window
 * limit. That scan runs server-side at /api/analytics (on Vercel's network, so
 * it's reliable even in MiniPay); this hook just fetches the small JSON and
 * revives the bigint fields. A sessionStorage cache avoids re-fetching on a
 * quick navigate-away-and-back.
 */
export function useAnalytics(mapId?: MapId): AnalyticsData {
  const id = mapId ?? (0 as MapId)
  const [data, setData] = useState<AnalyticsData>(EMPTY)

  useEffect(() => {
    let cancelled = false
    const cacheKey = `${CACHE_KEY}:${id}`

    async function run() {
      try {
        const cached = sessionStorage.getItem(cacheKey)
        if (cached) {
          const parsed = JSON.parse(cached) as { ts: number; data: AnalyticsResponse }
          if (Date.now() - parsed.ts < CACHE_TTL_MS) {
            if (!cancelled) setData(fromResponse(parsed.data))
            return
          }
        }
      } catch {}

      try {
        const res = await fetch(`/api/analytics?mapId=${id}`)
        if (!res.ok) throw new Error(`analytics ${res.status}`)
        const json = (await res.json()) as AnalyticsResponse
        if (cancelled) return
        setData(fromResponse(json))
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: json }))
        } catch {}
      } catch (e) {
        if (cancelled) return
        setData((prev) => ({
          ...prev,
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to fetch analytics',
        }))
      }
    }

    setData((prev) => ({ ...prev, loading: true }))
    run()
    return () => {
      cancelled = true
    }
  }, [id])

  return data
}
