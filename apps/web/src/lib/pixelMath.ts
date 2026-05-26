import { WIDTH, HEIGHT } from '@/constants/map'

export function pixelId(x: number, y: number): number {
  return y * WIDTH + x
}

// (lat, lng) → grid (x, y) on the Equal Earth projected world map.
//
// The on-chain land mask is generated with the Equal Earth projection
// (Šavrič et al. 2018), so a naive equirectangular mapping lands several
// pixels off true land at temperate latitudes — about 7 rows south for a
// Portugal-latitude point on the 170×100 grid, dropping the geo auto-zoom
// into the ocean. Use the published forward formula so the projection
// matches what the contract uses.
//
// Polynomial coefficients + auxiliary scalar from the original paper.
const EE_A1 = 1.340264
const EE_A2 = -0.081106
const EE_A3 = 0.000893
const EE_A4 = 0.003796
const EE_M = Math.sqrt(3) / 2
// Half-extents of the projection at the world bounds: ey peaks at
// (±90°, 0), ex peaks at (0°, ±180°). Computed once from the formula.
const EE_EY_MAX = 1.3169339780812332
const EE_EX_MAX = 2.7062853725620867

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

  // Map projection coords into the WIDTH×HEIGHT pixel grid. y is flipped
  // because pixel-y=0 is the top of the grid (north pole) and ey is
  // positive going north.
  const x = Math.round(((ex + EE_EX_MAX) / (2 * EE_EX_MAX)) * (WIDTH - 1))
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
