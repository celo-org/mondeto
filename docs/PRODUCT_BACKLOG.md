# Mondeto Product Backlog

> Living list of work to do, organized by priority. Pulled from the MiniPay
> readiness audit and a recent product review with the partner team.

## Legend

- **🔴 Blocker** — must fix before MiniPay listing review
- **🟡 High** — should ship before public launch
- **🟢 Nice-to-have** — post-launch polish

---

## 🔴 Blockers from the partner review

### ~~Cap USDT approval at $10~~ — SHIPPED
The frontend now caps every `approve()` call at `APPROVAL_CAP_USDT = 10_000_000n` ($10 USDT) or the exact purchase amount + 2% drift buffer, whichever is higher. So that if the contract is ever compromised, user funds beyond the cap remain safe.

Approval limits are enforced on the **token contract**, not on the spender contract — the cap can only live in the frontend. Logic: `apps/web/src/hooks/useBuyPixels.ts`.

### ~~Remove URL field from profile~~ — SHIPPED
URL input removed from `profile/page.tsx`; `updateProfile` no longer carries a URL value. URL rendering is gated off in `LeaderboardRow`, `PixelInfoPanel`, and the `SelectionDrawer` (the `url` field still exists on the `OwnerGroup` type but is not rendered — safe to leave or clean up later).

### ~~Profanity / explicit-content filter for player names~~ — SHIPPED
`obscenity@0.4.6` is installed; `apps/web/src/lib/profanity.ts` exposes `checkProfanity()` and gates the save button at `profile/page.tsx`. The matcher extends `obscenity`'s English dataset with curated LDNOOBW-sourced lists per language at `apps/web/src/lib/profanityLists.ts` (Swahili, Portuguese, French, Indonesian, romanized Hindi/Hinglish). Devanagari Hindi is a follow-up — the English transformers strip non-alphabetic chars before matching, so non-Latin scripts need a separate matcher.

- [ ] Native-speaker review and expansion of each language list before a wide launch
- [ ] Devanagari Hindi support (separate matcher with a transformer set that doesn't strip non-Latin chars)

---

## 🟡 High priority UX

### ~~Auto-zoom to user's location on landing~~ — SHIPPED
`page.tsx` calls `navigator.geolocation.getCurrentPosition()` on first visit, maps lat/lng → pixel via `geoToPixel()`, smooth-zooms via `canvasRef.zoomToPixel(targetId)`. Permission decision is persisted in `localStorage` (`mondeto-geo-decision`) and the per-session zoom flag in `sessionStorage` so we don't re-prompt or re-zoom.

### ~~Onboarding / FAQ page~~ — SHIPPED
`/faq/page.tsx` with the full Q&A set, reachable from the profile footer next to Terms / Privacy. `IntroScreen.tsx` body copy bumped to readable sizing for 360-wide screens.

### ~~Leaderboard layout — top-aligned + scrollable~~ — SHIPPED
`ranks/page.tsx` is `flexDirection: 'column'` + `justifyContent: 'flex-start'` + `overflowY: 'auto'`. Confirm at 360×640 is part of the `MOBILE_QA.md` walkthrough (still open as a manual QA item).

---

## 🟢 Nice-to-haves and product ideas

### Campaign banner at the bottom of the map
- [ ] Re-enable + redesign the existing `CampaignBanner` (currently hidden per recent commit)
- [ ] Pull active campaign config from a JSON file in the repo so the team can edit without a deploy
- [ ] Example campaigns: *own a continent · longest connected path · most pixels in a country · holiday campaigns*

### Heatmap polish + "my land" view
Polish for partner-team testers.

- [ ] Confirm `heatmap` view legend is readable at 360×640
- [ ] Confirm `my land` view highlights ownership clearly even with one or two pixels

### Rewards / campaigns engine
- [ ] Spec the campaigns engine: scheduled start/end, leaderboard slice (longest path / single most-expensive / etc.), prize-pool token + amount, payout mechanic
- [ ] Decide manual payout (founder transfers) vs on-chain claim
- [ ] Marketing creative per campaign

---

## 🟡 Pre-launch infrastructure

### Load testing
Need to handle ~10,000 simultaneous users.

- [ ] Coordinate with Vercel — confirm Edge / Serverless concurrency limits for the deployed app
- [ ] Confirm Forno RPC can handle the read volume (or move reads to a public RPC provider with proper SLA)
- [ ] Confirm contract throughput with the smart-contract developer — what's the max purchases-per-second the Mondeto contract sustains?
- [ ] Run a synthetic load test (e.g. k6 or Artillery) before MiniPay sends real traffic

### Country / device QA
- [ ] Send the production URL to partner-team testers in Africa, India, SE Asia
- [ ] Gather feedback: loading time on low-end Android, layout issues at common screen sizes (360×640, 393×873, 414×896), readability
- [ ] Iterate on whatever surfaces

### Onboarding flow inside MiniPay
Code is in place across the board — the remaining work is real-device verification.

- ✅ ~~Zero-click connect (`window.ethereum.isMiniPay`) wired~~ — `MiniPayAutoConnect` in `wallet-provider.tsx` + `connect-button.tsx` hides the button in MiniPay. (The injected connector was missing post-Privy-migration and was restored in commit `3dd0b23`.)
- ✅ ~~TOP UP BALANCE deeplink wired~~ — `SelectionDrawer.tsx` links to `MINIPAY_DEPOSIT_URL` (`https://link.minipay.xyz/add_cash`).
- ✅ ~~No `personal_sign` / `eth_signTypedData` anywhere~~ — grep returns zero matches.
- [ ] Real-device verification of all three on a MiniPay device (part of the `MOBILE_QA.md` walkthrough)

---

## ⏳ Outstanding owner asks (from MINIPAY_SUBMISSION.md)

- [ ] Logo PNG/SVG (1024×1024 master + 360×360 MiniPay tile)
- [ ] Legal copy review (lawyer) for `/terms` and `/privacy`
- [ ] Sample mainnet `withdraw` tx hash from the contract owner (owner-only function)
- [ ] PageSpeed Insights run on https://mondeto-web.vercel.app/
- [ ] 24h critical-fix SLA founder commitment
- [ ] Walk the 360×640 checklist in `docs/MOBILE_QA.md`

---

## 🆕 Recent follow-ups

### Asks for the smart-contract developer
- [ ] **Make `feeRate` an admin-settable function** (currently a constant; redeploy required to change). Wanted before tuning fees post-launch — tokenomics analysis may want to iterate.
- [ ] **Sample mainnet `withdraw` tx hash** for the MiniPay submission form
- [ ] **Repo handover** — agreed to fold the contract repo under the Mondeto org. Plan in `docs/archive/REPO_STRATEGY.md`.

### Owner-side
- [ ] **Check with MiniPay** on the Squid-based in-app swap timeline (drives the USDT-only-for-v1 vs go-multi-stable decision)
- [ ] **Run the tokenomics analysis** described in `docs/tokenomics/TOKENOMICS_BRIEF.md` (do it in a separate branch / fresh agent context). Inputs: $15k/mo marketing budget, DAU sensitivity at 10k / 100k / 1M, halving-time and fee-rate tuning. Output: a clear recommendation table.
- [ ] **Find a smart-contract dev** for the secondary app (the primary contract dev is at capacity on other work)
- [ ] **Decide on the launch campaign size** — small first ($50–500 prize pool, single country) per the `docs/planning/SCALING_PLAN.md` recommendation

### Resolved (no action needed)
- ✅ ~~Approval cap Foundry test~~ — purely frontend, shipped
- ✅ ~~10k user load contract concern~~ — it's blockchain throughput, not server
- ✅ ~~Halving time at runtime~~ — confirmed not changeable at runtime (no timestamps stored), needs redeploy
- ✅ ~~Country / region campaigns~~ — no contract changes, pure off-chain logic, can be retroactive
- ✅ ~~Multiple maps for scale~~ — easy, one new contract per map, arbitrary shape

---

## 🔮 Strategic / longer-term

### Multi-stablecoin support
DECIDED — purchase flow will accept USDT + USDC + USDm. Required to unblock Europe (USDT not buyable in many EU jurisdictions) and to satisfy MiniPay §2. Full contract design lives in `docs/contract/SMART_CONTRACT_CHANGE_PROPOSAL.md`.

**Display layer shipped** in commit `cedaa2b`: `useStablecoinBalance` reads USDm + USDC + USDT in parallel, picks the highest-balance one as the preferred currency, and the profile BALANCE card labels itself with the matching symbol. Home affordability check uses the $-pegged total across all three.

**Purchase flow is still USDT-only** until the v2 contract ships. The FAQ "swap inside MiniPay first" explainer covers the gap for users who only hold USDm / USDC in the interim.

### Support intake
Support runs through a Google Form (private response sheet + email notification per submission), linked from the in-app SUPPORT button via `NEXT_PUBLIC_SUPPORT_FORM_URL`. The Telegram-group + AI-agents approach was dropped (moderation burden); the old design is archived at `docs/archive/SUPPORT_AGENTS_PLAN.md`.

### Partnership pipeline
- [ ] Vietnam — World App ecosystem builder introduction in progress
- [ ] More countries via partner-team network

### Tracking SDK partnership
Delivering a tracking SDK to a partner data team for dashboard work. Not Mondeto-specific.

### Dependency upgrades (deferred to post-launch)
Renovate opened these as security PRs; both closed pre-launch because they're major version bumps with breaking changes and unresolvable lockfile conflicts against our recent dependency additions. Revisit after MiniPay submission is locked.

- [ ] **pnpm 8 → 10** (closed PR #16). Addresses CVE-2024-53866 (cross-workspace cache poisoning via overrides). Doesn't apply to our single-workspace CI install, so low actual risk. v10 changes workspace config + lockfile format — needs full repo reinstall + CI update.
- [ ] **Next.js 14 → 15** (closed PR #17). Breaking changes: caching defaults flipped from cache-by-default to opt-in, request memoization changes, async params in dynamic routes (`page.tsx` `params` becomes a Promise). Will require auditing every route + a careful prod test pass.
- [ ] **postcss 8.4.x → 8.5.10** — landed via PR #15 (low-risk patch).

When ready, **don't** rebase the closed Renovate PRs (lockfile conflicts will recur). Either let Renovate reopen them with fresh lockfiles, or do each major upgrade in a fresh branch with manual reinstall + targeted testing.

---

## 🛠️ Internal notes

### Yellow network badge (testing only)
Hidden inside MiniPay, visible only in browser dev mode. No action needed.

### Halving mechanism
The contract halves the price if a pixel goes unsold for a window. Communicated in the intro screen text. Worth highlighting in the FAQ.

### MetaMask provider conflict warning
Appears in browser console when multiple wallet extensions are installed. Benign. Not visible in MiniPay WebView.
