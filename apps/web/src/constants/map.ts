// Grid dimensions — must match smart contract
export const WIDTH = 170
export const HEIGHT = 100
export const TOTAL_PIXELS = WIDTH * HEIGHT // 17,000

// Contract pricing (USDT 6 decimals)
export const INITIAL_PRICE = 100000n // 0.10 USDT
export const MIN_PRICE = 1n          // 0.000001 USDT
export const HALVING_TIME = 182n * 24n * 60n * 60n // 182 days in seconds

// Rendering
export const TILE_GAP = 0.08
export const TILE_RADIUS = 0.12
export const DOT_RADIUS = 0.35 // radius of land dots in canvas units
export const PAINT_SCALE = 4
export const MAX_SELECT = 100 // contract gas limit ~100 pixels per tx

export const COLOR_PRESETS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#1abc9c', '#3498db', '#9b59b6', '#e91e63',
  '#ff5722', '#00bcd4', '#8bc34a', '#f0f0f0',
] as const

// Default-color palette for new profiles. Curated to skip anything that
// blends into the map: ocean-blue (#71BBFF and any blue/cyan near it) and
// land-cream (#F0E7D6). The user can still pick any color via the picker
// — this is just the seed we use until they save one.
export const PROFILE_DEFAULT_PALETTE = [
  '#e74c3c', // red
  '#e67e22', // orange
  '#f1c40f', // yellow
  '#2ecc71', // green
  '#1abc9c', // teal — distinct enough from ocean blue
  '#9b59b6', // purple
  '#e91e63', // pink
  '#ff5722', // deep orange
  '#8bc34a', // light green
  '#B430FF', // brand purple
] as const

export const DRAWER_SWATCHES = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#1abc9c', '#3498db', '#9b59b6',
] as const

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Contract addresses are in src/lib/contract.ts (auto-generated)
