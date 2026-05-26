import { createPublicClient, http } from 'viem'
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

/**
 * Module-level viem PublicClient pinned to the read chain. Used as a
 * fallback when wagmi's `usePublicClient({ chainId })` returns undefined
 * — for example when Privy's WagmiProvider hasn't initialized yet, or
 * when wagmi can't resolve the chain from connector state.
 *
 * Safe to share across the app: viem PublicClients are stateless w.r.t.
 * the wallet, and using a single instance keeps the http transport's
 * batch + cache settings consistent.
 */
// Type intentionally inferred — pnpm hoists multiple copies of viem
// across the dep tree, and giving this an explicit `PublicClient` type
// would clash with the slightly-different-but-equivalent `PublicClient`
// type wagmi's own copy of viem exports at the call sites.
export const fallbackReadClient = createPublicClient({
  chain: READ_CHAIN,
  transport: http(),
})
