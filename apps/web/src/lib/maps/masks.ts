/**
 * Per-map land masks, indexed by slug.
 *
 * Each entry is a pre-expanded Uint8Array (1 = land, 0 = water) plus the
 * map's grid width/height/land count. The masks are generated from
 * apps/contracts/map/*.json by `apps/web/scripts/build-masks.mjs`; re-run
 * the script (`pnpm -F web build:masks`) when the SC dev regenerates a map.
 */

import * as worldData        from '@/data/masks/world'
import * as africaData       from '@/data/masks/africa'
import * as antarcticaData   from '@/data/masks/antarctica'
import * as asiaData         from '@/data/masks/asia'
import * as europeData       from '@/data/masks/europe'
import * as northAmericaData from '@/data/masks/north-america'
import * as oceaniaData      from '@/data/masks/oceania'
import * as southAmericaData from '@/data/masks/south-america'
import type { MapSlug } from './contracts'

export interface MaskData {
  width: number
  height: number
  landCount: number
  mask: Uint8Array
}

function toMaskData(d: {
  WIDTH: number
  HEIGHT: number
  LAND_COUNT: number
  LAND_MASK: Uint8Array
}): MaskData {
  return { width: d.WIDTH, height: d.HEIGHT, landCount: d.LAND_COUNT, mask: d.LAND_MASK }
}

const REGISTRY: Partial<Record<MapSlug, MaskData>> = {
  world: toMaskData(worldData),
  africa: toMaskData(africaData),
  antarctica: toMaskData(antarcticaData),
  asia: toMaskData(asiaData),
  europe: toMaskData(europeData),
  'north-america': toMaskData(northAmericaData),
  oceania: toMaskData(oceaniaData),
  'south-america': toMaskData(southAmericaData),
}

/**
 * Look up the land mask data for a given map slug.
 *
 * Throws when the slug isn't registered — add the SC dev's next map here
 * once they ship its deploy + JSON.
 */
export function getMaskData(slug: MapSlug): MaskData {
  const data = REGISTRY[slug]
  if (!data) {
    throw new Error(`getMaskData: no mask registered for slug "${slug}"`)
  }
  return data
}

/** Slugs we have masks for (i.e. that can be rendered today). */
export function getMaskSlugs(): MapSlug[] {
  return Object.keys(REGISTRY) as MapSlug[]
}
