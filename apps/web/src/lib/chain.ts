import { celo } from 'viem/chains'

/**
 * The chain we read from for public (no-wallet) on-chain calls.
 *
 * Must match the chain that the deployment in `lib/maps/contracts.ts`
 * lives on. Hooks call `usePublicClient({ chainId: READ_CHAIN_ID })` so
 * a read client is always available — even when no wallet is connected
 * — which keeps the map, leaderboard, and analytics queries working
 * for anonymous visitors.
 *
 * Flip the chain here in lockstep with the contract address and the
 * `ChainGuard` target whenever we move between mainnet and a testnet
 * test build.
 */
export const READ_CHAIN = celo
export const READ_CHAIN_ID = READ_CHAIN.id
