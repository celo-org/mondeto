# Mondeto Full Build — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pixel world map mini-app for MiniPay on Celo — map canvas with zoom/paint, leaderboard, profile, and buy flow — fully functional end-to-end with mock data layer.

**Architecture:** Three-layer app: (1) canvas-based 300×150 pixel map with react-zoom-pan-pinch, (2) React hooks for state management (no external state lib), (3) mock data layer simulating smart contract. Pages: / (map), /ranks (leaderboard), /profile. All overlays live on the map page.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, react-zoom-pan-pinch, Canvas API, wagmi/viem (wallet), IBM Plex Mono font

**Specs:** `apps/web/01_DESIGN_TOKENS.md`, `apps/web/02_SPEC_MAP.md`, `apps/web/03_SPEC_LEADERBOARD_PROFILE.md`, `apps/web/04_SPEC_OVERLAYS.md`, `apps/web/05_ARCHITECTURE.md`

---

## Rescoping Notes (changes from original plan)

1. **TILE_GAP/TILE_RADIUS conflict**: Spec 01 says GAP=0.1, RADIUS=0.15. Spec 02 code sample says gap=0.08, radius=0.12. **Decision: Use spec 02 values (0.08/0.12)** as they're in the actual rendering code.
2. **Agent A page.tsx conflict**: Original plan had Agent A building page.tsx with BottomNav, but BottomNav is Agent B's. **Fix: Agent A builds page.tsx with a placeholder nav slot. Integration phase wires BottomNav in.**
3. **Agent C now has full overlay spec** (04_SPEC_OVERLAYS.md) — drawer auto-open after 800ms, selection hint pill, pixel info panel, tx steps, success state all specified.
4. **Profile section in drawer**: Spec says pre-fill from saved profile if wallet connected. Agent C must accept profile data as props. **Drawer uses 7 compact swatches (not full hex picker).** Full hex picker is only on /profile page.
5. **Color picker**: Profile page uses full hex via `<input type="color">` + hex input. Drawer uses 7 preset swatches only (`#e74c3c #e67e22 #f1c40f #2ecc71 #1abc9c #3498db #9b59b6`, 18×18px, radius 4px, selected: outline 2px solid #2d2520 offset 1px).
6. **Heatmap rendering**: Spec says circles (ctx.arc), NOT roundRect. Different from owned pixel rendering.
7. **Missing from original plan**: Selection hint pill (State B in overlay spec), drawer auto-open timer, pixel info panel white ring on canvas.
8. **[FIX #1] Top bar has unique frosted values**: `rgba(250,247,242,0.82)` + `blur(12px)` + `border-bottom: 0.5px solid rgba(200,190,175,0.4)`. NOT the generic `.frosted` class.
9. **[FIX #3] ZoomHintToast ownership**: Moved from Agent B to Agent A per architecture doc agent ownership section.
10. **[FIX #4] HeatmapLayer.tsx renamed to HeatmapLegend.tsx**: It only renders the legend bar. Actual heatmap pixel rendering is a mode in PixelLayer.tsx.
11. **[FIX #5] Canvas white ring for pixel info**: Agent A exposes a `drawInspectRing(pixelId)` / `clearInspectRing()` callback via ref. Agent C calls it through props wired in integration phase.
12. **[FIX #6] USDT balance check**: useBuyPixels hook checks USDT.balanceOf before executing. If insufficient, returns error state with "insufficient balance" message. Drawer disables buy button and shows balance.
13. **[FIX #7] Heatmap full dark UI chrome**: page.tsx applies `data-heatmap` attribute to root. CSS handles: bg #0a0a0a, top bar text #faf7f2, status bar text #666. All controlled via CSS selectors, not JS.
14. **[FIX #8] Long-press inspect in paint mode**: SelectionLayer detects 500ms pointer hold without move → triggers pixel info panel instead of paint. Normal tap/drag = paint.
15. **[FIX #9] All 8 heatmap CSS variables**: globals.css includes all stops: heat-cheap, heat-low, heat-mid1, heat-mid2, heat-high1, heat-high2, heat-hot, heat-max.
16. **[FIX #10] Overlay pixel-precise values embedded**: All agent prompts include exact padding, margins, font sizes, colors from spec 04. See task descriptions below.

---

## Phase 0: Foundation (Sequential)

All shared infrastructure. Must complete before parallel work begins.

### Task 0.1: Install dependency

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Verify react-zoom-pan-pinch is installed**

```bash
cd apps/web && cat package.json | grep zoom-pan-pinch
```

Expected: dependency present (user confirmed installed)

---

### Task 0.2: Verify world-map.png

**Files:**
- Check: `apps/web/public/world-map.png`

- [ ] **Step 1: Verify image exists and dimensions**

```bash
ls -la apps/web/public/world-map.png
file apps/web/public/world-map.png
```

Expected: PNG file exists, ~600×300px

---

### Task 0.3: Design tokens — globals.css

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add IBM Plex Mono import and CSS variables**

Replace entire file with:
```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Cream palette */
    --cream-50:  #fdf9f4;
    --cream-100: #faf7f2;
    --cream-200: #f5f1ea;
    --cream-300: #ede8df;
    --cream-400: #e0d8ce;
    --cream-500: #c0b8ae;
    --cream-600: #a09080;
    --cream-700: #6a5f54;
    --cream-800: #2d2520;

    /* Map */
    --ocean:     #ddeef7;

    /* Selection */
    --selected:      #facc15;
    --selected-ring: #2d2520;

    /* Heatmap (all 8 stops from spec 01) */
    --heat-bg:    #0a0a0a;
    --heat-cheap: #4444ff;
    --heat-low:   #2288ff;
    --heat-mid1:  #00ccff;
    --heat-mid2:  #00ff88;
    --heat-high1: #ffff00;
    --heat-high2: #ff8800;
    --heat-hot:   #ff4400;
    --heat-max:   #ffffff;

    /* Map terrain (from spec 01, used as reference) */
    --land-green: #c5d9a8;
    --land-tan:   #d4c0a0;

    /* Semantic */
    --success:    #2d6a4f;
    --tx-pending: #6a5f54;
    --link:       #4a7fa5;

    /* Spacing */
    --space-1: 4px;
    --space-2: 6px;
    --space-3: 8px;
    --space-4: 10px;
    --space-5: 12px;
    --space-6: 14px;
    --space-8: 20px;

    /* Radii */
    --radius-sm:   3px;
    --radius-md:   8px;
    --radius-lg:   10px;
    --radius-xl:   18px;
    --radius-full: 9999px;

    /* Transitions */
    --transition-fast:   150ms ease;
    --transition-base:   250ms ease;
    --transition-slow:   400ms ease;
    --transition-drawer: 300ms cubic-bezier(0.32, 0.72, 0, 1);

    /* Typography scale */
    --text-2xs:  7px;
    --text-xs:   8px;
    --text-sm:   9px;
    --text-base: 10px;
    --text-md:   11px;
    --text-lg:   13px;
    --text-xl:   18px;

    /* Letter spacing */
    --tracking-wide:   1px;
    --tracking-wider:  2px;
    --tracking-widest: 3px;
    --tracking-button: 1.5px;

    /* Keep shadcn variables for compatibility */
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  * {
    @apply border-border;
  }

  body {
    background-color: var(--cream-50);
    color: var(--cream-800);
    font-family: 'IBM Plex Mono', 'Courier New', monospace;
  }
}

/* Frosted glass — bottom nav, panels */
.frosted {
  background: rgba(250, 247, 242, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 0.5px solid rgba(200, 190, 175, 0.5);
}

/* Frosted glass — top bar (spec 02: different opacity + blur) */
.frosted-topbar {
  background: rgba(250, 247, 242, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 0.5px solid rgba(200, 190, 175, 0.4);
}

/* Frosted glass — dark heatmap variant for nav */
.frosted-dark {
  background: rgba(10, 10, 10, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 0.5px solid rgba(80, 80, 80, 0.3);
}

/* Frosted glass — dark heatmap variant for top bar */
.frosted-topbar-dark {
  background: rgba(10, 10, 10, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 0.5px solid rgba(80, 80, 80, 0.3);
}

/* [FIX #7] Heatmap full dark UI chrome */
[data-heatmap="true"] {
  background-color: #0a0a0a !important;
}
[data-heatmap="true"] .topbar-title {
  color: #faf7f2;
}
[data-heatmap="true"] .status-bar {
  background-color: #0a0a0a;
  color: #666;
}

/* Spin animation for tx progress */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin-slow {
  animation: spin 0.8s linear infinite;
}
```

- [ ] **Step 2: Verify CSS loads without errors**

```bash
cd /Users/lenahierzi/Developer/mondeto-fe && pnpm dev --filter web 2>&1 | head -20
```

Expected: No CSS parse errors

---

### Task 0.4: Tailwind config

**Files:**
- Modify: `apps/web/tailwind.config.js`

- [ ] **Step 1: Add cream colors, ocean, selected, success, mono font, letter-spacing**

Add to `theme.extend`:
```js
fontFamily: {
  mono: ['IBM Plex Mono', 'Courier New', 'monospace'],
},
colors: {
  // Keep existing primary/secondary
  cream: {
    50: '#fdf9f4', 100: '#faf7f2', 200: '#f5f1ea',
    300: '#ede8df', 400: '#e0d8ce', 500: '#c0b8ae',
    600: '#a09080', 700: '#6a5f54', 800: '#2d2520',
  },
  ocean: '#ddeef7',
  selected: '#facc15',
  success: '#2d6a4f',
  link: '#4a7fa5',
},
letterSpacing: {
  widest2: '3px',
  button: '1.5px',
},
```

- [ ] **Step 2: Verify tailwind compiles**

```bash
cd /Users/lenahierzi/Developer/mondeto-fe && pnpm dev --filter web 2>&1 | head -10
```

---

### Task 0.5: Layout.tsx — Font + metadata + remove Navbar render

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Replace Inter with IBM Plex Mono, update metadata, remove Navbar from JSX**

```tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { WalletProvider } from "@/components/wallet-provider"

export const metadata: Metadata = {
  title: 'Mondeto',
  description: 'Own the world, one pixel at a time',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-mono antialiased">
        <div className="relative flex min-h-screen flex-col">
          <WalletProvider>
            <main className="flex-1">
              {children}
            </main>
          </WalletProvider>
        </div>
      </body>
    </html>
  );
}
```

**Note:** `navbar.tsx` file is NOT deleted (per feedback rule). It's just not rendered in layout anymore.

- [ ] **Step 2: Verify app loads with cream background and mono font**

```bash
pnpm dev --filter web
```

Expected: Cream background (#fdf9f4), IBM Plex Mono font, no Navbar visible

---

### Task 0.6: Map constants

**Files:**
- Create: `apps/web/src/constants/map.ts`

- [ ] **Step 1: Create constants file**

```ts
export const WIDTH = 300
export const HEIGHT = 150
export const TOTAL_PIXELS = WIDTH * HEIGHT

export const INITIAL_PRICE = 10000n // 0.01 USDT (6 decimals)
export const PRICE_DOUBLE_RATE = 2n

export const TILE_GAP = 0.08
export const TILE_RADIUS = 0.12
export const PAINT_SCALE = 4
export const MAX_SELECT = 1000

export const COLOR_PRESETS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#1abc9c', '#3498db', '#9b59b6', '#e91e63',
  '#ff5722', '#00bcd4', '#8bc34a', '#f0f0f0',
] as const

export const HEAT_STOPS = [
  { pos: 0.0, color: '#4444ff' },
  { pos: 0.2, color: '#2288ff' },
  { pos: 0.4, color: '#00ccff' },
  { pos: 0.6, color: '#00ff88' },
  { pos: 0.7, color: '#ffff00' },
  { pos: 0.85, color: '#ff8800' },
  { pos: 0.95, color: '#ff4400' },
  { pos: 1.0, color: '#ffffff' },
] as const

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
```

---

### Task 0.7: Color utilities

**Files:**
- Create: `apps/web/src/lib/colorUtils.ts`

- [ ] **Step 1: Create color utility functions**

```ts
import { HEAT_STOPS } from '@/constants/map'

export function hexToUint24(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

export function uint24ToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0')
}

export function interpolateHeatGradient(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  let lower = HEAT_STOPS[0]
  let upper = HEAT_STOPS[HEAT_STOPS.length - 1]

  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    if (clamped >= HEAT_STOPS[i].pos && clamped <= HEAT_STOPS[i + 1].pos) {
      lower = HEAT_STOPS[i]
      upper = HEAT_STOPS[i + 1]
      break
    }
  }

  const range = upper.pos - lower.pos
  const t = range === 0 ? 0 : (clamped - lower.pos) / range
  return lerpColor(lower.color, upper.color, t)
}

function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16)
  const ag = parseInt(a.slice(3, 5), 16)
  const ab = parseInt(a.slice(5, 7), 16)
  const br = parseInt(b.slice(1, 3), 16)
  const bg = parseInt(b.slice(3, 5), 16)
  const bb = parseInt(b.slice(5, 7), 16)
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const blue = Math.round(ab + (bb - ab) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`
}

export function formatUSDT(amount: bigint, decimals = 6): string {
  const whole = amount / BigInt(10 ** decimals)
  const frac = amount % BigInt(10 ** decimals)
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2)
  return `${whole}.${fracStr}`
}

export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex)
}
```

---

### Task 0.8: Pixel math utilities

**Files:**
- Create: `apps/web/src/lib/pixelMath.ts`

- [ ] **Step 1: Create pixel math functions**

```ts
import { WIDTH, HEIGHT } from '@/constants/map'

export function pixelId(x: number, y: number): number {
  return y * WIDTH + x
}

export function idToXY(id: number): { x: number; y: number } {
  return { x: id % WIDTH, y: Math.floor(id / WIDTH) }
}

export function screenToPixel(
  clientX: number,
  clientY: number,
  canvasEl: HTMLCanvasElement,
  scale: number,
): { x: number; y: number } | null {
  const rect = canvasEl.getBoundingClientRect()
  const canvasX = (clientX - rect.left) / scale
  const canvasY = (clientY - rect.top) / scale
  const x = Math.floor(canvasX)
  const y = Math.floor(canvasY)
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return null
  return { x, y }
}

export function rectToIds(
  x1: number, y1: number,
  x2: number, y2: number,
): number[] {
  const minX = Math.max(0, Math.min(x1, x2))
  const maxX = Math.min(WIDTH - 1, Math.max(x1, x2))
  const minY = Math.max(0, Math.min(y1, y2))
  const maxY = Math.min(HEIGHT - 1, Math.max(y1, y2))
  const ids: number[] = []
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      ids.push(pixelId(x, y))
    }
  }
  return ids
}

export interface Empire {
  owner: string
  size: number
  ids: Set<number>
}

export function computeEmpires(
  owners: Map<number, string>,
): Empire[] {
  const visited = new Set<number>()
  const empires: Empire[] = []

  for (const [id, owner] of owners) {
    if (visited.has(id) || owner === '') continue
    const empire: Empire = { owner, size: 0, ids: new Set() }
    const queue = [id]
    while (queue.length > 0) {
      const current = queue.pop()!
      if (visited.has(current)) continue
      const currentOwner = owners.get(current)
      if (currentOwner !== owner) continue
      visited.add(current)
      empire.ids.add(current)
      empire.size++
      const { x, y } = idToXY(current)
      if (x > 0) queue.push(pixelId(x - 1, y))
      if (x < WIDTH - 1) queue.push(pixelId(x + 1, y))
      if (y > 0) queue.push(pixelId(x, y - 1))
      if (y < HEIGHT - 1) queue.push(pixelId(x, y + 1))
    }
    empires.push(empire)
  }
  return empires
}
```

---

### Task 0.9: Mock data layer

**Files:**
- Create: `apps/web/src/lib/mock.ts`

- [ ] **Step 1: Create mock with session-persistent state**

```ts
import { WIDTH, HEIGHT, INITIAL_PRICE, PRICE_DOUBLE_RATE, ZERO_ADDRESS, COLOR_PRESETS } from '@/constants/map'
import { pixelId } from './pixelMath'

export const MOCK_MODE = true

export interface PixelView {
  owner: string
  saleCount: number
  currentPrice: bigint
  color: string
  label: string
  url: string
}

export interface OwnerProfile {
  color: number
  label: string
  url: string
}

// Session-persistent state
const pixelState: PixelView[] = []
const profiles = new Map<string, OwnerProfile>()

function initState() {
  if (pixelState.length > 0) return
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    pixelState.push({
      owner: ZERO_ADDRESS,
      saleCount: 0,
      currentPrice: INITIAL_PRICE,
      color: '',
      label: '',
      url: '',
    })
  }
  // Seed some owned pixels for demo
  seedDemoData()
}

function seedDemoData() {
  const demoOwners = [
    { addr: '0x1111111111111111111111111111111111111111', label: 'CeloFan', color: '#3498db', url: 'https://celo.org' },
    { addr: '0x2222222222222222222222222222222222222222', label: 'ETHGlobal', color: '#9b59b6', url: 'https://ethglobal.com' },
    { addr: '0x3333333333333333333333333333333333333333', label: 'Nike', color: '#e74c3c', url: 'https://nike.com' },
    { addr: '0x4444444444444444444444444444444444444444', label: 'Vitalik', color: '#2ecc71', url: '' },
  ]

  // Seed clusters of pixels for each demo owner
  const clusters = [
    { owner: 0, startX: 80, startY: 40, w: 12, h: 8 },
    { owner: 0, startX: 95, startY: 42, w: 6, h: 5 },
    { owner: 1, startX: 150, startY: 60, w: 10, h: 6 },
    { owner: 2, startX: 200, startY: 30, w: 15, h: 10 },
    { owner: 2, startX: 218, startY: 35, w: 5, h: 4 },
    { owner: 3, startX: 120, startY: 80, w: 8, h: 8 },
    { owner: 3, startX: 130, startY: 82, w: 4, h: 4 },
  ]

  for (const cluster of clusters) {
    const demo = demoOwners[cluster.owner]
    for (let y = cluster.startY; y < cluster.startY + cluster.h; y++) {
      for (let x = cluster.startX; x < cluster.startX + cluster.w; x++) {
        if (x >= WIDTH || y >= HEIGHT) continue
        const id = pixelId(x, y)
        const sales = Math.floor(Math.random() * 5) + 1
        pixelState[id] = {
          owner: demo.addr,
          saleCount: sales,
          currentPrice: INITIAL_PRICE * (PRICE_DOUBLE_RATE ** BigInt(sales)),
          color: demo.color,
          label: demo.label,
          url: demo.url,
        }
      }
    }
    profiles.set(demo.addr, {
      color: parseInt(demo.color.replace('#', ''), 16),
      label: demo.label,
      url: demo.url,
    })
  }
}

export async function getPixelBatch(startId: number, count: number): Promise<PixelView[]> {
  initState()
  await delay(200) // Simulate network
  return pixelState.slice(startId, startId + count)
}

export async function getAllPixels(): Promise<PixelView[]> {
  initState()
  await delay(300)
  return [...pixelState]
}

export async function selectionPrice(ids: number[]): Promise<bigint> {
  initState()
  await delay(100)
  return ids.reduce((sum, id) => sum + pixelState[id].currentPrice, 0n)
}

export async function buyPixels(
  ids: number[],
  color: string,
  label: string,
  url: string,
  buyer: string,
): Promise<string> {
  initState()
  await delay(800) // Simulate tx
  for (const id of ids) {
    const prev = pixelState[id]
    pixelState[id] = {
      owner: buyer,
      saleCount: prev.saleCount + 1,
      currentPrice: prev.currentPrice * PRICE_DOUBLE_RATE,
      color,
      label,
      url,
    }
  }
  profiles.set(buyer, {
    color: parseInt(color.replace('#', ''), 16),
    label,
    url,
  })
  return '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

export async function getProfile(address: string): Promise<OwnerProfile | null> {
  initState()
  await delay(50)
  return profiles.get(address) ?? null
}

export async function updateProfile(
  address: string,
  color: number,
  label: string,
  url: string,
): Promise<void> {
  initState()
  await delay(300)
  profiles.set(address, { color, label, url })
  // Update all owned pixels with new profile data
  const hexColor = '#' + color.toString(16).padStart(6, '0')
  for (let i = 0; i < pixelState.length; i++) {
    if (pixelState[i].owner === address) {
      pixelState[i].color = hexColor
      pixelState[i].label = label
      pixelState[i].url = url
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

---

### Task 0.10: Contract stub

**Files:**
- Create: `apps/web/src/lib/contract.ts`

- [ ] **Step 1: Create stub**

```ts
export const MONDETO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
export const USDT_ADDRESS = '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e' as const

// ABI will be populated when smart contract is delivered
export const MONDETO_ABI = [] as const
export const USDT_ABI = [] as const
```

---

## Phase 1: Parallel Build (3 Agents)

**CRITICAL: Agents work in isolated worktrees. No agent touches another's files.**

---

### Task A.1: usePixelMap hook (Agent A)

**Files:**
- Create: `apps/web/src/hooks/usePixelMap.ts`

- [ ] **Step 1: Implement hook with useRef storage**

```ts
'use client'
import { useRef, useState, useCallback } from 'react'
import { getAllPixels, type PixelView } from '@/lib/mock'

export type LoadState = 'loading' | 'ready' | 'error'

export function usePixelMap() {
  const pixelDataRef = useRef<PixelView[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')

  const load = useCallback(async () => {
    try {
      setLoadState('loading')
      const data = await getAllPixels()
      pixelDataRef.current = data
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [])

  const refresh = useCallback(async () => {
    const data = await getAllPixels()
    pixelDataRef.current = data
    setLoadState('ready')
  }, [])

  return { pixelDataRef, loadState, load, refresh }
}
```

---

### Task A.2: useSelection hook (Agent A)

**Files:**
- Create: `apps/web/src/hooks/useSelection.ts`

- [ ] **Step 1: Implement selection state**

```ts
'use client'
import { useState, useCallback } from 'react'
import { MAX_SELECT } from '@/constants/map'

export interface UseSelectionReturn {
  selectedIds: Set<number>
  addPixel: (id: number) => void
  removePixel: (id: number) => void
  togglePixel: (id: number) => void
  clearSelection: () => void
  pixelCount: number
  isAtLimit: boolean
}

export function useSelection(): UseSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const addPixel = useCallback((id: number) => {
    setSelectedIds(prev => {
      if (prev.size >= MAX_SELECT) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const removePixel = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const togglePixel = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_SELECT) next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  return {
    selectedIds,
    addPixel,
    removePixel,
    togglePixel,
    clearSelection,
    pixelCount: selectedIds.size,
    isAtLimit: selectedIds.size >= MAX_SELECT,
  }
}
```

---

### Task A.3: PixelLayer.tsx (Agent A)

**Files:**
- Create: `apps/web/src/components/Map/PixelLayer.tsx`

- [ ] **Step 1: Canvas renderer for owned pixels + heatmap mode**

Draws all owned pixels as roundRect in normal mode, circles in heatmap mode. Accepts `pixelData`, `isHeatmap`, and canvas ref. Uses `TILE_GAP=0.08`, `TILE_RADIUS=0.12`. In heatmap mode, uses `ctx.arc(x+0.5, y+0.5, 0.35)` and `interpolateHeatGradient`. Unowned pixels: skip in normal mode, draw as cheapest heat color in heatmap.

---

### Task A.4: SelectionLayer.tsx (Agent A)

**Files:**
- Create: `apps/web/src/components/Map/SelectionLayer.tsx`

- [ ] **Step 1: Selection canvas + pointer events**

Separate canvas for yellow (#facc15) selection highlights with dark stroke (#2d2520, width 0.12). Handles `onPointerDown`, `onPointerMove`, `onPointerUp` in paint mode (scale >= 4). Uses `screenToPixel` for hit testing. `pointerEvents` set to 'auto' only when `isPaintMode`.

- [ ] **Step 2: [FIX #8] Long-press inspect in paint mode**

In paint mode (scale >= 4), detect 500ms pointer hold without move (>3px threshold). If held: cancel paint, trigger `onInspectPixel(pixelId)` callback instead. Normal tap/drag = paint selection. This allows users to inspect pixel info even in paint mode. The callback is wired to open PixelInfoPanel during integration.

---

### Task A.5: HeatmapLegend.tsx (Agent A — renamed from HeatmapLayer per fix #4)

**Files:**
- Create: `apps/web/src/components/Map/HeatmapLegend.tsx`

Note: Actual heatmap pixel rendering is a mode flag in PixelLayer.tsx (circles via ctx.arc). This component is ONLY the legend bar overlay.

- [ ] **Step 1: Heatmap legend bar**

Position absolute, bottom 68px, left 10px, right 10px. Background `rgba(20,20,20,0.8)`, border-radius 8px, padding 6px 10px. Gradient bar: height 8px, border-radius 4px, `linear-gradient(to right, #4444ff, #00ccff, #00ff88, #ffff00, #ff4400, #ffffff)`. Labels below gradient: "cheap" left, "hot" right — 6px, color #aaa, monospace. Only visible when `isHeatmap` is true.

---

### Task A.6: PaintModeBanner.tsx (Agent A)

**Files:**
- Create: `apps/web/src/components/Map/PaintModeBanner.tsx`

- [ ] **Step 1: Paint mode bar + zoom badge + pixel counter**

Position absolute, top of map area. Height 22px. Background `rgba(45,37,32,0.72)` + blur(6px). Text: "✦ PAINT MODE — drag to select pixels", 7px, #faf7f2, letter-spacing 1px. Zoom badge: small pill, bg #2d2520, color #faf7f2, 7px mono, shows "8×". Pixel counter: "7 selected", 7px, #a09080. All visible only when scale >= 4. Fade in 150ms.

---

### Task A.7: WorldCanvas.tsx (Agent A)

**Files:**
- Create: `apps/web/src/components/Map/WorldCanvas.tsx`

- [ ] **Step 1: TransformWrapper composition**

Wraps: img world-map.png + PixelLayer canvas + SelectionLayer canvas in `TransformWrapper` from react-zoom-pan-pinch. Props: `minScale={1}`, `maxScale={16}`, `initialScale={1}`, `wheel={{ step: 0.5 }}`, `pinch={{ step: 5 }}`, `doubleClick={{ disabled: true }}`. Container div is 300×150 (canvas coord space). Manages paint mode state (scale >= 4 from `useTransformContext`). Passes heatmap state to PixelLayer.

---

### Task A.8: ZoomHintToast.tsx (Agent A — moved from Agent B per spec 05 ownership)

**Files:**
- Create: `apps/web/src/components/Layout/ZoomHintToast.tsx`

- [ ] **Step 1: Auto-dismiss toast**

"pinch to zoom + paint". Position absolute, bottom 68px, centered. Background `rgba(45,37,32,0.68)` + blur(8px). Color #faf7f2, 7px, letter-spacing 0.5px, border-radius 12px, padding 5px 12px. Auto-dismiss after 3s via setTimeout. Never shows again after user zooms past 4× (useRef flag, not localStorage). Props: `hasZoomedPast4x: boolean`.

---

### Task A.9: Map page — page.tsx (Agent A)

**Files:**
- Replace: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Full map screen**

Top bar: `.frosted-topbar` class (NOT `.frosted`), height 36px, position absolute, z-index 10. "MONDETO" left (11px, weight 500, letter-spacing 3px, color #2d2520). `[heatmap]` pill right: 7px, letter-spacing 0.5px, bg `rgba(200,190,175,0.25)`, border `0.5px solid #c0b8ae`, border-radius 10px, padding 3px 8px. Active heatmap pill: bg #2d2520, color #faf7f2, border #2d2520.

WorldCanvas fills remaining height (100vh - 22px status - 56px nav). ZoomHintToast (absolute, bottom 68px). PaintModeBanner shows when paint mode.

**[FIX #7] Heatmap dark mode**: When `heatmapMode=true`, set `data-heatmap="true"` on the page container. Top bar switches to `.frosted-topbar-dark`. "MONDETO" text becomes #faf7f2.

**Does NOT include BottomNav or overlays** — integration phase wires those in.

State lifted here: `usePixelMap`, `useSelection`, `heatmapMode`, `activeOverlay`, `tappedPixelId`.

- [ ] **Step 2: Expose canvas inspect ring API**

**[FIX #5]** WorldCanvas exposes `drawInspectRing(pixelId: number)` and `clearInspectRing()` via `useImperativeHandle` / forwardRef. These draw/clear a white ring (`ctx.strokeStyle='#ffffff'`, `lineWidth=0.2`, `strokeRect(x+0.05, y+0.05, 0.9, 0.9)`) on the selection canvas. Integration phase passes this ref to PixelInfoPanel.

---

### Task B.1: BottomNav.tsx (Agent B)

**Files:**
- Create: `apps/web/src/components/Layout/BottomNav.tsx`

- [ ] **Step 1: Three-item nav with SVG icons**

Height 56px. Frosted glass background. Three items: RANKS (trophy), MAP (globe), PROFILE (person). SVG paths from spec 02. Active: stroke #2d2520, label #2d2520, 16px underline bar. Inactive: stroke #a09080, label #a09080. Heatmap dark variant: active #faf7f2, inactive #666/#555. Props: `activeRoute`, `isHeatmap`. Uses Next.js `Link` for routing.

---

### Task B.2: ScreenHeader.tsx (Agent B)

**Files:**
- Create: `apps/web/src/components/Layout/ScreenHeader.tsx`

- [ ] **Step 1: Reusable 42px header**

Height 42px, background #faf7f2, border-bottom 0.5px solid #e0d8ce. Text: 10px, weight 500, letter-spacing 2px, color #2d2520. Padding 0 14px. Props: `title: string`.

---

### Task B.3: useLeaderboard hook (Agent B)

**Files:**
- Create: `apps/web/src/hooks/useLeaderboard.ts`

- [ ] **Step 1: Compute AREA/EMPIRE/HOT_PX rankings**

Takes `pixelData: PixelView[]` via parameter. Uses `useMemo` to compute:
- AREA: total pixels per owner, sorted descending
- EMPIRE: largest contiguous territory per owner via `computeEmpires` from pixelMath
- HOT_PX: most expensive single pixel per owner

Returns array of `{ rank, owner, label, color, value, unit }` per tab.

---

### Task B.5: Leaderboard components + ranks page (Agent B)

**Files:**
- Create: `apps/web/src/components/Leaderboard/LeaderboardTabs.tsx`
- Create: `apps/web/src/components/Leaderboard/LeaderboardRow.tsx`
- Create: `apps/web/src/app/ranks/page.tsx`

- [ ] **Step 1: LeaderboardTabs — tab bar**

Height 30px, three tabs: AREA | EMPIRE | HOT_PX. Active: #2d2520, 2px border-bottom. Inactive: #a09080. 7px mono, letter-spacing 0.3px.

- [ ] **Step 2: LeaderboardRow — ranked entry**

Container: flex, align-items center, gap 7px. Background #faf7f2, border 0.5px solid #e0d8ce, border-radius 9px, padding 7px 10px, margin 3px 7px.
- Rank: 9px mono, weight 500, width 14px. Colors: 1st #c9962a (gold), 2nd #8a9aaa (silver), 3rd #a07050 (bronze), 4+ #a09080.
- Color dot: 13×13px, border-radius 3px, owner's hex color.
- Name: 8px mono, color #2d2520, flex 1. Label if exists, else truncated "0xabc...d3f".
- Value: 8px mono, color #6a5f54. AREA: "2,410 px", EMPIRE: "1,200 px", HOT_PX: "4.00 USDT".

- [ ] **Step 3: Ranks page**

ScreenHeader "LEADERBOARD" + LeaderboardTabs (bg #faf7f2, border-bottom 0.5px solid #e0d8ce) + scrollable list (bg #f5f1ea, padding 5px 0, overflow-y auto) + BottomNav. Top 20 initially, "show more" button loads next 20.

Empty state (centered): globe outline SVG icon + "no claims yet" + "be the first to own the world" — 8px mono, color #a09080.

---

### Task B.6: Profile components (Agent B)

**Files:**
- Create: `apps/web/src/components/Profile/AvatarBlock.tsx`
- Create: `apps/web/src/components/Profile/StatsRow.tsx`
- Create: `apps/web/src/components/Profile/ColorPicker.tsx`

- [ ] **Step 1: AvatarBlock**

54×54px, border-radius 14px, bg = owner color, first letter of name (22px, white, weight 500). No name = "?" in #a09080. Centered horizontally, margin 12px auto 8px.

- [ ] **Step 2: StatsRow**

Three cards in row, equal width, gap 5px, margin 0 10px 8px. Card: bg #faf7f2, border 0.5px solid #e0d8ce, radius 8px, padding 5px 3px, text-align center. Number: 12px weight 500 #2d2520. Label: 6px #a09080 letter-spacing 0.5px margin-top 1px. Cards: PIXELS (count), USDT (current market value of owned pixels), RANK (position in AREA leaderboard).

- [ ] **Step 3: ColorPicker (full hex — profile page only)**

Container: bg #faf7f2, border 0.5px solid #e0d8ce, radius 8px. Label "COLOR" (6px, #a09080, letter-spacing 1px).
- Left: `<input type="color">` styled as circle: width 36px, height 36px, border-radius 50%, appearance none, border 2px solid #e0d8ce.
- Right column: preview bar (full width, height 18px, radius 5px, bg=chosen color) + hex input (8px mono, bg #f5f1ea, border 0.5px solid #e0d8ce, radius 4px, padding 3px 6px).
- Bidirectional sync between wheel and hex input.
- Presets shown as row below picker for quick selection.

---

### Task B.7: useProfile hook + profile page (Agent B)

**Files:**
- Create: `apps/web/src/hooks/useProfile.ts`
- Create: `apps/web/src/app/profile/page.tsx`

- [ ] **Step 1: useProfile hook**

Local draft state for name/url/color. Load from mock on mount if wallet connected. Save calls `updateProfile`. States: idle/saving/saved/error.

- [ ] **Step 2: Profile page with exact field specs**

ScreenHeader "PROFILE" + AvatarBlock + StatsRow + fields + ColorPicker + save + BottomNav.

**Name field:** container bg #faf7f2, border 0.5px solid #e0d8ce, radius 8px, padding 6px 9px. Label "NAME" (6px, #a09080, letter-spacing 1px, uppercase, margin-bottom 2px). Input: 9px mono, #2d2520, bg transparent, border none, width 100%. Placeholder "enter name..." color #c0b8ae. Max 32 chars.

**URL field:** same container style. Input type="url" (mobile keyboard). Value in #4a7fa5 when filled. Placeholder "https://..." color #c0b8ae. Warn but don't block if malformed.

**Save button:** full width minus 10px each side (margin 6px 10px). bg #2d2520, color #faf7f2, radius 10px, padding 9px, 8px mono, letter-spacing 1.5px.
- Validate: name non-empty, URL format check
- States: "[ SAVE ]" → "[ SAVING... ]" (bg #6a5f54, disabled) → "[ SAVED ✓ ]" (1.5s then reverts)
- On save: call updateProfile(hexToUint24(color), name, url)

**Unconnected state:** "connect wallet to save on-chain" — 7px, #a09080, text-align center, margin-top 6px. Save button triggers wallet connect flow first.

---

### Task C.1: usePixelPrice hook (Agent C)

**Files:**
- Create: `apps/web/src/hooks/usePixelPrice.ts`

- [ ] **Step 1: Debounced price calculation**

Takes `selectedIds: Set<number>`. Debounces 200ms, calls `selectionPrice`. Returns `{ totalPrice: bigint, isLoading: boolean }`.

---

### Task C.2: useBuyPixels hook (Agent C)

**Files:**
- Create: `apps/web/src/hooks/useBuyPixels.ts`

- [ ] **Step 1: TxStep state machine with balance check**

States: idle → approving → buying → confirming → success | error. `execute(ids, color, label, url)` triggers flow. In mock mode: simulate approve delay + buyPixels call. Returns `{ execute, step, txHash, error, reset, insufficientBalance }`.

**[FIX #6] Balance check**: Before executing, check if user's USDT balance >= totalPrice. In mock mode: simulate a balance of 5.00 USDT (adjustable). If insufficient: set `insufficientBalance = true`, do NOT proceed. The SelectionDrawer uses this to: (a) show "balance: X.XX USDT" below breakdown, (b) disable buy button, (c) show "insufficient balance" error text in red.

---

### Task C.3: DimLayer.tsx (Agent C)

**Files:**
- Create: `apps/web/src/components/Overlays/DimLayer.tsx`

- [ ] **Step 1: Reusable overlay**

`rgba(45,37,32,0.28)`, full screen, z-index 20. Fade transition 250ms. Tapping dismisses (calls `onDismiss` prop) unless `locked` prop is true (during tx). Pointer-events: auto when visible, none when hidden.

---

### Task C.4: TxProgress.tsx + SuccessState.tsx (Agent C)

**Files:**
- Create: `apps/web/src/components/Overlays/TxProgress.tsx`
- Create: `apps/web/src/components/Overlays/SuccessState.tsx`

- [ ] **Step 1: TxProgress — three-step indicator**

Flex column, gap 8px, padding 14px. Three steps:

Done step:
- Circle: 16px, border-radius 50%, background #2d6a4f, "✓" 9px white centered
- Label: 8px mono, color #2d6a4f, letter-spacing 0.5px

Active step:
- Circle: 16px, border-radius 50%, border 1.5px solid #2d2520, border-top-color transparent
- CSS animation: `spin 0.8s linear infinite` (use `.animate-spin-slow` class)
- Label: 8px mono, color #2d2520, letter-spacing 0.5px

Pending step:
- Circle: 16px, border-radius 50%, border 1.5px solid #e0d8ce
- Label: 8px mono, color #c0b8ae, letter-spacing 0.5px

Steps: "USDT approved" → "buying land..." → "confirmed"

Processing button: "[ PROCESSING... ]", bg #6a5f54, same dimensions as buy button, pointer-events none.

- [ ] **Step 2: SuccessState**

Success icon:
- Circle: 44px, border-radius 50%, background #2d6a4f, margin 0 auto 10px
- "✓": 20px, white, centered

Text:
- "LAND CLAIMED": 11px, weight 500, color #2d2520, letter-spacing 1px, text-align center
- "N pixels now yours": 8px, color #a09080, margin-top 4px, text-align center

Receipt card:
- Background #f5f1ea, border 0.5px solid #e0d8ce, border-radius 10px, padding 10px 12px, margin 0 14px
- Two rows (flex, justify-content space-between):
  - PAID: label 7px #a09080 letter-spacing 1px, value 9px #2d2520
  - TX: label 7px #a09080, value 9px color #4a7fa5 (link style, truncated hash)

Done button: "[ DONE ]", bg #2d6a4f, color #faf7f2, border-radius 11px, padding 10px, 9px mono, letter-spacing 1.5px. On click: dismiss drawer, clear selection, refresh canvas (optimistic update: remove yellow highlights, paint bought pixels with user color).

---

### Task C.5: SelectionDrawer.tsx (Agent C)

**Files:**
- Create: `apps/web/src/components/Overlays/SelectionDrawer.tsx`

- [ ] **Step 1: SelectionDrawer — bottom sheet buy flow (all values from spec 04)**

**Animation:** `transform: translateY(100%)` hidden → `translateY(0)` shown. Transition: `300ms cubic-bezier(0.32, 0.72, 0, 1)`. Z-index 30.

**Drag handle:** width 32px, height 3px, border-radius 2px, background #c0b8ae, margin 10px auto 0.

**Summary header:** padding 8px 14px, border-bottom 0.5px solid #f0ebe3.
- Left: "SELECTED" label (6px, #a09080, letter-spacing 1px) + "8 pixels" value (13px, weight 500, #2d2520)
- Right: "TOTAL COST" label (same) + "0.22 USDT" value (same)
- Far right: "✕ clear" button (7px, #a09080, border 0.5px solid #e0d8ce, radius 8px, padding 4px 8px)

**Breakdown section:** padding 6px 14px 0. Label "BREAKDOWN" (6px, #a09080, letter-spacing 1px, margin-bottom 5px).
- Each row: flex, align-items center, gap 7px, padding 5px 0, border-bottom 0.5px solid #f5f0e8 (except last)
- Unowned: dot 12×12px radius 3px border 0.5px dashed #c0b8ae, name "unowned" 8px #a09080
- Owned: dot 12×12px radius 3px solid fill=owner color, name 8px mono #2d2520 (label or "0xabc...d3f"), sub-address 6px #a09080, pixel count 7px #a09080 "2 px", price 8px mono #2d2520 weight 500

**[FIX #2] Your Profile section (COMPACT — swatches not full picker):**
- Padding 8px 14px 0, border-top 0.5px solid #f0ebe3. Label "YOUR PROFILE".
- Only shown if wallet connected. If not connected, skip and show buy button only.
- Mini fields: bg #f5f1ea, border 0.5px solid #e0d8ce, radius 7px, padding 5px 8px. Label 6px #a09080 letter-spacing 1px. Input 9px mono #2d2520 bg transparent border none.
- Color strip: 7 preset swatches (#e74c3c #e67e22 #f1c40f #2ecc71 #1abc9c #3498db #9b59b6), each 18×18px, radius 4px. Selected: outline 2px solid #2d2520, outline-offset 1px.
- Pre-fill from saved profile if exists.

**Buy button:** margin 8px 14px 0. bg #2d2520, color #faf7f2, border-radius 11px, padding 10px, 9px mono, letter-spacing 1.5px. Text: `[ BUY ALL — {total} USDT ]`.

**[FIX #6] Balance display:** If `insufficientBalance` is true: show "balance: X.XX USDT" (7px, #a09080) below breakdown, disable buy button (bg #6a5f54, pointer-events none), show "insufficient balance" in #e74c3c.

**States:** Pre-purchase → TxProgress (replace body) → SuccessState (replace body). Auto-opens after 800ms of no pointer activity when selection > 0.

---

### Task C.6: PixelInfoPanel.tsx (Agent C)

**Files:**
- Create: `apps/web/src/components/Overlays/PixelInfoPanel.tsx`

- [ ] **Step 1: Pixel info panel — tap-to-inspect (all values from spec 04)**

Triggered by tapping owned pixel in pan mode (scale < 4). Slide-up from bottom, same animation as drawer.

**Drag handle:** same as drawer (32×3px, #c0b8ae, 2px radius).

**Owner row:** padding 8px 14px 10px, border-bottom 0.5px solid #f0ebe3.
- Avatar: 40×40px (NOT 54 like profile page), border-radius 11px, bg=owner color, initial letter 16px white weight 500
- Name: 11px, weight 500, color #2d2520
- Address: 7px, color #a09080, letter-spacing 0.5px
- Right side: "SALE #N" label (6px #a09080) + saleCount value (8px #2d2520)

**Label field:** padding 7px 14px, border-bottom 0.5px solid #f0ebe3. "LABEL" (6px, #a09080, letter-spacing 1px). Value: 9px mono #2d2520. If no label: show "—".

**URL field:** same padding/border. Value: 9px, color #4a7fa5. Append " →". Tapping opens URL in new tab.

**Price cards row:** padding 8px 14px, flex row, gap 8px. Three equal cards: bg #f5f1ea, border 0.5px solid #e0d8ce, radius 8px, padding 6px 8px.
- Card label: 6px #a09080 letter-spacing 1px margin-bottom 2px
- Card value: 12px weight 500 #2d2520
- Card sub: 6px #a09080 margin-top 1px
- BUY PRICE: currentPrice formatted as USDT
- PREV SALE: currentPrice / 2
- SOLD: saleCount as "3×"

**Buy button:** margin 2px 14px 0. "[ BUY THIS PIXEL ]" — same style as main buy button (bg #2d2520, color #faf7f2, radius 11px, padding 10px, 9px mono, letter-spacing 1.5px). On click: pre-fill selection with this pixel ID, open SelectionDrawer.

**Note below button:** "previous owner gets {price} USDT instantly" — 7px, #a09080, text-align center, margin-top 5px.

**[FIX #5] White ring on canvas:** When panel is open, call `drawInspectRing(pixelId)` on the canvas ref (provided via props, wired in integration). When panel closes, call `clearInspectRing()`.

---

## Phase 2: Integration (Sequential)

### Task I.1: Wire BottomNav into all pages

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/ranks/page.tsx`
- Modify: `apps/web/src/app/profile/page.tsx`

- [ ] **Step 1: Add BottomNav to map page**

Import BottomNav, add at bottom with `activeRoute="/"` and `isHeatmap={heatmapMode}`.

- [ ] **Step 2: Verify ranks and profile pages have BottomNav**

Should already be included by Agent B. Verify `activeRoute` is set correctly.

---

### Task I.2: Wire overlays into map page

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Add DimLayer + SelectionDrawer + PixelInfoPanel**

Import overlay components. Wire: `usePixelPrice(selectedIds)`, `useBuyPixels()`. DimLayer shows when drawer or info panel is open (z-index 20). Overlays at z-index 30. SelectionDrawer receives selection state, price, buy handler, profile data. PixelInfoPanel receives tapped pixel data.

- [ ] **Step 2: Wire canvas inspect ring to PixelInfoPanel**

Pass WorldCanvas ref to PixelInfoPanel. When panel opens: call `drawInspectRing(pixelId)`. When closes: call `clearInspectRing()`. Wire `onInspectPixel` from SelectionLayer (long-press) to open PixelInfoPanel.

- [ ] **Step 3: Wire selection hint pill**

When selection > 0 and drawer closed: show floating pill at position absolute, top 80px, left 14px. Background `rgba(45,37,32,0.65)` + blur(6px). Text "N selected — tap to review" (7px, #faf7f2, letter-spacing 0.5px). Tapping reopens drawer. Persists until selection cleared.

- [ ] **Step 4: Wire auto-open drawer**

After 800ms of no pointer activity, if selection > 0 and drawer is closed, auto-open drawer. Use a timer ref that resets on each pointer event.

---

### Task I.3: Wire useLeaderboard into ranks page

**Files:**
- Modify: `apps/web/src/app/ranks/page.tsx`

- [ ] **Step 1: Connect data**

Ranks page calls `getAllPixels()` independently (mock shares session state). Pass result to `useLeaderboard`. Wire tab switching.

---

### Task I.4: Wire useProfile into profile page

**Files:**
- Modify: `apps/web/src/app/profile/page.tsx`

- [ ] **Step 1: Connect wallet status**

Use `useAccount()` from wagmi for address. Load profile from mock. Wire save flow. Show unconnected state when no wallet.

---

### Task I.5: Smoke test all routes

- [ ] **Step 1: Run dev server**

```bash
pnpm dev --filter web
```

- [ ] **Step 2: Verify map page**

- Cream background, IBM Plex Mono
- World map PNG renders
- Demo pixel clusters visible on canvas
- Zoom/pan works
- Paint mode activates at 4×
- Painting selects pixels (yellow highlights)
- Heatmap toggle works (dark mode + circles)

- [ ] **Step 3: Verify buy flow**

- Paint pixels → drawer auto-opens after 800ms
- Drawer shows selection count, price, breakdown
- Buy button triggers tx progress (approve → buy → confirm → success)
- Success: pixels update to user's color, selection clears

- [ ] **Step 4: Verify leaderboard**

- Three tabs work (AREA/EMPIRE/HOT_PX)
- Demo data shows ranked entries
- After buying pixels, new ownership reflected

- [ ] **Step 5: Verify profile**

- Avatar + stats render
- Name/URL/color fields work
- Save flow works
- Color picker bidirectional sync

- [ ] **Step 6: Verify navigation**

- BottomNav routes between all three pages
- Active state highlights correctly
- Heatmap mode propagates to nav styling

---

## Files NOT Touched

- `src/components/ui/*` — shadcn, frozen
- `src/components/wallet-provider.tsx` — keep as-is
- `src/components/connect-button.tsx` — keep (hides in MiniPay)
- `src/components/user-balance.tsx` — keep (may use in profile)
- `src/components/navbar.tsx` — keep file, just not rendered
