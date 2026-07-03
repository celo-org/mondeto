# MiniPay mini-app build playbook

General takeaways from building a MiniPay mini-app on Celo. Opinionated defaults — adapt as needed, but each item is here because skipping it cost us time.

---

## Stack defaults

- **Next.js 14 + TypeScript + Tailwind** in a **Turborepo v2 + pnpm** monorepo. Web app lives in `apps/web/`.
- **Vercel build command**: `turbo run build --filter=web`. Filtering keeps a sibling `hardhat` package's TS errors from failing the deploy.
- **Wagmi v2 + Viem v2** for chain reads/writes. Keep a **standalone `publicClient` fallback** for read-only calls — `wagmi`'s `publicClient` is undefined during SSR/hydration, and that gap breaks the app for non-connected visitors.
- **@tanstack/react-query** is bundled with wagmi v2. Use its caching; don't roll your own polling loop unless you need flash-on-change UX.
- **RainbowKit** or **Privy/Wagmi** for the connect flow. Privy gives email/social fallback if your audience isn't 100% MiniPay.
- **PostHog** (EU cloud) for analytics, session replay, error tracking, and feature flags — one SDK covers what would otherwise be Sentry + Amplitude + LaunchDarkly. **Always reverse-proxy** through `/ingest/*` in `next.config.js`; adblockers drop ~30–40% of traffic to `*.posthog.com`.
- **@vercel/speed-insights** is essentially free and useful on mobile-first apps.
- **Vitest** + **@testing-library/react**. Keep the suite fast — it's only useful if it runs on every commit.

## MiniPay-specific gotchas

- MiniPay injects a wallet automatically. Detect it (`window.ethereum?.isMiniPay`) and skip the connect modal; show a connect button only when not in MiniPay. Never delete the connect-button / wallet-provider components even when restructuring — they're the desktop escape hatch.
- **Mobile-first, monospace fonts.** Pixel/monospace fonts take more horizontal space; design copy short.
- **Touch targets ≥ 44×44px** (Fitts's Law). Bottom-nav icons and main CTAs need real hit area.
- **Fee abstraction**: MiniPay users pay gas in cUSD/USDC/USDT, not CELO. A tx flow assuming CELO gas will break.
- **Approval flow**: USDT/USDC need an `approve` step before `transfer`/`buy`. Bundle them in one UI with clear states ("step 1/2 → step 2/2", or named phases like `FUNDS UNLOCKED → LOCKING IT IN → SEALING THE DEAL`).
- **Chain switching**: don't force a chain — default to your target chain but let users switch.
- **Refresh after writes**: RPC propagation is laggy. Double-refresh (immediate + ~2s delay) after any state-changing tx, or use `wagmi`'s `useWaitForTransactionReceipt` + invalidate queries.

## UI / UX

- **Layout constants** in one file (`constants/layout.ts`) — heights, font tokens. Saves 50 inline `style={{ height: 60 }}`s and one nightmare refactor.
- **Theme-aware borders/colors via CSS variables** (`var(--border)`). Light/dark mode is trivial; hardcoded hex is not.
- **Skip drop shadows** on mobile — use border + background contrast. Looks better and renders faster.
- **Animations under 300ms** feel responsive; longer feels laggy.
- **Real-time polling** at 30s intervals with a "flash on change" overlay makes the app feel alive at low engineering cost.

## Process / DX

- **Contract data only, no mock fallbacks in prod.** Mocks rot, mask bugs, and pollute leaderboards. Use a dev-only feature flag if you really need one.
- **One feature per PR.** Batching unrelated changes makes Vercel preview reviews useless and bisecting brutal.
- **Type-check + verify in browser** before suggesting a commit. `tsc --noEmit` is a lower bar than "actually works."
- **Push only after testing locally.** Vercel build minutes are real; broken `main` blocks everyone.
- **Document no-touch zones** (shadcn primitives, wallet-provider, RainbowKit config) so refactors don't nuke wallet infra.

## Smart contract integration patterns

- **UUPS proxy** for any contract you might iterate on — ship without a redeploy + data migration.
- **Batch reads** (e.g. `getPixelBatch`) over per-item RPCs. RPC round-trips dominate latency on mobile networks.
- **Bit-packed structs** where you can (`{owner, saleCount}` in one storage slot). Cheap reads, cheap writes.
- **Client-side state computation** from a small set of contract reads + a deploy timestamp beats fetching computed values from chain — saves RPC calls and lets you show in-progress UI.

## Launch / ops

- **Attribution Tags** (`@celo/attribution-tags`, ERC-8021 — successor to `@celo/builder-codes`) on every tx — tiny effort, gets you the attribution leaderboard.
- **Talent Protocol domain verification** meta tag — same idea.
- **Operator runbook** in the repo (env vars, thresholds, what to flip when). Future-you will thank you.
- **Staging on mainnet, separate URL.** Same contract, separate analytics project, low feature-flag thresholds for forcing edge cases. Branch protection: nothing merges directly to `main`; everything flows feature → staging → main.
