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

### Remove URL field from profile
Unverified user-entered URLs are an injection / phishing vector. Avoid taking URL inputs until we have verification.

- [ ] Remove the URL input + display path from `apps/web/src/app/profile/page.tsx`
- [ ] Stop calling `updateProfile` with a URL value; keep the contract field for future use but don't populate
- [ ] Remove URL link rendering in `LeaderboardRow`, `SelectionDrawer`, `PixelInfoPanel`

### Profanity / explicit-content filter for player names
Either custom labels via `updateProfile` or our generated nicknames. Most risk is on user-set labels.

- [ ] Add `obscenity` or `bad-words` npm package
- [ ] Validate on the profile name input before calling `updateProfile`; show a clear error
- [ ] Audit the curated `FIGURES` list in `apps/web/src/lib/username.ts` against the filter (none should match, but verify)
- [ ] Multi-language coverage — the audience is global. At minimum: English, Swahili, Portuguese, French, Indonesian, Hindi profanity lists

---

## 🟡 High priority UX

### Auto-zoom to user's location on landing
Land on the user's region so they can start picking pixels right away.

- [ ] Use the browser Geolocation API (with permission prompt) on first visit
- [ ] Map approx lat/lng → pixel (x, y) using the same Equal Earth projection the contract uses
- [ ] Smoothly zoom to that pixel on map load
- [ ] Persist permission state so we don't re-prompt every visit
- [ ] Fall back to a sensible default center (e.g. Africa) if permission denied

### Onboarding / FAQ page
- [ ] The intro screen exists (`IntroScreen.tsx`) but the body copy is too small on real devices — bump sizing
- [ ] Add an `/faq` route with the key questions: *what is a pixel · how does pricing work · what's the halving · how do fees work · how do I withdraw · how do I get my address recovered if I lose access*
- [ ] Reachable from the profile footer next to Support / Terms / Privacy

### Leaderboard layout — top-aligned + scrollable
- [ ] In `apps/web/src/app/ranks/page.tsx` switch from center-aligned to top-aligned with `overflow-y: auto`
- [ ] Confirm at 360×640 the top of the list sits right under the TopBar

### Bigger intro screen font
- [ ] Bump font sizes in `IntroScreen.tsx` for the body copy. Goal: comfortably readable on a 360-wide screen at arm's length

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
- [ ] Verify zero-click connect (`window.ethereum.isMiniPay`) actually fires on a real device
- [ ] Verify the `[ TOP UP BALANCE ]` deeplink opens the MiniPay add-cash flow correctly
- [ ] Confirm no `personal_sign` / `eth_signTypedData` prompts anywhere in real flows

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
- [ ] **Repo handover** — agreed to fold the contract repo under the Mondeto org. Plan in `docs/REPO_STRATEGY.md`.

### Owner-side
- [ ] **Check with MiniPay** on the Squid-based in-app swap timeline (drives the USDT-only-for-v1 vs go-multi-stable decision — message draft in `docs/MESSAGE_TO_MINIPAY.md`)
- [ ] **Run the tokenomics analysis** described in `docs/TOKENOMICS_BRIEF.md` (do it in a separate branch / fresh agent context). Inputs: $15k/mo marketing budget, DAU sensitivity at 10k / 100k / 1M, halving-time and fee-rate tuning. Output: a clear recommendation table.
- [ ] **Find a smart-contract dev** for the secondary app (the primary contract dev is at capacity on other work)
- [ ] **Decide on the launch campaign size** — small first ($50–500 prize pool, single country) per the `docs/SCALING_PLAN.md` recommendation

### Resolved (no action needed)
- ✅ ~~Approval cap Foundry test~~ — purely frontend, shipped
- ✅ ~~10k user load contract concern~~ — it's blockchain throughput, not server
- ✅ ~~Halving time at runtime~~ — confirmed not changeable at runtime (no timestamps stored), needs redeploy
- ✅ ~~Country / region campaigns~~ — no contract changes, pure off-chain logic, can be retroactive
- ✅ ~~Multiple maps for scale~~ — easy, one new contract per map, arbitrary shape

---

## 🔮 Strategic / longer-term

### Multi-stablecoin support (v2 contract)
DECIDED — accepting USDT + USDC + USDm. Required to unblock Europe (USDT not buyable in many EU jurisdictions) and to satisfy MiniPay §2. Full design lives in `docs/contract/SMART_CONTRACT_CHANGE_PROPOSAL.md`.

### Support agents
See `docs/SUPPORT_AGENTS_PLAN.md` + `apps/support-agents/` package. Phase 1 silent observation → phase 2 actually file GitHub/Notion → phase 3 multi-language.

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
