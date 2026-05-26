'use client'

import { useMemo } from 'react'
import { usePublicClient } from 'wagmi'
import { READ_CHAIN_ID, fallbackReadClient } from '@/lib/chain'

/**
 * Return a viem `PublicClient` for read-only on-chain calls that is
 * GUARANTEED to be defined.
 *
 * Wagmi's `usePublicClient({ chainId })` returns undefined when the
 * chain isn't yet resolved against connector state — which happens
 * during SSR, between Privy auth transitions, and when no wallet is
 * connected at all. Map / leaderboard / profile reads should not bail
 * in those cases, so fall back to a module-level viem client pinned
 * to the same read chain.
 *
 * Return type is intentionally inferred — pnpm hoists multiple copies
 * of viem, and wagmi's own copy exports a structurally-equivalent but
 * nominally-distinct `PublicClient` that TS can't unify with ours.
 */
export function useReadClient() {
  const wagmiClient = usePublicClient({ chainId: READ_CHAIN_ID })
  return useMemo(
    () => wagmiClient ?? fallbackReadClient,
    [wagmiClient],
  )
}
