/**
 * Multi-map contract registry.
 *
 * The FE points at the world + seven-continent contracts on Celo mainnet.
 * There's a single registry (no production/staging env split) — staging was
 * retired; testnet work happens on feature-branch preview deploys.
 *
 * Mondeto runs N map contracts. The "active map" — the one new wallets
 * get assigned to — auto-advances when the current active map's average
 * pixel price crosses NEXT_PUBLIC_MAP_THRESHOLD_USD (default $2). See
 * `useShouldOpenNextMap` for the threshold read and `activeMapId()` in
 * `assignment.ts` for the pointer logic. Existing wallets keep their
 * sticky home (persisted to localStorage); only new wallets follow the
 * pointer.
 *
 * Which maps are visible is gradual and marketing-driven: the launch shows
 * only WORLD, and continents open over time. The hardcoded `revealed` flag
 * is the baseline (WORLD only). It can be overridden at deploy time by the
 * NEXT_PUBLIC_REVEALED_MAP_IDS env var (comma-separated ids, e.g. "0,1,2"
 * reveals World + Africa + Asia) so a continent can be opened by changing one
 * Vercel setting and redeploying — no code change. A future admin board will
 * manage this; the env var is the bridge until then.
 */

import { celo, celoSepolia } from 'viem/chains'
import type { MapId } from './types'

export type ChainId = typeof celo.id | typeof celoSepolia.id

export type MapSlug =
  | 'world'
  | 'africa'
  | 'europe'
  | 'asia'
  | 'north-america'
  | 'south-america'
  | 'oceania'
  | 'antarctica'

export interface MapContract {
  id: MapId
  /** Identifier the FE uses to look up the bundled land mask. */
  slug: MapSlug
  /** Uppercase pixel-style label shown in the UI. */
  displayName: string
  address: `0x${string}`
  chainId: ChainId
  /** Grid width in pixels. Per-map; continents differ from 170. */
  width: number
  /** Grid height in pixels. Per-map; continents differ from 100. */
  height: number
  /** When false, hidden from the UI even if pre-deployed. */
  revealed: boolean
}

// Full continent lineup deployed by the SC dev on Celo mainnet: world + the
// seven continents. Grid dimensions baked at deploy time match the mask JSON
// in apps/contracts/map/ (and the generated masks in src/data/masks/).
const MAPS: readonly MapContract[] = [
  {
    id: 0,
    slug: 'world',
    displayName: 'WORLD',
    address: '0x44bA167119355C8397C855756C2581B0771393D7',
    chainId: celo.id,
    width: 170,
    height: 100,
    revealed: true,
  },
  {
    id: 1,
    slug: 'africa',
    displayName: 'AFRICA',
    address: '0x67F48829b8CaA06C89Ea010521548CF67E4F5c09',
    chainId: celo.id,
    width: 127,
    height: 134,
    revealed: false,
  },
  {
    id: 2,
    slug: 'asia',
    displayName: 'ASIA',
    address: '0xc489709234A9a847C56a6248E6A7e51d5AC4f78F',
    chainId: celo.id,
    width: 158,
    height: 107,
    revealed: false,
  },
  {
    id: 3,
    slug: 'europe',
    displayName: 'EUROPE',
    address: '0x6d52AA5552f9768d065B3B3ff24a759a2156C1E9',
    chainId: celo.id,
    width: 160,
    height: 107,
    revealed: false,
  },
  {
    id: 4,
    slug: 'north-america',
    displayName: 'NORTH AMERICA',
    address: '0x7eDC67EA2925510512242A8e0985B4db1D001163',
    chainId: celo.id,
    width: 159,
    height: 107,
    revealed: false,
  },
  {
    id: 5,
    slug: 'south-america',
    displayName: 'SOUTH AMERICA',
    address: '0xF63DC592Ddb98D41012CEBDcc0F5e2e1b56784A2',
    chainId: celo.id,
    width: 115,
    height: 147,
    revealed: false,
  },
  {
    id: 6,
    slug: 'oceania',
    displayName: 'OCEANIA',
    address: '0x912b49a6aFFf9403D8F4fBDacC33aE4e98c5441D',
    chainId: celo.id,
    width: 158,
    height: 107,
    revealed: false,
  },
  {
    id: 7,
    slug: 'antarctica',
    displayName: 'ANTARCTICA',
    address: '0x17235471D4c8c1620dA1a3511ac76e5Ef137f5E2',
    chainId: celo.id,
    width: 145,
    height: 117,
    revealed: false,
  },
] as const

/**
 * Resolve the active registry. Exported so tests can introspect it;
 * runtime callers should use the chain-aware helpers below.
 */
export function getRegistry(): readonly MapContract[] {
  return MAPS
}

/**
 * Optional deploy-time override for which map ids are revealed. When
 * NEXT_PUBLIC_REVEALED_MAP_IDS is set (e.g. "0,1"), it is the source of
 * truth and the per-map `revealed` flags are ignored; when unset, the
 * hardcoded flags apply (WORLD only). Returns null when unset/empty.
 */
function revealedIdOverride(): Set<number> | null {
  const raw =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_REVEALED_MAP_IDS
      : undefined
  if (!raw || raw.trim() === '') return null
  const ids = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0)
  return new Set(ids)
}

/**
 * Maps visible on the given chain, in stable id order. Pass the wallet's
 * connected chainId.
 *
 * Reveal precedence: an explicit `revealedIds` (runtime, from the
 * `/api/reveals` → Edge Config source) wins; else the
 * NEXT_PUBLIC_REVEALED_MAP_IDS env override; else the static `revealed`
 * flags (WORLD only). Callers inside React should pass the ids from
 * `useRevealedMapIds()`; non-React/sync callers may omit it and get the
 * env/static fallback.
 */
export function getMapsForChain(
  chainId: ChainId | undefined,
  revealedIds?: number[],
): MapContract[] {
  const effective = chainId ?? celo.id
  const override = revealedIds ? new Set(revealedIds) : revealedIdOverride()
  return getRegistry()
    .filter((m) => m.chainId === effective)
    .filter((m) => (override ? override.has(m.id) : m.revealed))
    .sort((a, b) => a.id - b.id)
}

/**
 * Resolve a (mapId, chainId) pair to its deployed contract address.
 *
 * Falls back to the first revealed map for the chain if the id is
 * unknown, keeping the single-map flow working when the registry is
 * sparse.
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

/**
 * Resolve a (mapId, chainId) pair to its full contract record (address +
 * dimensions + slug). Used by per-map dimension lookups.
 *
 * Falls back to the first revealed map for the chain when the id is unknown.
 */
export function getMapContractById(
  id: MapId,
  chainId?: ChainId,
): MapContract {
  const list = getMapsForChain(chainId)
  const entry = list.find((m) => m.id === id)
  if (entry) return entry
  if (list.length === 0) {
    throw new Error('getMapContractById: no revealed maps configured for chain')
  }
  return list[0]
}

/** Is this (id, chainId) one of the currently revealed maps? */
export function isRevealedMapId(id: MapId, chainId?: ChainId): boolean {
  return getMapsForChain(chainId).some((m) => m.id === id)
}

/**
 * Legacy alias for callers that haven't been chain-ified yet. Returns
 * the default chain's list (Celo mainnet).
 */
export function getRevealedMaps(): MapContract[] {
  return getMapsForChain(celo.id)
}
