'use client'

import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { celo } from 'viem/chains'
import { useMaps } from '@/hooks/useMaps'
import { getMapContractById, getMapsForChain, type ChainId, type MapSlug } from '@/lib/maps/contracts'
import { getMaskData } from '@/lib/maps/masks'

export interface MapMeta {
  slug: MapSlug
  displayName: string
  width: number
  height: number
  totalPixels: number
  landCount: number
  mask: Uint8Array
  address: `0x${string}`
}

/**
 * Resolve the grid dimensions, land mask, and contract address for the
 * map the user is currently viewing.
 *
 * Components that render or do x/y math should use this hook instead of
 * importing static WIDTH/HEIGHT from `@/constants/map`, since per-continent
 * deployments use different grid sizes (170x100 world, 127x134 africa,
 * 160x107 europe).
 */
export function useCurrentMapMeta(): MapMeta {
  const { currentMapId } = useMaps()
  const { chainId } = useAccount()
  // A connected wallet can report an arbitrary chain (e.g. a browser wallet on
  // Ethereum) that has no maps configured. Passing that straight to
  // getMapContractById makes it throw ("no revealed maps configured for
  // chain") — and because this hook renders on every route (including from the
  // root layout), that throw would take down the whole app. Fall back to the
  // default chain whenever the connected one has no maps.
  const connected = (chainId ?? celo.id) as ChainId
  const effectiveChain: ChainId =
    getMapsForChain(connected).length > 0 ? connected : (celo.id as ChainId)

  return useMemo<MapMeta>(() => {
    const contract = getMapContractById(currentMapId, effectiveChain)
    const maskData = getMaskData(contract.slug)
    return {
      slug: contract.slug,
      displayName: contract.displayName,
      width: contract.width,
      height: contract.height,
      totalPixels: contract.width * contract.height,
      landCount: maskData.landCount,
      mask: maskData.mask,
      address: contract.address,
    }
  }, [currentMapId, effectiveChain])
}
