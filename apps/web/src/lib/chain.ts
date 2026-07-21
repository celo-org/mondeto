import { createPublicClient, fallback, http } from 'viem'
import { celo } from 'viem/chains'

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
 *
 * Two settings make the failover actually protect throttled-region users
 * (mainland China, parts of India, some VPN exits) instead of just eventually
 * recovering:
 *   - Per-transport `timeout` well under viem's 10s default, so a Forno
 *     request that hangs behind Cloudflare fails over to dRPC/Ankr in seconds
 *     rather than stalling every map/profile read for ~10s each.
 *   - `rank: true` — viem periodically samples each transport's latency and
 *     reorders them, so a user for whom Forno is slow/blocked is served by the
 *     fastest reachable endpoint automatically, instead of retrying Forno first
 *     on every single request.
 */
export const celoTransport = fallback(
  [
    http(fornoRpcUrl, { timeout: 6_000 }),
    http('https://celo.drpc.org', { timeout: 10_000 }),
    http('https://rpc.ankr.com/celo', { timeout: 10_000 }),
  ],
  { rank: true, retryCount: 2 },
)

export const celoSepoliaTransport = http()

/**
 * The chain we read from for public (no-wallet) on-chain calls.
 *
 * Pinned to Celo mainnet, where the continent registry in
 * `lib/maps/contracts.ts` is deployed. Hooks call
 * `usePublicClient({ chainId: READ_CHAIN_ID })` so a read client is always
 * available — even when no wallet is connected — which keeps the map,
 * leaderboard, and analytics queries working for anonymous visitors.
 */
export const READ_CHAIN = celo
export const READ_CHAIN_ID = READ_CHAIN.id

/**
 * Module-level viem PublicClient pinned to the read chain.
 */
export const fallbackReadClient = createPublicClient({
  chain: READ_CHAIN,
  transport: celoTransport,
})
