import { describe, it, expect } from 'vitest'
import { celo } from 'viem/chains'
import { celoTransport } from '@/lib/chain'

// Regression guard for the throttled-region outage (map + profile blank in
// India, where Forno is blocked behind Cloudflare). Client reads go through
// celoTransport, so it must fail over FAST and across MULTIPLE providers
// instead of stalling ~10s per read on a blocked primary.
describe('celoTransport failover config', () => {
  // Instantiate the transport (with a chain so the URL-less Forno transport
  // resolves the chain default) to inspect its resolved config.
  const inst = celoTransport({ chain: celo }) as {
    config: { type: string; retryCount: number }
    value?: { transports: Array<{ config: { timeout?: number } }> }
  }

  it('is a fallback across three providers', () => {
    expect(inst.config.type).toBe('fallback')
    expect(inst.value?.transports).toHaveLength(3)
  })

  it('caps every transport under viem’s 10s default so a hung primary fails over fast', () => {
    const timeouts = (inst.value?.transports ?? []).map((t) => t.config.timeout)
    expect(timeouts).toHaveLength(3)
    for (const t of timeouts) {
      expect(t).toBeDefined()
      expect(t as number).toBeLessThanOrEqual(10_000)
    }
    // The Forno primary must be the shortest, so a Cloudflare-throttled region
    // rotates to dRPC/Ankr in seconds rather than ~10s per read.
    expect(timeouts[0] as number).toBeLessThanOrEqual(6_000)
    expect(timeouts[0] as number).toBeLessThan(timeouts[1] as number)
  })

  it('retries across the fallback chain rather than giving up on first failure', () => {
    expect(inst.config.retryCount).toBeGreaterThanOrEqual(1)
  })
})
