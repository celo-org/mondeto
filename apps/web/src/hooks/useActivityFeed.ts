'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { formatUSDT, ownerDefaultColor, uint24ToHex } from '@/lib/colorUtils'
import { generateUsername } from '@/lib/username'
import type { MapId } from '@/lib/maps/types'

/**
 * Live purchase feed for the active map.
 *
 * Polls `/api/activity?mapId=` (a cached proxy over the Goldsky subgraph) and
 * turns brand-new purchase batches into a one-at-a-time toast queue.
 *
 * Design rules (from the social-proof/FOMO research — real data, never spammy):
 *  - Seed-on-mount: the first poll only records what already happened; it never
 *    floods the screen with history. Only batches that appear *after* mount are
 *    surfaced.
 *  - The viewer's own buys are skipped — they already get tx-receipt feedback.
 *  - One toast visible at a time; bursts queue and drain, capped so a backlog
 *    never piles up.
 *  - Everything resets when the map changes; the feed is per-map.
 */

const POLL_MS = 10_000
const DISPLAY_MS = 6_000
// Cap the pending queue so a burst of buys can't build an endless backlog —
// keep the freshest few and drop the rest.
const MAX_QUEUE = 8

/** One purchase batch from `/api/activity`, before display formatting. */
export interface RawBatch {
  id: string
  buyer: string
  pixelCount: number
  totalCost: string
  timestamp: string
  txHash: string
  label: string | null
  color: number
}

/** A batch turned into display-ready fields. */
export interface FeedItem {
  id: string
  name: string
  /** Hex color for the owner dot. */
  color: string
  /** Formatted USD amount, e.g. "12.34". */
  amount: string
  pixelCount: number
  buyer: string
  txHash: string
}

/**
 * Pure core: given the incoming batches and the set of ids already seen,
 * return the fresh ones to surface (oldest first) and record every incoming id
 * as seen. Mutates `seen` in place.
 *
 * On the first load nothing is returned — we only seed `seen` so history never
 * floods. The viewer's own purchases are recorded as seen but never surfaced.
 */
export function selectFreshBatches(params: {
  incoming: RawBatch[]
  seen: Set<string>
  ownAddress?: string
  isFirstLoad: boolean
}): RawBatch[] {
  const { incoming, seen, ownAddress, isFirstLoad } = params
  const own = ownAddress?.toLowerCase()
  // Play in the order the buys happened (subgraph returns newest-first).
  const chrono = [...incoming].sort((a, b) =>
    BigInt(a.timestamp) < BigInt(b.timestamp) ? -1 : 1,
  )
  const fresh: RawBatch[] = []
  for (const b of chrono) {
    const isNew = !seen.has(b.id)
    seen.add(b.id)
    if (isFirstLoad || !isNew) continue
    if (own && b.buyer.toLowerCase() === own) continue
    fresh.push(b)
  }
  return fresh
}

/** Pure: batch → display item. Reuses the same identity utils as the map. */
export function toFeedItem(b: RawBatch): FeedItem {
  const name = b.label && b.label.length > 0 ? b.label : generateUsername(b.buyer)
  const color = b.color > 0 ? uint24ToHex(b.color) : ownerDefaultColor(b.buyer)
  return {
    id: b.id,
    name,
    color,
    amount: formatUSDT(BigInt(b.totalCost)),
    pixelCount: b.pixelCount,
    buyer: b.buyer,
    txHash: b.txHash,
  }
}

export interface UseActivityFeedResult {
  current: FeedItem | null
  pause: () => void
  resume: () => void
  dismiss: () => void
}

export function useActivityFeed(mapId: MapId): UseActivityFeedResult {
  const { address } = useAccount()
  const own = address?.toLowerCase()

  const seenRef = useRef<Set<string>>(new Set())
  const firstLoadRef = useRef(true)
  const pausedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [queue, setQueue] = useState<FeedItem[]>([])
  const [current, setCurrent] = useState<FeedItem | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // Per-map reset — a fresh feed each time the viewer switches maps.
  useEffect(() => {
    seenRef.current = new Set()
    firstLoadRef.current = true
    clearTimer()
    setQueue([])
    setCurrent(null)
  }, [mapId])

  // Poll the feed and enqueue fresh batches.
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch(`/api/activity?mapId=${mapId}`)
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { batches?: RawBatch[] }
        if (cancelled || !Array.isArray(data.batches)) return
        const fresh = selectFreshBatches({
          incoming: data.batches,
          seen: seenRef.current,
          ownAddress: own,
          isFirstLoad: firstLoadRef.current,
        })
        firstLoadRef.current = false
        if (fresh.length > 0) {
          setQueue((q) => [...q, ...fresh.map(toFeedItem)].slice(-MAX_QUEUE))
        }
      } catch (err) {
        console.warn('activity feed poll failed', err)
      }
    }
    poll()
    const iv = setInterval(poll, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [mapId, own])

  // Pull the next queued item into view when nothing is showing.
  useEffect(() => {
    if (current || queue.length === 0) return
    setCurrent(queue[0])
    setQueue((q) => q.slice(1))
  }, [current, queue])

  // Auto-dismiss the visible toast (unless paused).
  useEffect(() => {
    if (!current || pausedRef.current) return
    timerRef.current = setTimeout(() => setCurrent(null), DISPLAY_MS)
    return clearTimer
  }, [current])

  const pause = useCallback(() => {
    pausedRef.current = true
    clearTimer()
  }, [])

  const resume = useCallback(() => {
    pausedRef.current = false
    if (current && !timerRef.current) {
      timerRef.current = setTimeout(() => setCurrent(null), DISPLAY_MS)
    }
  }, [current])

  const dismiss = useCallback(() => {
    clearTimer()
    setCurrent(null)
  }, [])

  return { current, pause, resume, dismiss }
}
