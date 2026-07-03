import { toDataSuffix, codeFromHostname } from '@celo/attribution-tags'
import type { Hex } from 'viem'

// ERC-8021 builder-code attribution (@celo/attribution-tags — successor to
// @celo/builder-codes). Per the layering rule: the app emits ONLY its own
// code. Platform codes like "minipay" are added by the platform's wallet at
// signing time, not by the app. Adding "minipay" here would assert "this tx
// ran in MiniPay" even when running in plain Chrome.
let cached: Hex | null = null

export function getAttributionSuffix(): Hex | undefined {
  if (typeof window === 'undefined') return undefined
  if (cached) return cached
  try {
    cached = toDataSuffix(codeFromHostname(window.location.hostname)) as Hex
    return cached
  } catch (e) {
    console.warn('attribution suffix failed:', e)
    return undefined
  }
}
