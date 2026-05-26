'use client'

import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { parseAbiItem } from 'viem'
import { MONDETO_ABI } from '@/lib/contract'
import { getContractByMapId } from '@/lib/maps/contracts'
import type { MapId } from '@/lib/maps/types'

// Celo mainnet block time is ~1s post-L2 migration. These are upper bounds —
// we filter by event timestamp anyway, so a small drift is fine.
const BLOCKS_PER_DAY = 86_400n
const BLOCKS_PER_WEEK = 604_800n
// How far back to fetch event logs. Anything older than this won't count
// toward "all-time" metrics. Bump when we have a real indexer.
const LOOKBACK_BLOCKS = 700_000n
// Forno occasionally rejects large single getLogs windows with
// "block is out of range". Chunk into batches small enough to stay within
// any provider-side limit, fired in parallel.
const CHUNK_BLOCKS = 50_000n
const MAX_PARALLEL = 4
// Cache TTL so navigating away + back doesn't re-fetch the whole history.
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

  // Platform revenue estimate: volume * feeRate / 10000
  feeRateBps: number
  revenueAllTime: bigint

  // Time window covered by the analysis
  windowStartBlock: bigint
  windowEndBlock: bigint
  fetchedAt: number
}

// Multi-token PixelsPurchased — `token` is the second indexed parameter
// as of contract v2.
const EVENT_PURCHASED = parseAbiItem(
  'event PixelsPurchased(address indexed buyer, address indexed token, uint256[] ids, uint256 totalCost)',
)

function serializeWithBigInts(data: AnalyticsData): string {
  return JSON.stringify(data, (_, v) =>
    typeof v === 'bigint' ? v.toString() + 'n' : v,
  )
}

function parseWithBigInts(str: string): AnalyticsData {
  return JSON.parse(str, (_, v) =>
    typeof v === 'string' && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v,
  ) as AnalyticsData
}

export function useAnalytics(mapId?: MapId): AnalyticsData {
  const contractAddress = getContractByMapId(mapId ?? 0)
  const publicClient = usePublicClient()
  const [data, setData] = useState<AnalyticsData>({
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
    windowStartBlock: 0n,
    windowEndBlock: 0n,
    fetchedAt: 0,
  })

  useEffect(() => {
    if (!publicClient) return

    let cancelled = false

    async function fetchAnalytics() {
      try {
        // Serve from session cache if fresh — avoids re-hammering Forno
        // when the user navigates away and back to /analytics.
        try {
          const cached = sessionStorage.getItem(CACHE_KEY)
          if (cached) {
            const parsed = JSON.parse(cached) as { ts: number; data: string }
            if (Date.now() - parsed.ts < CACHE_TTL_MS) {
              const cachedData = parseWithBigInts(parsed.data)
              if (!cancelled) setData(cachedData)
              return
            }
          }
        } catch {}

        const currentBlock = await publicClient!.getBlockNumber()
        const fromBlock =
          currentBlock > LOOKBACK_BLOCKS ? currentBlock - LOOKBACK_BLOCKS : 0n

        // Build chunk ranges. Each chunk is well under any provider limit.
        const ranges: Array<{ from: bigint; to: bigint }> = []
        for (let start = fromBlock; start <= currentBlock; start += CHUNK_BLOCKS) {
          const end =
            start + CHUNK_BLOCKS - 1n > currentBlock
              ? currentBlock
              : start + CHUNK_BLOCKS - 1n
          ranges.push({ from: start, to: end })
        }

        // Run in parallel, capped at MAX_PARALLEL to stay polite to Forno.
        const client = publicClient!
        type LogShape = Awaited<ReturnType<typeof client.getLogs<typeof EVENT_PURCHASED>>>[number]
        const logs: LogShape[] = []
        for (let i = 0; i < ranges.length; i += MAX_PARALLEL) {
          const batch = ranges.slice(i, i + MAX_PARALLEL)
          const results = await Promise.all(
            batch.map((r) =>
              publicClient!.getLogs({
                address: contractAddress,
                event: EVENT_PURCHASED,
                fromBlock: r.from,
                toBlock: r.to,
              }),
            ),
          )
          for (const chunk of results) logs.push(...chunk)
        }

        // Read the fee rate from the contract (basis points, e.g. 300 = 3%)
        let feeRateBps = 0
        try {
          const rate = (await publicClient!.readContract({
            address: contractAddress,
            abi: MONDETO_ABI,
            functionName: 'feeRate',
          })) as bigint
          feeRateBps = Number(rate)
        } catch (e) {
          console.warn('Failed to read feeRate from contract:', e)
        }

        const dayCutoff =
          currentBlock > BLOCKS_PER_DAY ? currentBlock - BLOCKS_PER_DAY : 0n
        const weekCutoff =
          currentBlock > BLOCKS_PER_WEEK ? currentBlock - BLOCKS_PER_WEEK : 0n

        // Look up each unique payment token's decimals so we can normalize
        // mixed-token totalCost values into a 6-decimal "$ microcents"
        // unit before summing. Otherwise USDm (18d) and USDC/USDT (6d)
        // would mix in nonsense magnitudes.
        const tokenDecimals = new Map<string, number>()
        const uniqueTokens = new Set<string>()
        for (const log of logs) {
          uniqueTokens.add((log.args.token as string).toLowerCase())
        }
        await Promise.all(
          [...uniqueTokens].map(async (token) => {
            try {
              const [, dec] = (await publicClient!.readContract({
                address: contractAddress,
                abi: MONDETO_ABI,
                functionName: 'tokenConfig',
                args: [token as `0x${string}`],
              })) as readonly [boolean, number]
              tokenDecimals.set(token, Number(dec))
            } catch {
              tokenDecimals.set(token, 6)
            }
          }),
        )

        const toMicrocents = (cost: bigint, decimals: number): bigint => {
          if (decimals === 6) return cost
          if (decimals > 6) return cost / 10n ** BigInt(decimals - 6)
          return cost * 10n ** BigInt(6 - decimals)
        }

        const allBuyers = new Set<string>()
        const dailyBuyers = new Set<string>()
        const weeklyBuyers = new Set<string>()

        let txCount24h = 0
        let txCount7d = 0
        let volume24h = 0n
        let volume7d = 0n
        let volumeAllTime = 0n

        for (const log of logs) {
          const buyer = (log.args.buyer as string).toLowerCase()
          const tokenAddr = (log.args.token as string).toLowerCase()
          const totalCost = log.args.totalCost as bigint
          const normalized = toMicrocents(totalCost, tokenDecimals.get(tokenAddr) ?? 6)
          const block = log.blockNumber ?? 0n

          allBuyers.add(buyer)
          volumeAllTime += normalized

          if (block >= weekCutoff) {
            weeklyBuyers.add(buyer)
            txCount7d++
            volume7d += normalized
          }
          if (block >= dayCutoff) {
            dailyBuyers.add(buyer)
            txCount24h++
            volume24h += normalized
          }
        }

        const revenueAllTime =
          feeRateBps > 0
            ? (volumeAllTime * BigInt(feeRateBps)) / 10_000n
            : 0n

        if (cancelled) return

        const fresh: AnalyticsData = {
          loading: false,
          error: null,
          dailyActiveUsers: dailyBuyers.size,
          weeklyActiveUsers: weeklyBuyers.size,
          allTimePlayers: allBuyers.size,
          txCount24h,
          txCount7d,
          txCountAllTime: logs.length,
          volume24h,
          volume7d,
          volumeAllTime,
          feeRateBps,
          revenueAllTime,
          windowStartBlock: fromBlock,
          windowEndBlock: currentBlock,
          fetchedAt: Date.now(),
        }

        setData(fresh)

        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ ts: Date.now(), data: serializeWithBigInts(fresh) }),
          )
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

    fetchAnalytics()
    return () => {
      cancelled = true
    }
  }, [publicClient, contractAddress])

  return data
}
