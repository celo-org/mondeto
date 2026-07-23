import { describe, it, expect, afterEach } from 'vitest'
import { getFeeCurrency } from '@/lib/feeCurrency'

// Official MiniPay fee-currency adapters (from feeCurrency.ts).
const USDT = '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e'
const USDT_ADAPTER = '0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72'
const USDC = '0xceba9300f2b948710d2653dd7b07f33a8b32118c'
const USDC_ADAPTER = '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B'
const CUSD = '0x765DE816845861e75A25fCA122bb6898B8B1282a'

const setMiniPay = (on: boolean) => {
  if (on) (window as unknown as { ethereum?: unknown }).ethereum = { isMiniPay: true }
  else delete (window as unknown as { ethereum?: unknown }).ethereum
}

afterEach(() => setMiniPay(false))

describe('getFeeCurrency', () => {
  it('returns undefined outside MiniPay (gas stays in CELO)', () => {
    setMiniPay(false)
    expect(getFeeCurrency(USDT as `0x${string}`)).toBeUndefined()
  })

  it('maps a 6-decimal token to its fee-currency adapter, not the token', () => {
    setMiniPay(true)
    expect(getFeeCurrency(USDT as `0x${string}`)).toBe(USDT_ADAPTER)
    expect(getFeeCurrency(USDC as `0x${string}`)).toBe(USDC_ADAPTER)
  })

  it('maps cUSD to itself (it is a fee currency directly)', () => {
    setMiniPay(true)
    expect(getFeeCurrency(CUSD as `0x${string}`)).toBe(CUSD)
  })

  it('is case-insensitive on the token address', () => {
    setMiniPay(true)
    expect(getFeeCurrency(USDT.toUpperCase() as `0x${string}`)).toBe(USDT_ADAPTER)
  })

  it('falls back to the default cUSD fee currency for an unknown token', () => {
    setMiniPay(true)
    const unknown = '0x1111111111111111111111111111111111111111' as `0x${string}`
    expect(getFeeCurrency(unknown)).toBe(CUSD)
  })

  it('falls back to the default when no token is supplied (e.g. profile edit)', () => {
    setMiniPay(true)
    expect(getFeeCurrency()).toBe(CUSD)
  })
})
