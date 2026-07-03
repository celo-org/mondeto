# Mondeto

A pixel world map on Celo where every land pixel is ownable on-chain. Pixels are colored by owner, creating a territorial mosaic. Accepts a set of dollar stablecoins (1:1) as currency, targets MiniPay.

## Build & Test

```sh
forge build
forge test
```

## Deployment

The deploy script (`script/Deploy.s.sol`) is configured entirely through environment
variables and a land mask JSON file (which also supplies `WIDTH`/`HEIGHT`). The default
is the full `map/land_mask.json` (world); set `LAND_MASK_PATH` to point at a per-continent
mask under `map/continents/` to deploy a single continent instead.

1. Copy the template and fill it in:

   ```sh
   cp deploy.env.example mainnet.env   # or sepolia.env
   $EDITOR mainnet.env
   ```

   `*.env` files are gitignored; only `deploy.env.example` is committed. Required vars:

   | Variable           | Meaning                                                              |
   | ------------------ | -------------------------------------------------------------------- |
   | `ACCEPTED_TOKENS`  | Comma-separated stablecoin addresses (no spaces), all treated 1:1. Each must be a real ERC-20 — `initialize()` reads `decimals()` on-chain. |
   | `INITIAL_PRICE`    | Starting pixel price in 6-decimal base units (`10000` = $0.01).      |
   | `MIN_PRICE`        | Price floor in base units.                                           |
   | `HALVING_TIME_DAYS`| Epoch length; price gradually halves over this window.               |
   | `INITIAL_FEE_RATE` | Treasury fee on resales, in basis points (`500` = 5%), max `2000` (20%).|
   | `ETH_RPC_URL`      | RPC endpoint (used by default when `--rpc-url` is omitted).          |
   | `LAND_MASK_PATH`   | *Optional.* Path to the land mask JSON. Defaults to `map/land_mask.json`. Set to `map/continents/<name>.json` (e.g. `africa`, `asia`, `europe`, `north-america`, `oceania`, `south-america`, `antarctica`) for a single-continent deploy. |

   `PROXY_ADDRESS` is not used by the Solidity deploy — it's read by the operational
   scripts (`script/pay_leaders.py`, `script/player_pnl.py`), so set it after the first deploy.

2. Source the env file (it uses `export`, so `forge` picks the values up) and run the
   script with a signer:

   ```sh
   source mainnet.env
   forge script script/Deploy.s.sol --broadcast --account <keystore>
   ```

   Use `--account <keystore>` (or `--ledger`) for signing — don't put a private key in the
   env file.

### Upgrading

Upgrades preserve all proxy state, so no env config is needed beyond the RPC and signer:

```sh
source mainnet.env
forge script script/Upgrade.s.sol --broadcast --account <keystore>
```

`Upgrade.s.sol` reads the proxy address from the latest `broadcast/Deploy.s.sol/<chainid>/run-latest.json`,
deploys a fresh implementation, and calls `upgradeToAndCall`. See the Upgrade Checklist in
`CLAUDE.md` for the storage-layout rules.
