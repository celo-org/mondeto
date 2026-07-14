import { toDataSuffix } from '@celo/attribution-tags'
import type { Hex } from 'viem'

// ERC-8021 builder-code attribution (@celo/attribution-tags — successor to
// @celo/builder-codes). We emit Mondeto's assigned code. Per the layering
// rule: the app emits ONLY its own code. Platform codes like "minipay" are
// added by the platform's wallet at signing time, not by the app. Adding
// "minipay" here would assert "this tx ran in MiniPay" even when running in
// plain Chrome.
const ATTRIBUTION_CODE =
  process.env.NEXT_PUBLIC_ATTRIBUTION_CODE || 'celo_jz4httik'

let cached: Hex | null = null

export function getAttributionSuffix(): Hex | undefined {
  if (cached) return cached
  try {
    cached = toDataSuffix(ATTRIBUTION_CODE) as Hex
    return cached
  } catch (e) {
    console.warn('attribution suffix failed:', e)
    return undefined
  }
}
