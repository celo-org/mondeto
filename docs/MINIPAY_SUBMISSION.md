# MiniPay Submission Tracking — Mondeto

> Form: https://forms.gle/3MNtw2GNRHp29j51A
> Requirements doc: https://docs.minipay.xyz/ + Celopedia `minipay-requirements.md`

## Production URL
- Production: <https://mondeto-web.vercel.app/>
- Staging: `https://<TODO-staging-url>`
- Real-user perf: Vercel Speed Insights enabled (LCP / FID / CLS / INP / TTFB / FCP from real traffic) — dashboard in Vercel project → Speed Insights tab

## Contract

- **Mondeto proxy (UUPS)**: `0x7e68c4c7458895ec8ded5a44299e05d0a6d54780`
- **Network**: Celo mainnet (chain ID 42220)
- **Verification**: https://celoscan.io/address/0x7e68c4c7458895ec8ded5a44299e05d0a6d54780#code
- **Payment token**: USDT (`0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`)

## Sample transactions (mainnet)

For the "Transaction Samples" submission field. Per MiniPay: *"for every user-facing method your app uses, provide a sample transaction link on Celoscan."* `withdraw` is owner-only and not user-facing, so it's **not required** — included anyway for completeness.

| Method | User-facing? | Tx Hash |
|--------|---|---------|
| `approve` (USDT → Mondeto) | yes | https://celoscan.io/tx/0xc47b7f8db12b33482b5de0129fc1da66f7b6cb45e56d1d16954ba7e0532bf4d5 |
| `buyPixels` | yes | https://celoscan.io/tx/0xbf65cbfbc2635e80087654688a8a3c5d4da763502a548e6cdf55d9df833cba96 |
| `updateProfile` | yes | https://celoscan.io/tx/0x7084222577f1b681612f047d4a4a4384738b9d0bff92a787b69cd6c0dd2836b2 |
| `withdraw` | no (owner-only) | https://celoscan.io/tx/0xc5174892db368404997ad1b58093d6f68dbccd9a975f4ffd674ca8dbc8897f40 |

## URL / origin manifest

For the "Network Transparency" submission field — every external server the
app contacts on a cold load. MiniPay reviewers use this for supply-chain
risk assessment. How to gather: open the prod URL in Chrome → DevTools →
Network → "Disable cache" → hard reload → group by Domain.

Current expected manifest (verify against the actual network trace before
submitting):

- App: <https://mondeto-web.vercel.app/>
- RPC: `https://forno.celo.org` (Celo mainnet)
- Wallet (web only — NOT loaded inside MiniPay): `https://auth.privy.io/`, `https://api.privy.io/`, `https://*.walletconnect.com/`
- Fonts: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`
- Real-user perf: `https://vitals.vercel-insights.com` (Vercel Speed Insights beacon)
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
- [x] Sample tx hashes for every user-facing method (3 of 3; `withdraw` owner-only sample included for completeness)
- [x] Redirects to Top up (MiniPay deposit deeplink) on insufficient balance
- [x] In-app support link (t.me/mondetoSupport)
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
- [ ] PageSpeed Insights run on <https://mondeto-web.vercel.app/> + capture mobile screenshot
- [ ] 24h critical-fix SLA commitment
- [ ] Walk `docs/MOBILE_QA.md` 360×640 checklist on a real device
- [ ] Capture URL / origin manifest from a cold load network trace

## Sign-offs

- [ ] Founder
- [ ] Legal review
- [ ] Submitted to MiniPay
