import { createPublicClient, http } from 'viem'
import { celo, celoSepolia } from 'viem/chains'

/**
 * The chain we read from for public (no-wallet) on-chain calls.
 *
 * Must match the chain that the production deployment in
 * `lib/maps/contracts.ts` lives on. Hooks call
 * `usePublicClient({ chainId: READ_CHAIN_ID })` so a read client is always
 * available — even when no wallet is connected — which keeps the map,
 * leaderboard, and analytics queries working for anonymous visitors.
 *
 * On `NEXT_PUBLIC_ENV=staging` the read client falls back to Celo Sepolia
 * to match the staging registry's testnet entry, so staging visitors who
 * land without a wallet still get a populated map.
 */
const isStaging =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ENV === 'staging'

export const READ_CHAIN = isStaging ? celoSepolia : celo
export const READ_CHAIN_ID = READ_CHAIN.id

/**
 * Module-level viem PublicClient pinned to the read chain. Used as a
 * fallback when wagmi's `usePublicClient({ chainId })` returns undefined
 * — for example when Privy's WagmiProvider hasn't initialized yet, or
 * when wagmi can't resolve the chain from connector state.
 */
export const fallbackReadClient = createPublicClient({
  chain: READ_CHAIN,
  transport: http(),
})
