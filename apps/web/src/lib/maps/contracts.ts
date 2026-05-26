/**
 * Multi-map contract registry.
 *
 * Mondeto runs N identical 170×100 map contracts. The "active map" — the one
 * new wallets get assigned to — auto-advances when the current active map's
 * average pixel price crosses NEXT_PUBLIC_MAP_THRESHOLD_USD (default $2). See
 * `useShouldOpenNextMap` for the threshold read and `activeMapId()` in
 * `assignment.ts` for the pointer logic. Existing wallets keep their sticky
 * home (persisted to localStorage); only new wallets follow the pointer.
 *
 * Per-environment split:
 *  - production (default): the live Celo mainnet contracts new users get.
 *  - staging: a separate registry that points to the Celo Sepolia testnet
 *    contract for pre-release work. ChainGuard is relaxed there to allow
 *    the wallet to stay on Sepolia.
 *
 * The `revealed: false` flag is intentionally kept even though every current
 * entry is `revealed: true`. It's the kill switch for future paid-access maps
 * and for emergency takedowns; cheap to retain.
 */

import { celo, celoSepolia } from 'viem/chains'
import type { MapId } from './types'

export type ChainId = typeof celo.id | typeof celoSepolia.id

export interface MapContract {
  id: MapId
  address: `0x${string}`
  chainId: ChainId
  /** When false, hidden from the UI even if pre-deployed. Reserved for
   *  future paid-access maps / emergency takedowns. All current entries
   *  ship with `true`. */
  revealed: boolean
}

// Production: three v2 mainnet deployments on Celo. Add new entries
// here as the SC dev deploys them — the active-pointer mechanism routes
// new wallets to the next un-filled map automatically; no other code
// change is required per add.
const PRODUCTION_MAPS: readonly MapContract[] = [
  { id: 0, address: '0xf825914Fa66F82f603310a1a7146C0F64A382298', chainId: celo.id, revealed: true },
  { id: 1, address: '0xB58dA361F816af8F7C996864a66cd1e12C35D0f1', chainId: celo.id, revealed: true },
  { id: 2, address: '0x198c60A8515cdA74Ae82c8D3D56d3683e2713599', chainId: celo.id, revealed: true },
] as const

const STAGING_MAPS: readonly MapContract[] = [
  // Celo Sepolia for testnet work.
  { id: 0, address: '0xc71e444c5339749c1c3067B62AacbfeE7840c934', chainId: celoSepolia.id, revealed: true },
] as const

function isStaging(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.env.NEXT_PUBLIC_ENV === 'staging'
  )
}

/**
 * Resolve the active registry for the current environment.
 *
 * Exported so tests can assert per-env behavior; runtime callers should use
 * the chain-aware helpers below.
 */
export function getRegistry(): readonly MapContract[] {
  return isStaging() ? STAGING_MAPS : PRODUCTION_MAPS
}

/**
 * Maps visible on the given chain, in stable id order. Pass the wallet's
 * connected chainId. Production users are forced to celo mainnet by
 * ChainGuard, so this is just `chainId === celo.id` there.
 */
export function getMapsForChain(chainId: ChainId | undefined): MapContract[] {
  const effective = chainId ?? celo.id
  return getRegistry()
    .filter((m) => m.chainId === effective && m.revealed)
    .sort((a, b) => a.id - b.id)
}

/**
 * Resolve a (mapId, chainId) pair to its deployed contract address.
 *
 * Falls back to the first revealed map for the chain if the id is unknown,
 * keeping the single-map flow working when the registry is sparse.
 */
export function getContractByMapId(
  id: MapId,
  chainId?: ChainId,
): `0x${string}` {
  const list = getMapsForChain(chainId)
  const entry = list.find((m) => m.id === id)
  if (entry) return entry.address
  if (list.length === 0) {
    throw new Error('getContractByMapId: no revealed maps configured for chain')
  }
  return list[0].address
}

/** Is this (id, chainId) one of the currently revealed maps? */
export function isRevealedMapId(id: MapId, chainId?: ChainId): boolean {
  return getMapsForChain(chainId).some((m) => m.id === id)
}

/**
 * Legacy alias for callers that haven't been chain-ified yet. Returns the
 * mainnet list (or the active env's mainnet list). Prefer `getMapsForChain`.
 */
export function getRevealedMaps(): MapContract[] {
  return getMapsForChain(celo.id)
}
