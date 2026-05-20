# Mondeto V2 Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate frontend from mock-based 300x150 grid to the real Mondeto smart contract (170x100 grid, UUPS proxy on Celo Sepolia) with a complete visual redesign (dot-matrix map, dark/light mode).

**Architecture:** Keep existing React hooks + Canvas approach. Replace mock data layer with wagmi contract reads. Add theme system. Resize grid. New map rendering (dots, no background image).

**Tech Stack:** Same as before + viem ABI encoding for packed byte decoding

---

## What Can Run in Parallel (3 agents)

After Phase 0 (foundation), these are independent:

| Agent | Scope | Files |
|-------|-------|-------|
| **Agent A** | Theme system + design overhaul | globals.css, theme context, TopBar, BottomNav, all page layouts, Leaderboard, Profile components |
| **Agent B** | Map rendering (dot-matrix) | PixelLayer, SelectionLayer, WorldCanvas, HeatmapLegend, PaintModeBanner |
| **Agent C** | Contract integration | contract.ts ABI, priceCalc.ts, contractReads.ts, useBuyPixels, usePixelPrice, useProfile updates |

---

## Phase 0: Foundation (Sequential — must complete first)

### Task 0.1: Update grid constants

**Files:** `src/constants/map.ts`

- [ ] Change WIDTH=170, HEIGHT=100, TOTAL_PIXELS=17000
- [ ] Verify: `pnpm --filter web exec tsc --noEmit`

### Task 0.2: Generate new land mask for 170x100

**Files:** `src/data/landMask.ts`, `scripts/generate-land-mask.py`

- [ ] Get the upstream `land_mask.json` (67 uint256 words) or `world_map_bw.png`
- [ ] Convert to our `Uint8Array` format (1/0 per pixel, 17000 entries)
- [ ] Or: write a script that reads the bit-packed uint256 words and outputs per-pixel booleans
- [ ] Update `src/lib/landMask.ts` if needed (uses WIDTH from constants, should auto-adjust)
- [ ] Verify land count ≈ 5,622

### Task 0.3: Generate ABI from Mondeto.sol

**Files:** `src/lib/contract.ts`

- [ ] Extract ABI from `apps/contracts/contracts/Mondeto.sol` (compile with forge or extract manually)
- [ ] Write complete typed ABI as `const MONDETO_ABI = [...]` with all functions:
  - `config()`, `getPixelBatch()`, `selectionPrice()`, `buyPixels()`, `updateProfile()`
  - `priceOf()`, `isLand()`, `pixels()`, `profiles()`, `currentEpoch()`
- [ ] Add proxy address (from Sepolia deployment)
- [ ] Add standard ERC20 ABI for USDT approve

### Task 0.4: Client-side price calculation

**Files:** NEW `src/lib/priceCalc.ts`

- [ ] Port `_price()` and `_discretePrice()` from Solidity to TypeScript
- [ ] Uses BigInt arithmetic
- [ ] Inputs: saleCount, elapsed (seconds), initialPrice, minPrice, halvingTime
- [ ] Test with known values from contract

### Task 0.5: Update mock.ts for 170x100

**Files:** `src/lib/mock.ts`

- [ ] Update all grid references to use new WIDTH/HEIGHT
- [ ] Update seedDemoData cluster coordinates for the new grid
- [ ] Update HOTSPOTS for geographic price variation
- [ ] Keep mock mode working for development without contract

### Task 0.6: Commit + verify

- [ ] `pnpm --filter web test` — fix any broken tests (dimensions changed)
- [ ] `pnpm --filter web exec tsc --noEmit` — zero errors
- [ ] Commit: "chore: migrate to 170x100 grid + contract ABI"

---

## Phase 1: Parallel Work (3 agents after Phase 0)

### Agent A: Theme System + Design Overhaul

#### Task A.1: Theme CSS variables

**Files:** `src/app/globals.css`

- [ ] Add CSS variables for dark mode under `[data-theme="dark"]`:
  ```
  --bg: #0a0a0a
  --text: #00ff00
  --text-muted: #008800
  --border: #00ff00
  --card-bg: #0a0a0a
  --button-bg: #00ff00
  --button-text: #000000
  --accent: #00ff00
  ```
- [ ] Keep light mode as default (current cream palette)
- [ ] Add `[data-theme="light"]` explicitly for clarity

#### Task A.2: Theme context

**Files:** NEW `src/lib/theme.tsx`

- [ ] `ThemeProvider` component wrapping app
- [ ] `useTheme()` hook returning `{ theme, toggleTheme, isDark }`
- [ ] Persists to localStorage
- [ ] Sets `data-theme` attribute on `<html>`

#### Task A.3: Update layout.tsx

**Files:** `src/app/layout.tsx`

- [ ] Wrap children with `ThemeProvider`
- [ ] Body uses CSS variable `var(--bg)` for background

#### Task A.4: Update TopBar

**Files:** `src/components/Layout/TopBar.tsx`

- [ ] Theme toggle button (sun/moon icon)
- [ ] "CELO" indicator (green dot + text) from screenshots
- [ ] Use CSS variables for colors
- [ ] Borders: 1px solid var(--border)

#### Task A.5: Update BottomNav

**Files:** `src/components/Layout/BottomNav.tsx`

- [ ] Use CSS variables for all colors
- [ ] Dark mode: green icons + text
- [ ] Light mode: current dark icons
- [ ] Remove `isHeatmap` prop (no more dark-mode-per-heatmap)

#### Task A.6: Update Leaderboard

**Files:** `src/components/Leaderboard/*.tsx`, `src/app/ranks/page.tsx`

- [ ] All colors via CSS variables
- [ ] Card borders: `var(--border)`
- [ ] Top 3 rows: bordered cards (as in screenshots)
- [ ] Dark mode: green text, green borders

#### Task A.7: Update Profile

**Files:** `src/components/Profile/*.tsx`, `src/app/profile/page.tsx`

- [ ] All colors via CSS variables
- [ ] Dark mode: green accents, black cards with green borders
- [ ] Save button: dark mode = green bg, black text

#### Task A.8: Update Overlays

**Files:** `src/components/Overlays/*.tsx`

- [ ] SelectionDrawer, DimLayer, TxProgress, SuccessState — all themed
- [ ] Buy button: var(--button-bg), var(--button-text)

---

### Agent B: Map Rendering (Dot-Matrix)

#### Task B.1: New PixelLayer — dot rendering

**Files:** `src/components/Map/PixelLayer.tsx`

- [ ] Remove Lego brick rendering
- [ ] All land pixels rendered as circles (`ctx.arc`)
- [ ] Light mode: unowned land = #999 (gray dots), owned = owner color
- [ ] Dark mode: unowned land = #333 (dim dots), owned = owner color
- [ ] Theme-aware: accept `isDark` prop
- [ ] Canvas dimensions: 170x100

#### Task B.2: Update WorldCanvas

**Files:** `src/components/Map/WorldCanvas.tsx`

- [ ] Remove `<img>` world-map.png entirely
- [ ] Canvas IS the map — dots render the continent shapes
- [ ] Keep zoom/pan, keep forwardRef API
- [ ] Canvas size: 170x100

#### Task B.3: Update SelectionLayer

**Files:** `src/components/Map/SelectionLayer.tsx`

- [ ] Canvas dimensions: 170x100
- [ ] Selection color stays black with white border (visible in both themes)

#### Task B.4: Update HeatmapLegend + PaintModeBanner

**Files:** `src/components/Map/HeatmapLegend.tsx`, `src/components/Map/PaintModeBanner.tsx`

- [ ] Theme-aware styling
- [ ] HeatmapLegend: use CSS variables for background/text

#### Task B.5: Update page.tsx map section

**Files:** `src/app/page.tsx`

- [ ] Pass theme to map components
- [ ] Remove world-map.png reference
- [ ] HEAT button (from screenshots, replacing "heatmap" text)

---

### Agent C: Contract Integration

#### Task C.1: Contract ABI + addresses

**Files:** `src/lib/contract.ts`

- [ ] Full Mondeto ABI (from Solidity source)
- [ ] ERC20 ABI for USDT approve/balanceOf
- [ ] Sepolia proxy address
- [ ] Mainnet addresses (when ready)

#### Task C.2: Contract read hooks

**Files:** NEW `src/lib/contractReads.ts`

- [ ] `useContractConfig()` — calls `config()`, caches result
- [ ] `usePixelBatch(x, y, w, h)` — calls `getPixelBatch()`, decodes packed bytes
- [ ] `useLandMask()` — fetches landMask words, converts to boolean array
- [ ] Decode packed bytes: for each 24-byte record, extract owner (20), saleCount (1), color (3)

#### Task C.3: Update useBuyPixels

**Files:** `src/hooks/useBuyPixels.ts`

- [ ] When `MOCK_MODE=false`: use wagmi `writeContract` for:
  1. `usdt.approve(mondetoAddress, totalPrice)`
  2. `mondeto.buyPixels(ids)`
- [ ] Keep mock mode for development

#### Task C.4: Update usePixelPrice

**Files:** `src/hooks/usePixelPrice.ts`

- [ ] When `MOCK_MODE=false`: call `selectionPrice(ids)` on contract
- [ ] Or compute client-side using `priceCalc.ts` + saleCount data

#### Task C.5: Update useProfile

**Files:** `src/hooks/useProfile.ts`

- [ ] When `MOCK_MODE=false`: read from `profiles(address)` on contract
- [ ] Save calls `updateProfile(color, label, url)` on contract
- [ ] Handle 64-byte label/url limits

---

## Phase 2: Integration + Testing (Sequential)

### Task I.1: Wire theme into all pages
### Task I.2: Wire contract reads into usePixelMap (dual-mode: mock/contract)
### Task I.3: Update all 122 tests for new dimensions + theme
### Task I.4: Smoke test full flow
### Task I.5: Commit + deploy

---

## Verification Checklist

- [ ] Light mode: cream bg, gray dots for land, colored dots for owned
- [ ] Dark mode: black bg, green accents, dim dots for land
- [ ] Zoom into any continent, see individual dots
- [ ] Paint mode at 4x, select pixels, black selection squares
- [ ] Drawer shows breakdown, buy works (mock mode)
- [ ] Leaderboard shows correct rankings from pixel data
- [ ] Profile save works
- [ ] Heatmap shows warm gradient for bought pixels
- [ ] All 122+ tests pass
- [ ] Builds without errors
- [ ] Deploys to Vercel
