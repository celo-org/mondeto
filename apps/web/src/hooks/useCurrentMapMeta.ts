'use client'

import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { celo } from 'viem/chains'
import { useMaps } from '@/hooks/useMaps'
import { getMapContractById, type ChainId, type MapSlug } from '@/lib/maps/contracts'
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
  const effectiveChain = (chainId ?? celo.id) as ChainId

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
