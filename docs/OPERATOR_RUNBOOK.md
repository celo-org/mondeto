# Mondeto operator runbook

Mondeto runs multiple identical map contracts and **auto-advances** the active map (the one new wallets land on) when its average pixel price crosses the threshold. There is no manual reveal step in production. The `/analytics` page surfaces the same data the auto-advance reads, so you can see what's happening and override the threshold if needed.

## Tuning the auto-advance threshold

The single knob is `NEXT_PUBLIC_MAP_THRESHOLD_USD`. Default is **$2.00**, defined in `apps/web/src/hooks/useShouldOpenNextMap.ts::DEFAULT_THRESHOLD_USD`.

- **Where to set it:** Vercel → Project → Settings → Environment Variables. Add `NEXT_PUBLIC_MAP_THRESHOLD_USD=<value>`, scope to Production / Preview / `staging` branch as appropriate, then trigger a redeploy.
- **Symptoms and the fix:**
  - *Maps are advancing too fast* (the active map flips before it feels "filled") → raise to `3` or `4`.
  - *Map 0 is overcrowded and new users aren't moving on* → lower toward `1`.
  - *Staging needs to exercise the rollover quickly* → set to `0.1` on the `staging` branch scope only; the active pointer will move on the first sale or two.
- Any positive number works; non-numeric values silently fall back to $2.00.

## What the `/analytics` advisory means

`/analytics` shows an OPERATOR ADVISORY card at the bottom with one of two
states:

- **HEALTHY** (green pill): the freshest open map's average per-pixel price
  is still under the threshold. No action needed.
- **OPEN NEXT MAP** (yellow pill): the freshest open map's average per-pixel
  price has crossed the threshold (default $2.00). Time to reveal another
  map.

The card also shows:

- `freshest open map` — the map new players currently funnel into.
- `avg price` — average per-pixel price on that map, in USD.
- `threshold` — the trip point. Default $2.00.
- `reason` — the underlying comparison, for the log.

Below the card is the PER MAP table: one row per revealed map with
`% claimed` and `avg $`. Use this to sanity-check the advisory before
revealing.

## What happens when it flips to OPEN NEXT MAP

Nothing manual. The advisory is informational — the assignment hook reads the same per-map prices and moves the active pointer to the next id automatically. Use the card to confirm the new map is registering as the active one, and announce the drop.

If you ever need to add a new contract to the rotation, add a one-line entry to `PRODUCTION_MAPS` in `apps/web/src/lib/maps/contracts.ts` and merge. The active-pointer mechanism picks it up on the next deploy; no other code change required.

## Notes

- The advisory caches in session storage for 60 seconds, so a fresh tab
  triggers a fresh on-chain read; refreshes within 60s reuse the cache.
- The advisory is a hint, not a hard rule. You can reveal a map early on
  marketing cadence regardless of the advisory state.
- This is a manual flow on purpose for the launch window. Once we trust
  the signal, the automated monitoring agent in the backlog will take it
  over.

## Operations wallets

Three roles, three keys. Money flows in one direction:
`map contracts → treasury → disbursement`.

| Role | What it is | What it holds |
|---|---|---|
| **Contract owner** | The key that can call `withdraw`, `setFeeRate`, and — because the contracts are UUPS proxies — **upgrade the contract code itself**. Compromise of this key is total compromise of all maps. Currently the deployer EOA. | Nothing (it's a control key, keep its balance at gas dust) |
| **Treasury** | Recommended: a [Safe](https://app.safe.global) multisig on Celo (2-of-3). Receives all fee/first-sale sweeps from the contracts. | The accumulated revenue |
| **Disbursement** | A separate hot EOA used for campaign prizes / reward payouts. Topped up from treasury as needed. | A small working balance only — never treasury-scale funds; key held separately from treasury signers |

### Sweeping contract revenue to the treasury

`withdraw` takes an arbitrary destination, so the treasury does **not**
need to be the contract owner. From the owner key, per map contract and
per token:

```sh
# balance check (USDT example, map 0)
cast call <TOKEN_ADDRESS> "balanceOf(address)(uint256)" 0xf825914Fa66F82f603310a1a7146C0F64A382298 --rpc-url https://forno.celo.org

# sweep everything in every accepted token to the treasury in one call
cast send <MAP_CONTRACT> "withdrawAll(address)" <TREASURY_ADDRESS> \
  --rpc-url https://forno.celo.org --private-key <OWNER_KEY>
```

Suggested cadence: weekly during the launch window, or whenever a map's
token balance crosses a few hundred dollars.

### Recommended: move contract ownership to the Safe

Because the owner key can upgrade the contract, a single hot EOA as owner
is the biggest standing risk after launch. Once the treasury Safe exists,
transfer ownership of **all three** map contracts to it:

```sh
cast send 0xf825914Fa66F82f603310a1a7146C0F64A382298 "transferOwnership(address)" <SAFE_ADDRESS> --rpc-url https://forno.celo.org --private-key <OWNER_KEY>
cast send 0xB58dA361F816af8F7C996864a66cd1e12C35D0f1 "transferOwnership(address)" <SAFE_ADDRESS> --rpc-url https://forno.celo.org --private-key <OWNER_KEY>
cast send 0x198c60A8515cdA74Ae82c8D3D56d3683e2713599 "transferOwnership(address)" <SAFE_ADDRESS> --rpc-url https://forno.celo.org --private-key <OWNER_KEY>
```

After the transfer, `withdrawAll` / `setFeeRate` / upgrades are executed
as Safe transactions (propose in the Safe UI, second signer confirms).
Verify with:

```sh
cast call <MAP_CONTRACT> "owner()(address)" --rpc-url https://forno.celo.org
```

Fill in once created (roles only — no personal names in this doc):

- Treasury Safe: `<TBD>`
- Disbursement wallet: `<TBD>`

## Usage limits and alerts

Third-party free tiers we depend on, and where the warning lives:

| Service | What counts against the tier | Alert |
|---|---|---|
| PostHog (US cloud) | Events/month | Billing limit + usage alert in PostHog → Settings → Billing. Set a hard monthly cap. |
| Privy | Monthly active users — only **non-MiniPay** connects reach Privy | PostHog insight alert on weekly `wallet_connected` where `isMiniPay = false`; set threshold at ~70% of the current free-tier MAU cap (check the Privy dashboard for the current number) |
| WalletConnect / Reown | Monthly active wallets on the QR flow | Same insight as Privy — the population is a subset. Check the Reown dashboard cap when setting the threshold. |

MiniPay users bypass Privy/WalletConnect entirely (injected connector),
so those two only grow with desktop traffic.
