import { INITIAL_PRICE, ZERO_ADDRESS } from '@/constants/map'
import { pixelId } from './pixelMath'
import { isLandXY } from './landMask'
import { getMaskData } from './maps/masks'

export const MOCK_MODE = true

// Mock data only models the world map; per-continent contracts live
// on-chain and bypass this module entirely. Keep the world dims and mask
// local so this stays a self-contained fixture.
const { width: WIDTH, height: HEIGHT, mask: WORLD_MASK } = getMaskData('world')

// Deterministic PRNG
function seededRng(seed: number) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

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

// Price doubles per sale
const PRICE_DOUBLE = 2n

function initState() {
  if (pixelState.length > 0) return
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      pixelState.push({
        owner: ZERO_ADDRESS,
        saleCount: 0,
        currentPrice: INITIAL_PRICE,
        color: '',
        label: '',
        url: '',
      })
    }
  }
  seedDemoData()
}

function seedDemoData() {
  const rng = seededRng(42)

  const demoOwners = [
    { addr: '0x1111111111111111111111111111111111111111', label: 'CeloFan', color: '#3498db', url: 'https://celo.org' },
    { addr: '0x2222222222222222222222222222222222222222', label: 'ETHGlobal', color: '#9b59b6', url: 'https://ethglobal.com' },
    { addr: '0x3333333333333333333333333333333333333333', label: 'Nike', color: '#e74c3c', url: 'https://nike.com' },
    { addr: '0x4444444444444444444444444444444444444444', label: 'Vitalik', color: '#2ecc71', url: '' },
  ]

  // Clusters on continent regions for 170x100 grid
  const clusters = [
    { owner: 0, startX: 20, startY: 20, w: 15, h: 12 },   // North America
    { owner: 1, startX: 85, startY: 18, w: 12, h: 10 },    // Europe
    { owner: 2, startX: 85, startY: 40, w: 10, h: 12 },    // Africa
    { owner: 3, startX: 45, startY: 50, w: 8, h: 12 },     // South America
    { owner: 0, startX: 115, startY: 22, w: 14, h: 10 },   // Asia
    { owner: 1, startX: 135, startY: 65, w: 10, h: 8 },    // Australia
  ]

  for (const cluster of clusters) {
    const demo = demoOwners[cluster.owner]
    for (let y = cluster.startY; y < cluster.startY + cluster.h; y++) {
      for (let x = cluster.startX; x < cluster.startX + cluster.w; x++) {
        if (x >= WIDTH || y >= HEIGHT) continue
        if (!isLandXY(x, y, WIDTH, WORLD_MASK)) continue
        if (rng() > 0.4) continue

        const id = pixelId(x, y, WIDTH)
        const sales = Math.floor(rng() * 5) + 1
        pixelState[id] = {
          owner: demo.addr,
          saleCount: sales,
          currentPrice: INITIAL_PRICE * (PRICE_DOUBLE ** BigInt(sales)),
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

  // Extra scattered owners
  const extraOwners = [
    { addr: '0x5555555555555555555555555555555555555555', label: 'Player5', color: '#e67e22', url: 'https://player5.xyz' },
    { addr: '0x6666666666666666666666666666666666666666', label: 'Celo', color: '#2ecc71', url: 'https://celo.org' },
    { addr: '0x7777777777777777777777777777777777777777', label: 'Builder7', color: '#1abc9c', url: '' },
    { addr: '0x8888888888888888888888888888888888888888', label: 'DAOhaus', color: '#00bcd4', url: 'https://daohaus.club' },
    { addr: '0x9999999999999999999999999999999999999999', label: 'Aave', color: '#9b59b6', url: 'https://aave.com' },
    { addr: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', label: 'Uniswap', color: '#e91e63', url: 'https://uniswap.org' },
  ]

  for (const owner of extraOwners) {
    profiles.set(owner.addr, {
      color: parseInt(owner.color.replace('#', ''), 16),
      label: owner.label,
      url: owner.url,
    })
  }

  // Scatter ~300 random purchases across all land
  const allOwners = [...demoOwners, ...extraOwners]
  for (let i = 0; i < 300; i++) {
    const x = Math.floor(rng() * WIDTH)
    const y = Math.floor(rng() * HEIGHT)
    if (!isLandXY(x, y, WIDTH, WORLD_MASK)) continue

    const id = pixelId(x, y, WIDTH)
    if (pixelState[id].owner !== ZERO_ADDRESS) continue

    const ownerIdx = Math.floor(rng() * allOwners.length)
    const owner = allOwners[ownerIdx]
    const sales = Math.floor(rng() * 4) + 1

    pixelState[id] = {
      owner: owner.addr,
      saleCount: sales,
      currentPrice: INITIAL_PRICE * (PRICE_DOUBLE ** BigInt(sales)),
      color: owner.color,
      label: owner.label,
      url: owner.url,
    }
  }
}

// Simulated USDT balance
let mockBalance = 5000000n // 5.00 USDT

export async function getUSDTBalance(): Promise<bigint> {
  initState()
  await delay(50)
  return mockBalance
}

export async function getAllPixels(): Promise<PixelView[]> {
  initState()
  await delay(200)
  return [...pixelState]
}

export async function getPixelBatch(startId: number, count: number): Promise<PixelView[]> {
  initState()
  await delay(100)
  return pixelState.slice(startId, startId + count)
}

export async function selectionPrice(ids: number[]): Promise<bigint> {
  initState()
  await delay(50)
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
  await delay(600)

  const totalCost = ids.reduce((sum, id) => sum + pixelState[id].currentPrice, 0n)
  if (totalCost > mockBalance) throw new Error('insufficient balance')
  mockBalance -= totalCost

  for (const id of ids) {
    const prev = pixelState[id]
    pixelState[id] = {
      owner: buyer,
      saleCount: prev.saleCount + 1,
      currentPrice: prev.currentPrice * PRICE_DOUBLE,
      color,
      label,
      url,
    }
  }
  profiles.set(buyer, { color: parseInt(color.replace('#', ''), 16), label, url })
  return '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

export async function getProfile(address: string): Promise<OwnerProfile | null> {
  initState()
  await delay(50)
  return profiles.get(address) ?? null
}

export async function updateProfile(address: string, color: number, label: string, url: string): Promise<void> {
  initState()
  await delay(200)
  profiles.set(address, { color, label, url })
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
