# Mondeto Tokenomics — Analytics Brief

> Self-contained brief for running tokenomics analysis in a separate branch / agent context.
> Goal: figure out the right halving period, fee rate, and initial price so that Mondeto stays
> playable and profitable at 10k / 100k / 1M DAU, with a $15k/month marketing budget as input.

---

## Read this first — the contract mechanics

**Repo**: `apps/contracts/` (subtree of the canonical Mondeto contract repo).
**Live address**: `0x7e68c4c7458895ec8ded5a44299e05d0a6d54780` on Celo mainnet.

### How pricing works

1. The map is **170 × 100 pixels** (17,000 total, but ~30% are water and not for sale).
2. Each pixel has an **initial price** (currently **0.003 USDT**).
3. Every time a pixel is bought, its price **doubles** for the next sale.
4. The price **halves continuously every 30 days** if the pixel goes unsold (continuous function, not a tick).
5. A **3% platform fee** is taken on every sale; the rest goes to the previous owner (or to the contract if the pixel was unowned).

### What's a constant vs what's tunable

| Parameter | Today | How to change |
|---|---|---|
| `initialPrice` | 0.003 USDT | Constant in code, redeploy required |
| `minPrice` | (read from `config()`) | Constant in code, redeploy required |
| `HALVING_TIME` | 30 days | Constant in code, redeploy required |
| `feeRate` | 300 bps (3%) | Constant in code today — flagged to become admin-settable; redeploy required until then |
| Width / Height | 170 × 100 | Constant per deployment. **New maps = new contract deployments** — feasible |
| Land mask | Equal Earth | Constant per deployment |

### No timestamps stored

The halving math relies on `(currentTime - deployTime) / HALVING_TIME` and `saleCount`. So:
- You can't change halving time at runtime — it would mis-price retroactively
- You **can** measure halving effectiveness from `PixelsPurchased` event timestamps (block time)

### Pricing equilibrium

If pixels are bought once every halving time, eventually they're sold once every 30 days and the price stays the same.

If pixels turn over **5× per day**, the price multiplier per day is **2⁵ = 32×**. That stacks fast — within a few days nobody can afford a pixel.

Two levers if real-world turnover ≫ design assumption:
- **Easy**: shorten halving time (e.g., 6h instead of 30d). Tradeoff: prices plummet during quiet hours, "buying a pixel" feels worthless.
- **Harder**: dynamic per-sale price decrease across all pixels (every sale cheapens all others). Kills early-adopter appeal.
- **Compromise**: a hybrid in the middle.

---

## What the analytics task should produce

Three deliverables:

### 1. Equilibrium model
Given `(initialPrice, halvingTime, feeRate, mapSize)` and assumed `(dau, salesPerPixelPerDay)`, output:
- Average pixel price after 7 / 30 / 90 days
- Distribution of pixel prices (cheap / mid / expensive buckets)
- Total daily volume
- Platform fee revenue per day
- "Affordability ceiling": at what DAU does the median pixel exceed $X (say $5)?

### 2. Marketing-budget ROI
Input: **$15k/month marketing budget**.
Assume:
- Acquisition cost per MiniPay user (research range: $0.50–$3 depending on channel)
- Activation rate (% of acquired users who actually buy a pixel): assume 5–15%
- Average pixels per active user per day: assume 1–5
- Retention curve (7d, 30d)

Output:
- Users acquired per $15k spend at each acquisition cost point
- Daily / monthly volume from acquired users
- Platform fee revenue
- **Break-even**: at what fee % do platform fees ≥ marketing spend?

### 3. Scaling and risk
At 100k DAU on day 1, the current single map (~11.9k land pixels) is **insufficient** — each pixel sells multiple times per minute, prices explode, game is unfun.

Model:
- Pixels per user at different DAU levels
- When to deploy a **second** map (region-specific or fresh world?)
- How many maps for 100k / 500k / 1M DAU
- Deployment cost per map (gas + ops)
- Discovery/UX implications of multiple maps

---

## Data sources

### On-chain (Celo mainnet)
- Contract: `0x7e68c4c7458895ec8ded5a44299e05d0a6d54780`
- Event: `PixelsPurchased(address indexed buyer, uint256[] ids, uint256 totalCost)` — has buyer, pixel ids, total in raw USDT (6 decimals)
- View functions: `config()`, `feeRate()`, `priceOf(x,y)`, `pixels(id)` (returns owner + saleCount)
- RPC: `https://forno.celo.org` (chunked queries — see `apps/web/src/hooks/useAnalytics.ts` for the working pattern)

### In-app
- `/analytics` page on the live app — DAU, WAU, tx counts, volume, fee revenue
- `docs/PRODUCT_BACKLOG.md` — current state of features

### Comparables to look at
- **Reddit r/place** — pixel-art map, no $$, but useful for engagement modeling
- **Satoshi's Place / Million Dollar Homepage** — pixel-buying historical
- **MiniPay top mini apps** — for benchmarking DAU and ARPU on emerging-market mobile wallets

### Industry numbers
- MiniPay claims 14M+ activations, 300M+ stablecoin tx, 60+ countries (snapshot)
- Typical MiniPay app DAU: TODO — research, but probably 1k–100k for popular apps

---

## Tools / skills to use in the analytics branch

In a fresh agent context, you can do this with:

- **claude-api skill** — call Claude with prompt caching for cost-efficient iteration
- **celopedia-skill** — Celo ecosystem context, contract ABIs, RPC patterns
- **A simple Python/JS notebook** in `apps/analytics/` (you may want to create this) with:
  - Data fetching from forno (use `viem` or `web3.py`)
  - Pricing simulation (Monte Carlo over user behaviour)
  - Charting (matplotlib / observable plot)
- Don't reach for the full data-science stack — single-file simulations are enough

Suggested branch: `feat/tokenomics-analysis` off `main`. Output: a single markdown report with charts (embed PNGs or SVGs) + a recommendation table.

---

## Recommendations to make

The analytics output should answer concretely:

1. **Halving time** — keep at 30 days, or change to ___?
2. **Fee rate** — keep at 3%, or change to ___? Sensitivity table at 2% / 3% / 5% / 8%.
3. **Initial price** — keep at 0.003 USDT, or change to ___?
4. **Map size** — keep 170×100, or add bigger / additional maps?
5. **When to launch second map** — at what DAU threshold?
6. **Marketing fee math** — is $15k/mo recoverable from fees alone? In how many months?

---

## What's already in repo to lean on

- `apps/web/src/hooks/useAnalytics.ts` — chunked event fetching from Celo mainnet
- `apps/web/src/app/analytics/page.tsx` — live dashboard reading these numbers
- `docs/PRODUCT_BACKLOG.md` — confirmed product direction (campaigns, country maps, halving as-is)
- `docs/planning/MULTISTABLE_ROADMAP.md` — multi-stable v2 plan (currently on hold pending MiniPay swap timeline)

---

## Outstanding inputs needed

- [ ] Acquisition cost per MiniPay user (best guess, ranges OK)
- [ ] Activation / retention assumptions (or "use sensible defaults and show sensitivity")
- [ ] Is the $15k/month marketing budget Celo-funded or self-funded?
- [ ] Target margin / breakeven horizon (does this need to pay for itself in 3 months? 12?)
- [ ] How many maps would we run before it feels confusing for users?
