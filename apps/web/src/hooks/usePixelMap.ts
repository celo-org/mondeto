'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { createPublicClient, http } from 'viem'
import type { PixelView } from '@/lib/mock'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { getContractByMapId } from '@/lib/maps/contracts'
import { READ_CHAIN, READ_CHAIN_ID } from '@/lib/chain'
import type { MapId } from '@/lib/maps/types'

export type LoadState = 'loading' | 'ready' | 'error'

const POLL_INTERVAL = 30_000

// Fallback client for read-only calls when wagmi isn't ready. Pinned to
// the same chain as the deployment (see `lib/chain.ts`).
const fallbackClient = createPublicClient({
  chain: READ_CHAIN,
  transport: http(),
})

/**
 * Pixel map state for a single map.
 *
 * Pass a `mapId` to read from a specific deployed contract. Omitting it
 * (the single-map launch state) keeps the existing behavior — reads route
 * to the first revealed map.
 */
export function usePixelMap(mapId?: MapId) {
  // Pin to the read chain so wagmi returns a client even when the user is
  // disconnected — the map should render for anonymous visitors.
  const wagmiClient = usePublicClient({ chainId: READ_CHAIN_ID })
  const contractAddress = getContractByMapId(mapId ?? 0)
  const pixelDataRef = useRef<PixelView[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [version, setVersion] = useState(0)
  const [changedIds, setChangedIds] = useState<number[]>([])

  const getClient = useCallback(() => {
    return wagmiClient ?? fallbackClient
  }, [wagmiClient])

  const fetchData = useCallback(async (): Promise<PixelView[]> => {
    const client = getClient()
    return await fetchAllPixelsFromContract(
      client.readContract.bind(client) as Parameters<typeof fetchAllPixelsFromContract>[0],
      contractAddress,
    )
  }, [getClient, contractAddress])

  const load = useCallback(async () => {
    try {
      setLoadState('loading')
      const data = await fetchData()
      pixelDataRef.current = data
      setLoadState('ready')
      setVersion(v => v + 1)
    } catch (e) {
      console.warn('Failed to load pixel data:', e)
      setLoadState('error')
    }
  }, [fetchData])

  // Auto-load on mount and when client changes
  useEffect(() => {
    load()
  }, [load])

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

  return { pixelDataRef, loadState, load, refresh, version, changedIds }
}
