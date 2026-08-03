# Mondeto

**Own the world, one pixel at a time.**

Mondeto (Esperanto for "small world") is a pixel world map where anyone can buy, own, and trade land on a 170x100 pixel grid. Built for [MiniPay](https://www.opera.com/products/minipay) on the [Celo](https://celo.org) blockchain.

**Live demo:** [mondeto.app](https://mondeto.app/)

## How It Works

1. **Zoom in** to the dot-matrix world map and enter paint mode (4x zoom)
2. **Select pixels** on any continent — water is not selectable (enforced on-chain)
3. **Review your selection** — see total cost, balance, and breakdown by current owner
4. **Buy land** — pay in supported dollar stablecoins on Celo. Price doubles with each sale, halves every 30 days without resale.
5. **Customize** — set your name, website URL, and color on your profile (stored on-chain)
6. **Climb the leaderboard** — ranked by total area, largest empire (contiguous territory), or most expensive pixel

## Features

- **Dot-matrix world map** — 170x100 pixel grid rendered as rounded rectangles, no background image
- **Dark/light mode** — neon green on black (default) or cream palette, toggle in top bar
- **On-chain data** — all pixel ownership, profiles, and prices read from the Mondeto smart contract
- **Land mask from contract** — fetched via `getLandMask()`, only land pixels are purchasable
- **Real buy flow** — stablecoin approve + `buyPixels()` with balance check and error handling
- **Profile system** — name, URL, color stored on-chain via `updateProfile()`
- **Leaderboard** — AREA, EMPIRE (BFS contiguous), HOT_PX tabs with profile names and clickable URLs
- **Heatmap mode** — yellow/orange/red gradient showing price hotspots
- **Wallet integration** — RainbowKit for browser, auto-connects in MiniPay
- **Mock fallback** — works without wallet/contract for development

## Smart Contract

The Mondeto contract is a UUPS upgradeable proxy on Celo:

- **Grid:** 170x100 (17,000 pixels, ~5,622 land)
- **Pricing:** `initialPrice << (saleCount - epoch)` with 30-day halving (`config().halvingTime` = 2592000s)
- **Payment:** Multiple accepted dollar stablecoins (1:1), unowned pixels pay treasury, owned pixels pay previous owner
- **Profile:** `{ color: uint24, label: bytes64, url: bytes64 }` per address
- **Land mask:** Bit-packed `uint256[]`, immutable after deploy

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Run tests
pnpm --filter web test

# Type check
pnpm --filter web type-check
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
apps/
  web/                    Next.js 14 app
    src/
      app/                Pages (/, /ranks, /profile, /test-contract)
      components/
        Map/              WorldCanvas, PixelLayer, SelectionLayer, HeatmapLegend, PaintModeBanner
        Overlays/         SelectionDrawer, PixelInfoPanel, DimLayer, TxProgress, SuccessState
        Layout/           TopBar, BottomNav, ScreenHeader, ZoomHintToast
        Leaderboard/      LeaderboardTabs, LeaderboardRow
        Profile/          AvatarBlock, StatsRow, ColorPicker
      hooks/              usePixelMap, useSelection, usePixelPrice, useBuyPixels, useLeaderboard, useProfile, useUSDTBalance
      lib/                contract.ts (ABI), contractReads.ts, priceCalc.ts, landMask.ts, mock.ts, theme.tsx, decodeBytes.ts
      constants/          map.ts (grid dimensions, colors, prices)
      data/               landMask.ts (static fallback, auto-fetched from contract at runtime)
      __tests__/          Vitest tests
  contracts/              Mondeto.sol (reference copy)
  subgraph/               Goldsky subgraph — earn/spend, AREA leaderboard (time
                          tie-break) and analytics. See apps/subgraph/README.md.
                          Set NEXT_PUBLIC_GOLDSKY_SUBGRAPH_URL to point the app at
                          it; unset falls back to the legacy live log-scan.
scripts/
  convert-land-mask.py    Convert contract uint256 words to frontend format
```

## Deployments

Mondeto runs one map contract per continent (plus the whole world) on **Celo mainnet**. Each map is its own canvas with a different grid size and land area. All contracts and their grid dimensions live in [`apps/web/src/lib/maps/contracts.ts`](apps/web/src/lib/maps/contracts.ts); the matching land masks are generated into `apps/web/src/data/masks/` by `pnpm -F web build:masks`. `ChainGuard` keeps wallets on Celo mainnet.

**Gradual rollout.** All continents are deployed and listed in the registry, but visibility is opened over time. By default only **WORLD** is revealed (launch state); continents stay hidden until opened. Set `NEXT_PUBLIC_REVEALED_MAP_IDS` (comma-separated ids, e.g. `0,1,2` for World + Africa + Asia) to reveal more, then redeploy — no code change. When more than one map is revealed, the map switcher and the per-map leaderboard selector appear automatically.

**Active-map pointer.** Among the *revealed* maps, new wallets are auto-assigned to the current "active" map (the lowest-id map whose average pixel price is below `NEXT_PUBLIC_MAP_THRESHOLD_USD`, default `$2`); the pointer advances as each map fills. Existing wallets keep their sticky home (persisted to `localStorage`).

### Celo mainnet — world + continents

| ID | Map | Grid | Land px | Proxy |
|----|-----|------|---------|-------|
| 0 | World | 170×100 | 5,622 | [`0xA8cFC1B4365518f56954382B6Fab25a5382f5C49`](https://celoscan.io/address/0xA8cFC1B4365518f56954382B6Fab25a5382f5C49) |
| 1 | Africa | 127×134 | 8,806 | [`0x8e70ada33714C3F8f35182b781C63449c5e079b7`](https://celoscan.io/address/0x8e70ada33714C3F8f35182b781C63449c5e079b7) |
| 2 | Asia | 158×107 | 6,208 | [`0x9b8DC1e200A21A97963948A758D9fc4300310661`](https://celoscan.io/address/0x9b8DC1e200A21A97963948A758D9fc4300310661) |
| 3 | Europe | 160×107 | 7,293 | [`0xDfB39B4d8896F196c13DBc4aC2dBDc3175Fcd767`](https://celoscan.io/address/0xDfB39B4d8896F196c13DBc4aC2dBDc3175Fcd767) |
| 4 | North America | 159×107 | 5,497 | [`0x5bf55b88220DF9500A33962777B9d48945443106`](https://celoscan.io/address/0x5bf55b88220DF9500A33962777B9d48945443106) |
| 5 | South America | 115×147 | 6,865 | [`0x822e332ac5f0c760257C7204154BA5eaF7A06586`](https://celoscan.io/address/0x822e332ac5f0c760257C7204154BA5eaF7A06586) |
| 6 | Oceania | 158×107 | 4,425 | [`0x693CE5fBC50c0aCbd8B3333ad7DcaAb1802A4773`](https://celoscan.io/address/0x693CE5fBC50c0aCbd8B3333ad7DcaAb1802A4773) |
| 7 | Antarctica | 145×117 | 9,115 | [`0x66C6eF911B3e33B35558956a0E636F33E16063c4`](https://celoscan.io/address/0x66C6eF911B3e33B35558956a0E636F33E16063c4) |

Implementation (logic) contracts behind each UUPS proxy:

| Map | Implementation |
|-----|----------------|
| World | `0x35b4E020F3978Cc2a4F0C123A6A249204b8340e8` |
| Africa | `0xd05C6A419c770425831885FDA2cA4a8b13e5caDb` |
| Asia | `0x869552c7a8e20f2cd45f3B5489A044eE71A29c8F` |
| Europe | `0x435f62Ad79A045c8b02ef27b44F139b31CD77C1c` |
| North America | `0x9c9386dbA4Eb28C377C1eD15E4dC763D5f4DB586` |
| South America | `0x2e965EE6d92777134867d5701CF5A39aA79f5203` |
| Oceania | `0x2DcF496973a97076A7D97E5Ad75d9B7EFcb6D593` |
| Antarctica | `0x1D4e86CfA050654C111728517Abd495696e37B07` |

To add or change a map: update the `MAPS` array in the registry (id, slug, displayName, address, grid dims), drop the continent's mask JSON into `apps/contracts/map/` and run `pnpm -F web build:masks`. No other code change is required — rendering, leaderboards, and the active-pointer mechanism all read the registry.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + CSS variables (dark/light theme)
- **Canvas:** HTML5 Canvas API with react-zoom-pan-pinch
- **Wallet:** wagmi + viem + RainbowKit
- **Chain:** Celo Mainnet / Celo Sepolia
- **Smart Contract:** Solidity, UUPS proxy (OpenZeppelin v5)
- **Testing:** Vitest + React Testing Library
- **Monorepo:** Turborepo + pnpm
- **Deployment:** Vercel

## Design

- **Font:** IBM Plex Mono (400, 500)
- **Dark mode (default):** Black (#0a0a0a), neon green (#00ff41) accents
- **Light mode:** Cream (#fdf9f4), dark text (#1a1a1a)
- **Map:** Dot-matrix — Equal Earth projection, rounded rectangle tiles
- **Grid:** 170x100 pixels, gap 0.08, radius 0.12, paint mode at 4x zoom

## License

MIT
