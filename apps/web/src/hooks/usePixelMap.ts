'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import type { PixelView } from '@/lib/mock'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { getMapContractById } from '@/lib/maps/contracts'
import { getMaskData } from '@/lib/maps/masks'
import { useReadClient } from '@/hooks/useReadClient'
import type { MapId } from '@/lib/maps/types'

export type LoadState = 'loading' | 'ready' | 'error'

const POLL_INTERVAL = 30_000

/**
 * Pixel map state for a single map.
 *
 * Pass a `mapId` to read from a specific deployed contract. Omitting it
 * (the single-map launch state) keeps the existing behavior — reads route
 * to the first revealed map.
 */
export function usePixelMap(mapId?: MapId) {
  const readClient = useReadClient()
  const contract = getMapContractById(mapId ?? 0)
  const { mask } = getMaskData(contract.slug)
  const pixelDataRef = useRef<PixelView[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [version, setVersion] = useState(0)
  const [changedIds, setChangedIds] = useState<number[]>([])

  const fetchData = useCallback(async (): Promise<PixelView[]> => {
    return await fetchAllPixelsFromContract(
      readClient.readContract.bind(readClient) as Parameters<typeof fetchAllPixelsFromContract>[0],
      contract.address,
      contract.width,
      contract.height,
      mask,
    )
  }, [readClient, contract.address, contract.width, contract.height, mask])

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
