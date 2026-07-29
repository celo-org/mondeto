# Mondeto

A 170x100 pixel world map on Celo where every land pixel is ownable on-chain. Pixels are colored by owner, creating a territorial mosaic. Accepts a set of dollar stablecoins (1:1) as currency, targets MiniPay.

## Build & Test

```sh
forge build
forge test
forge test --gas-report   # check buyPixels gas scaling
```

Generate land mask from the world map image (requires Pillow):
```sh
uv run --with Pillow python3 map/generate_land_mask.py
```

Regenerate `world_map_bw.png` from the source SVG (requires cairosvg + Pillow):
```sh
cd map && uv run convert_map.py
```

Regenerate per-continent maps and masks (writes to `map/continents/<name>.{png,json}`):
```sh
uv run map/generate_continents.py
```

## Architecture

**Proxy pattern**: UUPS (OpenZeppelin). The proxy address is the one users interact with. The implementation contract has `_disableInitializers()` in its constructor — never call `initialize()` on the implementation directly.

**State lives in the proxy**, not the implementation. When upgrading:
- Deploy new implementation
- Call `upgradeToAndCall(newImpl, "")` from the owner account
- New implementation must inherit from `Mondeto` and not change existing storage layout (only append new state variables)

## Price Formula — The Most Subtle Part

```
discretePrice = initialPrice << (saleCount - epoch)    when saleCount >= epoch
discretePrice = initialPrice >> (epoch - saleCount)    when saleCount < epoch, floored at minPrice
```

The actual price linearly interpolates between adjacent discrete price levels within each epoch, so decay is gradual rather than a hard step every `HALVING_TIME`. At epoch boundaries the interpolated price equals the discrete price.

**Why relative epoch matters**: `epoch = (block.timestamp - halvingStartTimestamp) / HALVING_TIME`. If you used absolute `block.timestamp / HALVING_TIME`, epoch would be ~108+ at deploy time, making all pixels nearly free immediately. The relative epoch starts at 0 once the halving clock starts and increments every `HALVING_TIME` thereafter.

**The halving clock only starts on the first buy**: `halvingStartTimestamp` is `0` after deployment and is stamped to `block.timestamp` on the first non-empty `buyPixels` call. While it is `0`, `elapsed` is treated as `0` and every land pixel costs exactly `initialPrice` regardless of wall-clock time. This prevents the map from silently halving down before any traction — `initialPrice` holds until somebody actually buys in.

**What this means economically**: Each sale doubles the price. Over each `HALVING_TIME` (currently 30 days on every deployed map — `config().halvingTime` = 2592000s) without a sale, the price gradually halves. A pixel bought once (saleCount=1) returns to `initialPrice` after one epoch, then keeps decaying. This creates a natural "use it or lose it" pressure — land you buy will decay in value toward `minPrice` if nobody re-buys it. Before the first purchase the clock doesn't run, so the map sits at `initialPrice` indefinitely until someone buys in.

**`initialPrice` is fixed at deployment**: Set once in `initialize()` and never changeable afterward — there is deliberately no setter. Since `initialPrice` is the base of every pixel's price, a setter would retroactively reprice the entire map out from under existing owners. To change pricing, deploy a fresh contract.

**saleCount is uint8**: Saturates at 255. This is fine economically — at saleCount 128 with epoch 0, the price would be `initialPrice * 2^128`, an astronomically large number that nobody would pay.

## Payment Flow

- Buying an **unowned** pixel: payment goes to the **contract itself** (treasury). Owner withdraws via `withdraw()`/`withdrawAll()`.
- Buying an **owned** pixel: a fee (`feeRate`, in basis points) is deducted to the treasury and the **remainder goes to the previous owner**. `feeRate` is set in `initialize()`, changeable by the owner via `setFeeRate()`, and capped at `MAX_FEE_RATE` = 2000 (20%), so the previous owner always keeps at least 80%. (See M-01.)
- **Blocked seller payments**: seller payouts use `SafeERC20.trySafeTransferFrom` (non-reverting). If the payment token blocks a transfer to a previous owner (e.g. a stablecoin blacklist), that seller's share is **retained by the contract** and a `SellerPaymentRedirected` event is emitted, rather than reverting the whole batch. The blocked address could not withdraw anyway, and the buyer's total cost is unchanged. The treasury (unowned proceeds + fees + any redirected funds) is paid last in one transfer, still reverting if the *buyer* cannot pay. (See Q-01.)
- **Self-buy** is allowed (saleCount increments; buyer pays only the fee, which lands in the treasury — the post-fee remainder is a net-zero self transfer).
- **Bulk buys** aggregate payments per unique recipient before executing transfers. This means buying 50 pixels from the same owner does 1 transfer, not 50. The aggregation uses O(n²) linear scan — fine for expected batch sizes (<100), would be expensive for thousands.

## Land Mask

Not all pixels are buyable. Water pixels (oceans) are excluded.

- `map/Blank_world_map_Equal_Earth_projection.svg` is the upstream source (Wikipedia Equal Earth projection).
- `map/convert_map.py` renders the SVG to `map/world_map_bw.png` (grayscale threshold, crop empty columns). Countries are gray #c0c0c0 in the SVG; the script thresholds at brightness > 240 to separate land from ocean.
- `map/world_map_bw.png` is the working source of truth. Black = land, white = water.
- `map/generate_land_mask.py` reads the PNG dimensions and converts to `uint256` words (170×100 = 17,000 bits → 67 words). Threshold: brightness < 128.
- Bit packing: pixel ID `n` is bit `n % 256` of word `n / 256`.
- The land mask is passed to `initialize()` at deploy time and is immutable after that.
- Currently 5,622 land pixels out of 17,000.

### Per-continent maps

Geographic continent maps come from Natural Earth's `ne_10m_admin_0_map_subunits` dataset, cached at `map/data/ne_10m_admin_0_map_subunits.geojson`. Each subunit has a `CONTINENT` field, and transcontinental countries are pre-split — Russia appears as two subunits (`CONTINENT=Europe` west of the Urals, `CONTINENT=Asia` east of them).

`map/generate_continents.py` groups subunits by `CONTINENT`, projects them, scales the bbox to ~17,000 pixels, and rasterizes filled polygons (with holes punched white) using PIL. Output goes to `map/continents/<name>.{png,json}`.

Projections:
- Antarctica: azimuthal equidistant from the south pole.
- Others: equirectangular with `cos(latitude)` aspect correction at the continent's mid-latitude. Each continent has a `CENTER_LON` value used to recenter longitudes before projection — this avoids antimeridian wrapping for Asia (Chukotka), Oceania (Fiji/Kiribati), and North America (Aleutians).

`map/continents.py` (the ISO 3166-1 alpha-3 country list) is kept for future country-list/country-map rendering via `convert_map.py --continent`; it is not used by the geographic continent generator.

Continent names: `africa`, `asia`, `europe`, `north-america`, `oceania`, `south-america`, `antarctica`.

## Profile System

Each address has one profile (color, label, url). Set via `updateProfile()`, which always overwrites. `buyPixels()` does not touch profiles.

Label and URL are capped at 64 bytes each (not characters — matters for multibyte UTF-8).

## Deployment

See the **Deployment** section of `README.md` for the full step-by-step (env template,
required vars, signer). In short: `Deploy.s.sol` is configured by env vars (`ACCEPTED_TOKENS`,
`INITIAL_PRICE`, `MIN_PRICE`, `HALVING_TIME_DAYS`, `INITIAL_FEE_RATE`, `ETH_RPC_URL`) plus
the land mask JSON file (which supplies `WIDTH`/`HEIGHT`). The mask path comes from the
optional `LAND_MASK_PATH` env var (default `map/land_mask.json`); set it to e.g.
`map/continents/africa.json` to deploy a single-continent map. `deploy.env.example`
is the committed template; real `*.env` files are gitignored.

`ACCEPTED_TOKENS` is a comma-separated list of dollar stablecoins, all treated 1:1.
`initialize()` reads each token's `decimals()` on-chain and scales transfers from the
6-decimal price base, so mixed-decimal coins (e.g. 6-decimal USDT and 18-decimal cUSD) work.

## Upgrade Checklist

1. New contract must inherit from `Mondeto` (or replicate its storage layout exactly)
2. **Never reorder or remove existing state variables** — only append new ones after the current last state var (`acceptedTokens`)
3. `WIDTH`, `HEIGHT`, `TOTAL_PIXELS`, `LAND_MASK_LENGTH` are immutable (baked into implementation bytecode) — new implementation must be deployed with the same constructor args
4. `halvingStartTimestamp` (and the rest of the token/pixel/profile state) is regular storage (not `immutable`) because of the proxy pattern
5. Test the upgrade in a fork before mainnet: deploy V2, call `upgradeToAndCall`, verify old state survives

## OpenZeppelin v5 Compatibility Note

OZ v5 removed dedicated "Upgradeable" versions of stateless contracts. `ReentrancyGuard` and `UUPSUpgradeable` use namespaced storage (`@custom:stateless`), making them proxy-safe without separate upgradeable variants. Only `OwnableUpgradeable` (which has actual storage) comes from the upgradeable package. If you see imports from `@openzeppelin/contracts/` (not `contracts-upgradeable/`) for these, that's intentional.

## Target Chain

Celo mainnet. USDT on Celo is a standard ERC-20 with 6 decimals. All price values in the contract are in USDT's smallest unit (1 = 0.000001 USDT).
