#!/usr/bin/env node
/**
 * Generate per-map land-mask data files for the FE.
 *
 * Source of truth: apps/contracts/map/*.json (committed by the SC dev).
 * Output: apps/web/src/data/masks/{slug}.ts — pre-expanded Uint8Array.
 *
 * Why a build step instead of `import mask from '...json'`: the contract
 * mask is a uint256[] (bit-packed, 256 pixels per word). JSON.parse coerces
 * to f64, which silently corrupts every word past 2^53. We read the JSON
 * as raw text and parse the digit-strings with BigInt to preserve every bit.
 *
 * Re-run after the SC dev regenerates continent masks:
 *   node apps/web/scripts/build-masks.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')

const SOURCES = [
  { slug: 'world',         path: 'apps/contracts/map/land_mask.json' },
  { slug: 'africa',        path: 'apps/contracts/map/continents/africa.json' },
  { slug: 'antarctica',    path: 'apps/contracts/map/continents/antarctica.json' },
  { slug: 'asia',          path: 'apps/contracts/map/continents/asia.json' },
  { slug: 'europe',        path: 'apps/contracts/map/continents/europe.json' },
  { slug: 'north-america', path: 'apps/contracts/map/continents/north-america.json' },
  { slug: 'oceania',       path: 'apps/contracts/map/continents/oceania.json' },
  { slug: 'south-america', path: 'apps/contracts/map/continents/south-america.json' },
]

/**
 * Parse a JSON file whose `mask` array contains uint256 integers (which
 * JSON.parse would lossily coerce to f64). Hand-roll the parse for the
 * `width`, `height`, and `mask` keys so the mask words land in BigInt.
 */
function parseMaskJson(raw) {
  const widthMatch  = raw.match(/"width"\s*:\s*(\d+)/)
  const heightMatch = raw.match(/"height"\s*:\s*(\d+)/)
  const maskMatch   = raw.match(/"mask"\s*:\s*\[([^\]]+)\]/)
  if (!widthMatch || !heightMatch || !maskMatch) {
    throw new Error('mask JSON missing width/height/mask')
  }
  const width = Number(widthMatch[1])
  const height = Number(heightMatch[1])
  const mask = maskMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => BigInt(s))
  return { width, height, mask }
}

function expandMask(width, height, words) {
  const total = width * height
  const out = new Uint8Array(total)
  let landCount = 0
  for (let id = 0; id < total; id++) {
    const wordIdx = id >> 8
    const bitIdx = BigInt(id & 0xff)
    if (wordIdx < words.length && ((words[wordIdx] >> bitIdx) & 1n) === 1n) {
      out[id] = 1
      landCount++
    }
  }
  return { mask: out, landCount }
}

function formatTs(slug, width, height, landCount, mask) {
  const total = width * height
  const pct = ((100 * landCount) / total).toFixed(1)
  const rows = []
  for (let y = 0; y < height; y++) {
    const start = y * width
    rows.push(Array.from(mask.slice(start, start + width)).join(','))
  }
  const body = rows.join(',\n')
  return `// Auto-generated from apps/contracts/map (do not edit by hand).
// Re-run: node apps/web/scripts/build-masks.mjs
// Map: ${slug} — ${width}x${height} grid, ${landCount}/${total} land (${pct}%)

export const WIDTH = ${width}
export const HEIGHT = ${height}
export const LAND_COUNT = ${landCount}
export const LAND_MASK = new Uint8Array([
${body}
])
`
}

for (const { slug, path } of SOURCES) {
  const raw = readFileSync(resolve(repoRoot, path), 'utf8')
  const { width, height, mask: words } = parseMaskJson(raw)
  const { mask, landCount } = expandMask(width, height, words)
  const ts = formatTs(slug, width, height, landCount, mask)
  const out = resolve(repoRoot, `apps/web/src/data/masks/${slug}.ts`)
  writeFileSync(out, ts)
  console.log(`wrote ${out} (${width}x${height}, ${landCount} land)`)
}
