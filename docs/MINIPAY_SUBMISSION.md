# MiniPay Submission Tracking — Mondeto

> Form: https://forms.gle/3MNtw2GNRHp29j51A
> Requirements doc: https://docs.minipay.xyz/ + Celopedia `minipay-requirements.md`

## Production URL
- Production: <https://www.mondeto.app/> (Vercel-hosted; apex `https://mondeto.app` redirects to `www`)
- Staging: `https://<TODO-staging-url>`
- Real-user perf: Vercel Speed Insights enabled (LCP / FID / CLS / INP / TTFB / FCP from real traffic) — dashboard in Vercel project → Speed Insights tab

## Contracts

Mondeto runs multiple identical map contracts on Celo mainnet (chain ID 42220). New wallets are auto-assigned to the current "active" map; existing wallets keep their sticky home. The full registry lives in [`apps/web/src/lib/maps/contracts.ts`](../apps/web/src/lib/maps/contracts.ts).

- **Map 0 (UUPS)**: `0xf825914Fa66F82f603310a1a7146C0F64A382298` — https://celoscan.io/address/0xf825914Fa66F82f603310a1a7146C0F64A382298#code
- **Map 1 (UUPS)**: `0xB58dA361F816af8F7C996864a66cd1e12C35D0f1` — https://celoscan.io/address/0xB58dA361F816af8F7C996864a66cd1e12C35D0f1#code
- **Map 2 (UUPS)**: `0x198c60A8515cdA74Ae82c8D3D56d3683e2713599` — https://celoscan.io/address/0x198c60A8515cdA74Ae82c8D3D56d3683e2713599#code
- **Payment tokens** (any of, 1:1 — buy settles in the user's highest-balance stablecoin):
  - USDm — `0x765DE816845861e75A25fCA122bb6898B8B1282a`
  - USDC — `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`
  - USDT — `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`

## Sample transactions (mainnet)

For the "Transaction Samples" submission field. Per MiniPay: *"for every user-facing method your app uses, provide a sample transaction link on Celoscan."* `withdraw` is owner-only and not user-facing, so it's **not required** — included anyway for completeness.

| Method | User-facing? | Tx Hash |
|--------|---|---------|
| `approve` (stablecoin → Mondeto) | yes | https://celoscan.io/tx/0xc47b7f8db12b33482b5de0129fc1da66f7b6cb45e56d1d16954ba7e0532bf4d5 |
| `buyPixels` (USDm) | yes | https://celoscan.io/tx/0x66ffcf9598cba7b9489f6841ada7e7f0a7e0c0305dac22ba49b2984730d25137 |
| `buyPixels` (USDT) | yes | https://celoscan.io/tx/0x07d88d1a9e0c6ae733164ec631f7084b3a2716ec273b3fcda3d8aa5524250c38 |
| `buyPixels` (USDC) | yes | https://celoscan.io/tx/0x584dcc8749ca4ee3d161cb7d3c67a5039ca8f0f1311a8e9c72ba26aa38f6de7d |
| `updateProfile` | yes | https://celoscan.io/tx/0x7cd75679e098ba38547b7eef15074f48c4ca989779c9a2beba4293dfd3c74d7c |
| `withdraw` | no (owner-only) | https://celoscan.io/tx/0xc5174892db368404997ad1b58093d6f68dbccd9a975f4ffd674ca8dbc8897f40 |

## JavaScript-serving origins

For the submission field: *"Provide your app's domains and subdomains which will contain your JavaScript code."*

Only domains the browser actually downloads `.js` files from. Endpoints that return JSON / fonts / beacons don't belong here — they go in the URL/origin manifest below.

- `https://www.mondeto.app`
- `https://mondeto.app` (apex; redirects to `www` but the browser may briefly see it as an origin)

All bundles ship from same-origin `/_next/static/chunks/*`. Every npm dependency (wagmi, viem, Privy, posthog-js, WalletConnect, Vercel Speed Insights, etc.) is compiled into those chunks. PostHog's static assets are reverse-proxied through `/ingest/static/*` (configured in `apps/web/next.config.js`), so even those reach the browser from our own origin.

How to verify before submitting: Chrome incognito → DevTools → Network → filter `JS` → hard reload `https://www.mondeto.app/` → exercise connect-wallet, ranks, profile, buy. The unique hostnames in that filtered list should match the above.

## URL / origin manifest

For the "Network Transparency" submission field — every external server the
app contacts on a cold load. MiniPay reviewers use this for supply-chain
risk assessment. How to gather: open the prod URL in Chrome → DevTools →
Network → "Disable cache" → hard reload → group by Domain.

Current expected manifest (verify against the actual network trace before
submitting):

- App: <https://www.mondeto.app/> (apex `https://mondeto.app/` 308s to `www`)
- RPC: `https://forno.celo.org` (Celo mainnet)
- Wallet (web only — NOT loaded inside MiniPay): `https://auth.privy.io/`, `https://api.privy.io/`, `https://*.walletconnect.com/`
- Fonts: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`
- Real-user perf: `https://vitals.vercel-insights.com` (Vercel Speed Insights beacon)
- Analytics (reverse-proxied through `/ingest/*` so the browser stays same-origin): `https://eu.i.posthog.com`, `https://eu-assets.i.posthog.com`
- TODO: run the prod build with the network inspector and capture every domain hit on cold load + buy flow.

## Pre-submission checklist (from `minipay-requirements.md`)

- [x] Zero-click connect (Connect Wallet button hidden when `window.ethereum.isMiniPay`)
- [x] No `personal_sign` / `eth_signTypedData` anywhere
- [x] No raw `0x…` shown as primary identifier — deterministic `{fruit}-{figure}` nicknames generated when no on-chain label set; truncated address only as a secondary hint
- [x] Only USDT / USDC / USDm — no CELO in balances or copy
- [x] Picks user's highest-balance stablecoin OR explains single-token UX — explainer shipped; multi-token deferred to v2 pending MiniPay's in-app swap
- [x] UI copy uses Network fee / Top up / Withdraw / Stablecoin (no banned terms)
- [x] $10 USDT approval cap on every `approve()` call (security)
- [x] Profanity filter on user-entered names (obscenity package)
- [x] Custom on-theme 404 with a way back home (no dead ends in the WebView)
- [x] All contracts verified on Celoscan
- [x] Sample tx hashes for every user-facing method (`approve`, `buyPixels` × USDm/USDT/USDC, `updateProfile`; `withdraw` owner-only sample included for completeness)
- [x] Redirects to Top up (MiniPay deposit deeplink) on insufficient balance
- [x] In-app support link (Google Form via `NEXT_PUBLIC_SUPPORT_FORM_URL`; the submission originally listed t.me/mondetoSupport, which stays as the code fallback until the form URL is set)
- [x] ToS + Privacy linked in-app
- [x] FAQ page linked in-app
- [ ] Tested at 360 × 640 — walk the `docs/MOBILE_QA.md` checklist on a real device
- [ ] Images SVG/WebP — `public/screenshots/*.jpeg` are marketing assets, not loaded in-app; verify nothing else is. WebP optimization not needed for app perf
- [ ] PageSpeed Insights score (mobile, target 90+) — needs production run + screenshot
- [ ] URL / origin manifest — needs a network-tab capture on cold load
- [ ] 24h SLA commitment — needs founder ack
- [ ] App name + logo visible — name done, logo TODO

## Outstanding owner asks

- [ ] Logo PNG/SVG (1024×1024 master + 360×360 for MiniPay tile)
- [ ] Legal copy review (lawyer) for `/terms` and `/privacy` — current drafts are placeholders
- [ ] PageSpeed Insights run on <https://mondeto.app/> + capture mobile screenshot
- [ ] 24h critical-fix SLA commitment
- [ ] Walk `docs/MOBILE_QA.md` 360×640 checklist on a real device
- [ ] Capture URL / origin manifest from a cold load network trace

## Sign-offs

- [ ] Founder
- [ ] Legal review
- [ ] Submitted to MiniPay
