# Mondeto tokenomics v2 — recommendation memo

**Lena · DevRel Lead, Celo Core Co · May 15, 2026**

---

## 1. Why the old $17k was wrong (your question)

The fee formula never changed:

```
monthly fees = number of sales × average price per sale × fee rate × 30
```

v1 plugged in **$50** as the average price (the "whale willingness-to-pay" from the scarce-supply discussion). That's where $17,850/mo came from.

Your natural-cap constraint makes that number impossible. A pixel starts at $0.003 and doubles every sale: sale 12 is $6.14, sale 13 is $12.29. Demand dies around $7, so a pixel realistically gets ~12 sales before everyone walks away. The **average across those 12 sales is $1.02, not $50.** Same formula, real average: roughly $1,200/mo per map at the current settings, not $17k. You were right to flag it.

## 2. The natural cap, restated so we're aligned

No contract change. The ~$7 (hard ~$10) is a planning assumption: rational buyers skip an expensive pixel and buy a cheaper one instead. If someone wants to overpay, that's on them. We just don't *count on* sales above ~$7 in the model.

The useful consequence: a pixel's life is a **cycle**. It climbs $0.003 → ~$6 over ~12 sales, generating a *fixed* $12.29 of volume per cycle (it's a geometric sum — timing doesn't matter). At 5% that's $0.61 of fees per pixel per cycle. Everything downstream is just "how many cycles happen per month."

## 3. The finding that actually matters: the halving bottleneck

Once a pixel hits ~$6, nobody buys it. The *only* thing that makes it cheap (and therefore buyable) again is the 30-day halving. Going from $6 back to ~$0.10 takes ~6 halvings — **about 178 days, roughly six months.**

So a map behaves like this: big revenue burst in the opening weeks while every pixel is fresh and cheap, then it goes largely **dormant for ~6 months** while halving slowly resets it. At the current 30-day setting, one map's *sustained* revenue is only ~$1,230/mo at 5%. Six maps cap out around $7,400/mo no matter how much demand you throw at them — that's half your marketing budget, and more maps in that regime barely move it because the bottleneck is recovery time, not capacity.

This is the single most important lever, and it's the answer to "do we rethink the pixel thing or just deploy more maps":

| Halving half-life | Sustained fees / map / month (5%) |
|---|---|
| 30 days (today) | $1,230 |
| 21 days | $1,758 |
| **14 days** | **$2,636** |
| 7 days | $5,273 |

Shortening the half-life roughly doubles per-map revenue each time you halve it, because pixels recycle faster. The brief's warning about going *too* short (6h → prices feel worthless) is real, but 14 days is nowhere near that — it just means a maxed pixel resets in ~3 months instead of ~6.

## 4. The map-count answer

Two separate requirements:

**Surviving the launch.** Day 1, 100k users × 3 attempts = 300k purchases = 25k cycles. With demand clustering on good spots (≈2.5× factor), that's ~62,500 pixels of pressure. At 11,900 land pixels per map: **6 identical maps** keeps popular pixels from blowing past the natural cap on day one. Halving is irrelevant here — every pixel is fresh on day 1.

**Sustaining $15k/mo afterward.** This is where the halving bites. Your options:

- **6 maps + shorten halving to 14 days + 5% fee** → 6 × $2,636 ≈ **$15.8k/mo**. Covers marketing, and 6 maps is exactly what the launch needs anyway. *This is the recommendation.*
- 6 maps, keep 30-day halving, raise fee to 7% → still only ~$10k/mo. Not enough on its own.
- ~12 maps, keep 30-day halving, 5% fee → ~$15k/mo, but double the deploy/ops overhead and real ghost-town risk on the extra maps.

Six maps with a 14-day halving is the clean answer: one number that satisfies both the launch spike and steady-state revenue. The pixel mechanic itself doesn't need rethinking — the halving *period* does.

One honest caveat: the demand side assumes ~5% of your 100k DAU actually buy a pixel on a given day. That's a guess. The Revenue_Grid sheet shows the full range — if real buyer share is 1–2%, no map count saves the marketing math at 5% and you'd lean on the 7% fee plus a longer payback horizon. Pull `PixelsPurchased` events from the live contract via `useAnalytics.ts` and replace the guess with the observed number before committing.

## 5. User distribution — free pick

You chose free-pick-from-a-list, which is fine, with two guardrails:

- **Show a fill/activity meter per map.** Free choice without signal produces ghost towns (everyone piles into map 1, maps 4–6 sit empty and earn nothing). A simple "78% claimed · 1.2k active today" line per map lets users self-balance toward fresh maps where pixels are cheap — which is exactly where you *want* them for revenue.
- **Gate new deployments on saturation.** Don't deploy all 6 on day 1 and hope. Launch 2, open the next when the active set crosses ~70% of pixels having been cycled. This keeps every live map feeling busy and avoids dead canvases. After the launch spike settles, this becomes your steady ~1–2 maps/month cadence to offset dormancy.

## 6. Fee: 5% now, 7% as a lever

5% is comfortable and emerging-market-friendly; 7% is the upper bound before users (your Nigeria base especially, with smaller balances) start noticing. The highest-value action isn't picking the perfect rate — it's making `feeRate` admin-settable (already flagged in your brief). If it's tunable without a redeploy, you launch at 5%, watch real data, and move to 7% in a single transaction across all maps instead of redeploying each one. Prioritize that contract change over getting the launch number exactly right.

## 7. Hub-and-spokes, one more time (since you asked) — and why it's parked

Hub = one big flagship map everyone lands on. Spokes = smaller satellite maps for specific groups (a Nigeria map, a Vietnam map), usually gated so they don't overcrowd. The hub is the prestige object; spokes soak up regional demand.

It's parked because it needs (a) different map sizes and (b) gated access — and you've told me Self Protocol doesn't work for your Nigeria-heavy base and country maps are a later phase. When you do get there, the natural successor is: keep these identical world maps as the open layer, and *later* add gated regional maps on top once you have a gating method that works in West Africa (phone-number attestation, invite codes from country leads, or proof-of-attendance from your activation events — not Self, for now). That's a v3 conversation, not this one.

---

### The one-line version

Launch 6 identical maps, shorten the halving from 30 → 14 days, fee at 5% with `feeRate` made admin-settable so 7% is one transaction away. That covers the 100k launch spike and the $15k/mo marketing budget simultaneously. The pixel doubling mechanic is fine as-is; the halving *period* was the thing that needed rethinking.
