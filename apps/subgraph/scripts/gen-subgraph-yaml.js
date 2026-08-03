/**
 * Regenerate subgraph.yaml from the map registry.
 *
 * The eight maps are separate UUPS proxies of the same implementation, so the
 * manifest is eight near-identical dataSources. Generating it keeps the
 * addresses/ids/handlers in one place. KEEP the `maps` list below in sync with
 * apps/web/src/lib/maps/contracts.ts (the source of truth).
 *
 * Usage: node scripts/gen-subgraph-yaml.js
 */
const fs = require('fs')
const path = require('path')

const maps = [
  [0, 'world', '0xA8cFC1B4365518f56954382B6Fab25a5382f5C49'],
  [1, 'africa', '0x8e70ada33714C3F8f35182b781C63449c5e079b7'],
  [2, 'asia', '0x9b8DC1e200A21A97963948A758D9fc4300310661'],
  [3, 'europe', '0xDfB39B4d8896F196c13DBc4aC2dBDc3175Fcd767'],
  [4, 'north-america', '0x5bf55b88220DF9500A33962777B9d48945443106'],
  [5, 'south-america', '0x822e332ac5f0c760257C7204154BA5eaF7A06586'],
  [6, 'oceania', '0x693CE5fBC50c0aCbd8B3333ad7DcaAb1802A4773'],
  [7, 'antarctica', '0x66C6eF911B3e33B35558956a0E636F33E16063c4'],
]
// WORLD proxy deploy block; all eight proxies were deployed in 71123574-71123597.
const START = 71123574
const ENTITIES = [
  'Pixel', 'Owner', 'OwnerMapStat', 'PurchaseBatch', 'Purchase',
  'OwnerProfile', 'Token', 'MapStat', 'ActiveBuyer',
]
const HANDLERS = [
  ['PixelsPurchased(indexed address,indexed address,uint256[],uint256)', 'handlePixelsPurchased'],
  ['ProfileUpdated(indexed address,uint24,bytes,bytes)', 'handleProfileUpdated'],
  ['AcceptedTokenAdded(indexed address,uint8)', 'handleAcceptedTokenAdded'],
  ['AcceptedTokenRemoved(indexed address)', 'handleAcceptedTokenRemoved'],
  ['FeeRateUpdated(uint256)', 'handleFeeRateUpdated'],
]

let out = ''
out += '# Goldsky subgraph manifest for the Mondeto pixel maps on Celo mainnet.\n'
out += '#\n'
out += '# All eight maps are separate UUPS proxies of the same Mondeto implementation,\n'
out += '# so every dataSource shares one ABI + one mapping file. The frontend mapId is\n'
out += '# injected per contract via dataSource.context (read in the mapping with\n'
out += '# dataSource.context().getI32("mapId")).\n'
out += '#\n'
out += '# KEEP ADDRESSES IN SYNC with apps/web/src/lib/maps/contracts.ts (source of truth).\n'
out += '# Regenerate with: node scripts/gen-subgraph-yaml.js\n'
out += 'specVersion: 1.0.0\n'
out += 'description: Ownership, purchase history, earn/spend and analytics for Mondeto on Celo\n'
out += 'schema:\n  file: ./schema.graphql\n'
out += 'dataSources:\n'
for (const [id, slug, addr] of maps) {
  out += `  - kind: ethereum\n`
  out += `    name: Mondeto${id}\n`
  out += `    network: celo\n`
  out += `    context:\n      mapId:\n        type: Int\n        data: ${id}\n`
  out += `    source:\n      address: "${addr}" # ${id} ${slug}\n      abi: Mondeto\n      startBlock: ${START}\n`
  out += `    mapping:\n      kind: ethereum/events\n      apiVersion: 0.0.9\n      language: wasm/assemblyscript\n      file: ./src/mapping.ts\n`
  out += `      entities:\n`
  for (const e of ENTITIES) out += `        - ${e}\n`
  out += `      abis:\n        - name: Mondeto\n          file: ./abis/Mondeto.json\n`
  out += `      eventHandlers:\n`
  for (const [ev, h] of HANDLERS) out += `        - event: ${ev}\n          handler: ${h}\n`
}

fs.writeFileSync(path.join(__dirname, '..', 'subgraph.yaml'), out)
console.log('wrote subgraph.yaml')
