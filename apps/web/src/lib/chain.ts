import { createPublicClient, fallback, http } from 'viem'
import { celo, celoSepolia } from 'viem/chains'

/**
 * Optional authenticated Forno endpoint. When unset, viem falls back to
 * the public Forno RPC (and from there to the dRPC/Ankr backups below).
 *
 * The URL ends up in the client bundle because wagmi/viem transports
 * run in the browser — protect the key via a domain allowlist on the
 * provider dashboard, not by hiding the env var. In Vercel, set this
 * for Production only so preview deploys (which aren't on the allowed
 * origin) automatically use the unauthenticated public endpoint.
 */
const fornoRpcUrl = process.env.NEXT_PUBLIC_FORNO_RPC_URL

/**
 * Celo mainnet read transport with fallbacks.
 *
 * Forno (the chain's default RPC, fronted by Cloudflare) intermittently
 * times out for users on shared VPN egress IPs and on networks where
 * Cloudflare applies bot/rate-limit protection — including mainland
 * China and some Hong Kong VPN exits. viem's `fallback()` rotates to
 * the next transport when the active one fails, so a single misbehaving
 * provider doesn't take the map / leaderboard reads down.
 *
 * Order: Forno first (default, fastest when it works; uses the
 * authenticated URL when NEXT_PUBLIC_FORNO_RPC_URL is set), then dRPC
 * and Ankr public endpoints — both respond from regions where Forno's
 * Cloudflare frontend gets throttled.
 */
export const celoTransport = fallback([
  http(fornoRpcUrl),
  http('https://celo.drpc.org'),
  http('https://rpc.ankr.com/celo'),
])

export const celoSepoliaTransport = http()

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
  transport: isStaging ? celoSepoliaTransport : celoTransport,
})
