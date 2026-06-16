/**
 * Pure pixel-grid math helpers. Per-map width/height are passed in
 * because different continents deploy at different grid sizes (world
 * 170x100, africa 127x134, europe 160x107). Callers should source the
 * dims from `useCurrentMapMeta()` for the active map.
 */

export function pixelId(x: number, y: number, width: number): number {
  return y * width + x
}

// (lat, lng) → grid (x, y) on the WORLD-map Equal Earth land mask.
//
// The mask is built by `apps/contracts/map/convert_map.py`, which renders
// the Equal Earth SVG (`Blank_world_map_Equal_Earth_projection.svg`, viewBox
// 360×175.218) at the contract height (100 → ~205 px wide), then crops
// empty water-only columns — currently ~31 cols from the left (Pacific west)
// and ~4 from the right (Pacific east) — leaving the 170-wide grid the
// contract stores.
//
// Continent maps use a different projection per the `generate_continents.py`
// generator (equirectangular with per-continent center-longitude and
// cos(lat) aspect correction; azimuthal-equidistant for Antarctica), so
// this helper only matches the world map. Geo-zoom on continents needs
// a separate per-slug projection — out of scope for this branch.
//
// Calibrated against 25 well-known cities (Lisbon, London, Paris, Cairo,
// Sydney, Tokyo, NYC, SaoPaulo, Beijing, etc.) — 24/25 land on land pixels;
// the only miss is Cape Town, which sits on a single-pixel coastline.

const EE_A1 = 1.340264
const EE_A2 = -0.081106
const EE_A3 = 0.000893
const EE_A4 = 0.003796
const EE_M = Math.sqrt(3) / 2
const EE_EY_MAX = 1.3169339780812332
const EE_EX_MAX = 2.7062853725620867

// World-map grid dimensions baked into the Equal Earth calibration.
const WORLD_WIDTH = 170
const WORLD_HEIGHT = 100
const SVG_VIEWBOX_RATIO = 360 / 175.218
const SVG_RENDER_WIDTH = Math.round(WORLD_HEIGHT * SVG_VIEWBOX_RATIO) // 205
const SVG_LEFT_CROP = 31

export function geoToPixel(latDeg: number, lngDeg: number): { x: number; y: number } {
  const lat = Math.max(-90, Math.min(90, latDeg))
  const lng = Math.max(-180, Math.min(180, lngDeg))
  const phi = (lat * Math.PI) / 180
  const lambda = (lng * Math.PI) / 180

  const theta = Math.asin(EE_M * Math.sin(phi))
  const t2 = theta * theta
  const t6 = t2 * t2 * t2
  const ey = theta * (EE_A1 + EE_A2 * t2 + t6 * (EE_A3 + EE_A4 * t2))
  const ex =
    (lambda * Math.cos(theta)) /
    (EE_M * (EE_A1 + 3 * EE_A2 * t2 + t6 * (7 * EE_A3 + 9 * EE_A4 * t2)))

  const xRendered = ((ex + EE_EX_MAX) / (2 * EE_EX_MAX)) * (SVG_RENDER_WIDTH - 1)
  const x = Math.round(xRendered) - SVG_LEFT_CROP
  const y = Math.round(((EE_EY_MAX - ey) / (2 * EE_EY_MAX)) * (WORLD_HEIGHT - 1))

  return {
    x: Math.max(0, Math.min(WORLD_WIDTH - 1, x)),
    y: Math.max(0, Math.min(WORLD_HEIGHT - 1, y)),
  }
}

export function idToXY(id: number, width: number): { x: number; y: number } {
  return { x: id % width, y: Math.floor(id / width) }
}

export function screenToPixel(
  clientX: number,
  clientY: number,
  canvasEl: HTMLCanvasElement,
  scale: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const rect = canvasEl.getBoundingClientRect()
  const canvasX = (clientX - rect.left) / scale
  const canvasY = (clientY - rect.top) / scale
  const x = Math.floor(canvasX)
  const y = Math.floor(canvasY)
  if (x < 0 || x >= width || y < 0 || y >= height) return null
  return { x, y }
}

export function rectToIds(
  x1: number, y1: number,
  x2: number, y2: number,
  width: number, height: number,
): number[] {
  const minX = Math.max(0, Math.min(x1, x2))
  const maxX = Math.min(width - 1, Math.max(x1, x2))
  const minY = Math.max(0, Math.min(y1, y2))
  const maxY = Math.min(height - 1, Math.max(y1, y2))
  const ids: number[] = []
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      ids.push(pixelId(x, y, width))
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
  width: number,
  height: number,
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
      const { x, y } = idToXY(current, width)
      if (x > 0) queue.push(pixelId(x - 1, y, width))
      if (x < width - 1) queue.push(pixelId(x + 1, y, width))
      if (y > 0) queue.push(pixelId(x, y - 1, width))
      if (y < height - 1) queue.push(pixelId(x, y + 1, width))
    }
    empires.push(empire)
  }
  return empires
}
