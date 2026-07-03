/**
 * Map registry mirror for the indexer.
 *
 * KEEP IN SYNC with apps/web/src/lib/maps/contracts.ts (the frontend
 * registry) and with the address list in config.yaml. The indexer package is
 * standalone (Envio bundles it independently of the web app), so the
 * addresses are duplicated here rather than imported across packages.
 *
 * All eight proxies live on Celo mainnet (42220).
 */

export interface IndexedMap {
  id: number
  slug: string
  address: string
}

export const MAPS: readonly IndexedMap[] = [
  { id: 0, slug: 'world', address: '0xA8cFC1B4365518f56954382B6Fab25a5382f5C49' },
  { id: 1, slug: 'africa', address: '0x8e70ada33714C3F8f35182b781C63449c5e079b7' },
  { id: 2, slug: 'asia', address: '0x9b8DC1e200A21A97963948A758D9fc4300310661' },
  { id: 3, slug: 'europe', address: '0xDfB39B4d8896F196c13DBc4aC2dBDc3175Fcd767' },
  { id: 4, slug: 'north-america', address: '0x5bf55b88220DF9500A33962777B9d48945443106' },
  { id: 5, slug: 'south-america', address: '0x822e332ac5f0c760257C7204154BA5eaF7A06586' },
  { id: 6, slug: 'oceania', address: '0x693CE5fBC50c0aCbd8B3333ad7DcaAb1802A4773' },
  { id: 7, slug: 'antarctica', address: '0x66C6eF911B3e33B35558956a0E636F33E16063c4' },
] as const

const MAP_ID_BY_ADDRESS: ReadonlyMap<string, number> = new Map(
  MAPS.map((m) => [m.address.toLowerCase(), m.id]),
)

/**
 * Resolve an emitting contract address (event.srcAddress) to the frontend
 * mapId. Returns undefined for addresses not in the registry — handlers
 * should skip those logs (can only happen if config.yaml and this file
 * drift apart).
 */
export function mapIdForAddress(address: string): number | undefined {
  return MAP_ID_BY_ADDRESS.get(address.toLowerCase())
}
