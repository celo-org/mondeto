# Mondeto Indexer

Envio [HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview) indexer for
the Mondeto map contracts on Celo mainnet (chain id 42220). It replaces the
full-scan pattern — reading every pixel of every map from the chain on each
request — with a database that ingests contract events once and serves
leaderboard-shaped queries over GraphQL.

## What it indexes

All eight map proxies (world + seven continents) from the frontend registry in
`apps/web/src/lib/maps/contracts.ts`, configured as addresses of a single
`Mondeto` contract definition in `config.yaml`. Two events, signatures taken
from `apps/contracts/src/Mondeto.sol`:

- `PixelsPurchased(address indexed buyer, address indexed token, uint256[] ids, uint256 totalCost)`
- `ProfileUpdated(address indexed user, uint24 color, bytes label, bytes url)`

### Entities (`schema.graphql`)

| Entity | Id | Purpose |
| --- | --- | --- |
| `Pixel` | `<mapId>-<pixelId>` | Current owner, sale count, last sale info per pixel |
| `Owner` | `<address>` | Cross-map totals per wallet (pixels held, gross spend) |
| `OwnerMapStats` | `<mapId>-<address>` | Per-map leaderboard row (pixels held, gross spend) |
| `PurchaseBatch` | `<txHash>-<logIndex>` | One `PixelsPurchased` event as emitted: id array + exact batch total |
| `Purchase` | `<txHash>-<logIndex>-<arrayIndex>` | One pixel changing hands, with `previousOwner` (the raid record) |
| `OwnerProfile` | `<mapId>-<address>` | Latest on-chain profile (color, label, url) per map |

Notes on the model:

- **Per-pixel prices are intentionally approximate-free.** The contract emits
  only the batch `totalCost`; splitting it evenly across pixels would be wrong
  under epoch pricing (each pixel's cost depends on its own sale history). So
  `Purchase.pricePaid` and `Pixel.lastPricePaid` are set only for
  single-pixel batches; multi-pixel buys keep the exact figure on
  `PurchaseBatch.totalCost`.
- Money fields are in the contract's `PRICE_DECIMALS` base units, exactly as
  emitted — scale per token on the consumer side if needed.
- All addresses are lowercase (`address_format: lowercase` in `config.yaml`).
- `Owner.totalSpent` / `OwnerMapStats.totalSpent` are gross spend and never
  decrease; `pixelCount` fields track live holdings and decrease when a pixel
  is taken.

## Running locally

Requires Node 22+, Docker (for the local Postgres + Hasura stack), and an
`ENVIO_API_TOKEN` for HyperSync (free at
[envio.dev/app/api-tokens](https://envio.dev/app/api-tokens); see
`.env.example`).

```bash
pnpm install                       # from the repo root
pnpm --filter indexer codegen      # generates .envio/types.d.ts (required before type-checking)
pnpm --filter indexer dev          # codegen + docker stack + sync + Hasura at http://localhost:8080
```

**Type-checking caveat:** Envio codegen writes the ambient declarations
(`.envio/types.d.ts`, git-ignored) that type the `indexer` value, `context`,
and the entity shapes imported from `envio` — the source does not type-check
without them. The `type-check` script therefore runs `tsc --noEmit` only when
`.envio/types.d.ts` exists and no-ops otherwise, so the root
`turbo run type-check` pipeline stays green in environments that have not run
codegen (e.g. CI). To force the real check locally:

```bash
pnpm --filter indexer codegen
pnpm --filter indexer check        # tsc --noEmit, fails if codegen hasn't run
```

Handlers in `src/handlers/` are auto-registered by HyperIndex V3 (no `handler`
paths in `config.yaml`).

## How the web app consumes it

The web app should query the indexer's GraphQL endpoint via a
`NEXT_PUBLIC_INDEXER_URL` env var (set per environment in Vercel), and fall
back to the existing client snapshot / contract-read path when the var is
unset or the query fails. Example query for the per-map board:

```graphql
query MapBoard($mapId: Int!) {
  OwnerMapStats(
    where: { mapId: { _eq: $mapId } }
    order_by: { pixelCount: desc }
    limit: 100
  ) {
    address
    pixelCount
    totalSpent
  }
}
```

`/api/global-board` can aggregate `OwnerMapStats` across maps (or query
`Owner` directly for cross-map totals) instead of reading every map's full
pixel state per request. Raid history per wallet comes from `Purchase`
filtered by `previousOwner`.

## Deployment

Deploy to [Envio Cloud](https://docs.envio.dev/docs/HyperIndex/hosted-service)
(managed hosting with a git-based workflow): connect the repo, point the
deployment at `apps/indexer`, and it serves the GraphQL endpoint that
`NEXT_PUBLIC_INDEXER_URL` points to. Self-hosting with Docker/Postgres/Hasura
is also supported if we ever need it.

## Keeping the registry in sync

The map addresses live in three places by design (the indexer is standalone —
Envio bundles it without the web app):

1. `apps/web/src/lib/maps/contracts.ts` — source of truth
2. `apps/indexer/config.yaml` — which addresses get indexed
3. `apps/indexer/src/maps.ts` — address → mapId resolution in handlers

When a new map contract is deployed, update 2 and 3, then run
`pnpm --filter indexer codegen`.

## Follow-up: EMPIRE (contiguous-block) scores

The empire leaderboard needs the largest contiguous block of pixels per owner.
That is derivable from each owner's pixel set (`Pixel` filtered by `owner` +
`mapId`, connectivity from the per-map grid width), but it is not implemented
here yet. Options: compute incrementally in the `PixelsPurchased` handler
(update affected owners' components on each transfer), or run a periodic job
that recomputes scores from the `Pixel` table into a dedicated entity. Left as
a follow-up so this package can ship ownership + history first.
