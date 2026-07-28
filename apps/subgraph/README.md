# Mondeto subgraph (Goldsky)

A [The Graph](https://thegraph.com)-protocol subgraph, hosted on
[Goldsky](https://goldsky.com), that indexes the eight Mondeto map contracts on
Celo mainnet. It replaces the old Envio indexer and is the durable source for:

- **earn / spend** per wallet per map (`/api/pnl`),
- the **AREA leaderboard** ordered by pixel count with a **"who reached the count
  first" tie-break** (`lastGainAt`),
- **per-map analytics** — volume, tx counts, unique buyers, treasury revenue split
  (`/api/analytics`).

The EMPIRE (connected-territory) and TYCOONS (priciest live pixel) boards stay on
the live pixel-read path — a subgraph can't see grid geometry or current epoch
prices.

## Layout

- `subgraph.yaml` — **generated** by `scripts/gen-subgraph-yaml.js` from the map
  registry (eight UUPS proxies → eight dataSources sharing one mapping). Regenerate
  with `pnpm gen-manifest`. Keep the address list in the script in sync with
  `apps/web/src/lib/maps/contracts.ts` (the source of truth).
- `schema.graphql` — the entity model (see the header there for money-unit and id
  conventions).
- `src/mapping.ts` — the AssemblyScript handlers.
- `abis/Mondeto.json` — copied from `apps/web/src/lib/contract.ts` (`MONDETO_ABI`).

## Build

```bash
pnpm install
pnpm --filter subgraph codegen   # graph codegen (writes ./generated)
pnpm --filter subgraph build     # graph build (compiles AS → wasm, type-checks)
```

## Deploy to Goldsky

Deploying needs a Goldsky account + API key. The key lives in the Goldsky CLI
config (`~/.goldsky`), **never** in this repo.

```bash
npm install -g @goldskycom/cli      # or: curl https://goldsky.com | sh
goldsky login                        # paste the API key from Goldsky project settings
pnpm --filter subgraph codegen && pnpm --filter subgraph build
cd apps/subgraph && goldsky subgraph deploy mondeto/1.0.0 --path .
```

Deploy prints the **public GraphQL query URL**, of the form:

```
https://api.goldsky.com/api/public/project_<PROJECT_ID>/subgraphs/mondeto/1.0.0/gn
```

## Wire the frontend

Put that URL in `apps/web/.env.local` (git-ignored) as:

```
NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL=https://api.goldsky.com/api/public/project_<ID>/subgraphs/mondeto/1.0.0/gn
```

`NEXT_PUBLIC_*` is inlined at build time, so on Vercel a change needs a redeploy.
The query endpoint is public/read-only — no API key goes in this file. See
`apps/web/src/lib/subgraph.ts` for the client and the `/api/pnl`, `/api/analytics`,
`/api/global-board` routes for consumers.

## Sanity-check a wallet in the Goldsky playground

```graphql
{
  ownerMapStats(where: { mapId: 0, pixelCount_gt: 0 }, orderBy: pixelCount, orderDirection: desc, first: 5) {
    address
    pixelCount
    totalSpent
    totalEarned
    lastGainAt
  }
  mapStats(id: "0") {
    volumeAllTime
    txCountAllTime
    uniqueBuyers
    primaryProceeds
    resaleVolume
    feeRateBps
  }
}
```

Numbers are 6-decimal microcents (the unit `formatUSDT` renders). Compare against
the pre-migration `/api/pnl` and `/api/analytics` output for the same map/wallet.
