'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import type { RewardEntry } from '@/lib/rewards'

/**
 * Fetches the connected wallet's campaign rewards from /api/rewards (Edge
 * Config, admin-populated). Returns an empty list when signed out, when the
 * key is unset, or on any failure — the announcement is a bonus, never a
 * blocker. Refetches when the wallet changes.
 */
export function useRewards(): { rewards: RewardEntry[]; loading: boolean } {
  const { address } = useAccount()
  const [rewards, setRewards] = useState<RewardEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) {
      setRewards([])
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/rewards?address=${address.toLowerCase()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { rewards: RewardEntry[] } | null) => {
        if (cancelled) return
        setRewards(Array.isArray(data?.rewards) ? data!.rewards : [])
      })
      .catch(() => {
        if (!cancelled) setRewards([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [address])

  return { rewards, loading }
}
