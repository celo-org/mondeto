import { WIDTH, HEIGHT } from '@/constants/map'

export function pixelId(x: number, y: number): number {
  return y * WIDTH + x
}

// (lat, lng) → grid (x, y) on the contract's land mask.
//
// The mask is built by `apps/contracts/map/convert_map.py`, which renders
// the Equal Earth SVG (`Blank_world_map_Equal_Earth_projection.svg`, viewBox
// 360×175.218) at the contract height (100 → ~205 px wide), then crops
// empty water-only columns — currently ~31 cols from the left (Pacific west)
// and ~4 from the right (Pacific east) — leaving the 170-wide grid the
// contract stores.
//
// So a correct geo-to-pixel mapping must:
//   1. Compute the Equal Earth forward projection (Šavrič et al. 2018).
//   2. Place the point in the un-cropped rendered image (width SVG_RENDER_WIDTH).
//   3. Shift left by SVG_LEFT_CROP to land on the cropped mask's pixels.
//
// Calibrated against 25 well-known cities (Lisbon, London, Paris, Cairo,
// Sydney, Tokyo, NYC, SaoPaulo, Beijing, etc.) — 24/25 land on land pixels;
// the only miss is Cape Town, which sits on a single-pixel coastline.
//
// Equal Earth polynomial coefficients + auxiliary scalar from the paper.
const EE_A1 = 1.340264
const EE_A2 = -0.081106
const EE_A3 = 0.000893
const EE_A4 = 0.003796
const EE_M = Math.sqrt(3) / 2
const EE_EY_MAX = 1.3169339780812332
const EE_EX_MAX = 2.7062853725620867

// SVG → mask geometry. The SVG viewBox is 360 wide × 175.218 tall; render
// at the contract HEIGHT preserves the aspect ratio.
const SVG_VIEWBOX_RATIO = 360 / 175.218
const SVG_RENDER_WIDTH = Math.round(HEIGHT * SVG_VIEWBOX_RATIO) // 205 at H=100
// Empty-column crop the generator removed from the left edge of the
// rendered image. Mirrors the actual mask layout — re-derive this whenever
// the source SVG, the rendered height, or the crop logic in
// `convert_map.py` changes.
const SVG_LEFT_CROP = 31

export function geoToPixel(latDeg: number, lngDeg: number): { x: number; y: number } {
  const lat = Math.max(-90, Math.min(90, latDeg))
  const lng = Math.max(-180, Math.min(180, lngDeg))
  const phi = (lat * Math.PI) / 180
  const lambda = (lng * Math.PI) / 180

  // Equal Earth forward.
  const theta = Math.asin(EE_M * Math.sin(phi))
  const t2 = theta * theta
  const t6 = t2 * t2 * t2
  const ey = theta * (EE_A1 + EE_A2 * t2 + t6 * (EE_A3 + EE_A4 * t2))
  const ex =
    (lambda * Math.cos(theta)) /
    (EE_M * (EE_A1 + 3 * EE_A2 * t2 + t6 * (7 * EE_A3 + 9 * EE_A4 * t2)))

  // Place the point in the un-cropped rendered image, then shift left
  // by the crop offset to get the cropped-mask column. y has no crop
  // (we render at exactly HEIGHT, and pixel-y=0 is north).
  const xRendered = ((ex + EE_EX_MAX) / (2 * EE_EX_MAX)) * (SVG_RENDER_WIDTH - 1)
  const x = Math.round(xRendered) - SVG_LEFT_CROP
  const y = Math.round(((EE_EY_MAX - ey) / (2 * EE_EY_MAX)) * (HEIGHT - 1))

  return {
    x: Math.max(0, Math.min(WIDTH - 1, x)),
    y: Math.max(0, Math.min(HEIGHT - 1, y)),
  }
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
