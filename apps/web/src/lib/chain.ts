import { celoSepolia } from 'viem/chains'

/**
 * The chain we read from for public (no-wallet) on-chain calls.
 *
 * Must match the chain that the deployment in `lib/maps/contracts.ts`
 * lives on. Hooks call `usePublicClient({ chainId: READ_CHAIN_ID })` so
 * a read client is always available — even when no wallet is connected
 * — which keeps the map, leaderboard, and analytics queries working
 * for anonymous visitors.
 *
 * Test build: pinned to Celo Sepolia to match the v2 contract deployment
 * at `0xc71e444c5339749c1c3067B62AacbfeE7840c934`. Flip this back to
 * `celo` in lockstep with the contract address and the `ChainGuard`
 * target once v2 redeploys to mainnet.
 */
export const READ_CHAIN = celoSepolia
export const READ_CHAIN_ID = READ_CHAIN.id
