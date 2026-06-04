/**
 * Per-map land masks, indexed by slug.
 *
 * Each entry is a pre-expanded Uint8Array (1 = land, 0 = water) plus the
 * map's grid width/height/land count. The masks are generated from
 * apps/contracts/map/*.json by `apps/web/scripts/build-masks.mjs`; re-run
 * the script when the SC dev regenerates a continent.
 */

import * as worldData  from '@/data/masks/world'
import * as africaData from '@/data/masks/africa'
import * as europeData from '@/data/masks/europe'
import type { MapSlug } from './contracts'

export interface MaskData {
  width: number
  height: number
  landCount: number
  mask: Uint8Array
}

const REGISTRY: Partial<Record<MapSlug, MaskData>> = {
  world: {
    width: worldData.WIDTH,
    height: worldData.HEIGHT,
    landCount: worldData.LAND_COUNT,
    mask: worldData.LAND_MASK,
  },
  africa: {
    width: africaData.WIDTH,
    height: africaData.HEIGHT,
    landCount: africaData.LAND_COUNT,
    mask: africaData.LAND_MASK,
  },
  europe: {
    width: europeData.WIDTH,
    height: europeData.HEIGHT,
    landCount: europeData.LAND_COUNT,
    mask: europeData.LAND_MASK,
  },
}

/**
 * Look up the land mask data for a given map slug.
 *
 * Throws when the slug isn't registered. Add the SC dev's next continent
 * here once they ship its deploy + JSON.
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
