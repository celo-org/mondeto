# Mondeto

**Own the world, one pixel at a time.**

Mondeto (Esperanto for "small world") is a pixel world map where anyone can buy, own, and trade land on a 170x100 pixel grid. Built for [MiniPay](https://www.opera.com/products/minipay) on the [Celo](https://celo.org) blockchain.

**Live demo:** [mondeto-web.vercel.app](https://mondeto-web.vercel.app)
**Smart contract:** [github.com/karlb/mondeto](https://github.com/karlb/mondeto)

## Screenshots

| Map | Heatmap | Leaderboard | Profile |
|-----|---------|-------------|---------|
| ![Map](apps/web/public/screenshots/map.jpeg) | ![Heatmap](apps/web/public/screenshots/heatmap.jpeg) | ![Leaderboard](apps/web/public/screenshots/leaderboard.jpeg) | ![Profile](apps/web/public/screenshots/profile.jpeg) |

## How It Works

1. **Zoom in** to the dot-matrix world map and enter paint mode (4x zoom)
2. **Select pixels** on any continent — water is not selectable (enforced on-chain)
3. **Review your selection** — see total cost, balance, and breakdown by current owner
4. **Buy land** — pay in supported dollar stablecoins on Celo. Price doubles with each sale, halves every 182 days without resale.
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
- **Pricing:** `initialPrice << (saleCount - epoch)` with 182-day halving
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
scripts/
  convert-land-mask.py    Convert contract uint256 words to frontend format
```

## Deployments

Mondeto runs multiple identical 170×100 map contracts. New wallets are auto-assigned to the current "active" map (the lowest-id map whose average pixel price is below `NEXT_PUBLIC_MAP_THRESHOLD_USD`, default `$2`); the pointer advances automatically as each map fills. Existing wallets keep their sticky home (persisted to `localStorage`). All contracts live in [`apps/web/src/lib/maps/contracts.ts`](apps/web/src/lib/maps/contracts.ts).

### Production (Celo mainnet)

| Map | Address |
|-----|---------|
| 0   | [`0xf825914Fa66F82f603310a1a7146C0F64A382298`](https://celoscan.io/address/0xf825914Fa66F82f603310a1a7146C0F64A382298) |
| 1   | [`0xB58dA361F816af8F7C996864a66cd1e12C35D0f1`](https://celoscan.io/address/0xB58dA361F816af8F7C996864a66cd1e12C35D0f1) |
| 2   | [`0x198c60A8515cdA74Ae82c8D3D56d3683e2713599`](https://celoscan.io/address/0x198c60A8515cdA74Ae82c8D3D56d3683e2713599) |

Add new mainnet deployments to `PRODUCTION_MAPS` in the registry as one-line entries. No other code change is required — the active-pointer mechanism picks them up.

### Staging

`NEXT_PUBLIC_ENV=staging` switches to a separate registry so we can exercise the app on testnet without affecting production:

| Chain | Map | Address |
|-------|-----|---------|
| Celo Sepolia  | 0 | [`0xc71e444c5339749c1c3067B62AacbfeE7840c934`](https://celo-sepolia.blockscout.com/address/0xc71e444c5339749c1c3067B62AacbfeE7840c934) |

`ChainGuard` is relaxed on staging so the wallet can stay on Sepolia. Production wallets are auto-switched to Celo mainnet.

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
