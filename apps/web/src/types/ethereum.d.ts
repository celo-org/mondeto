// Augments the global Window interface with the EIP-1193 injected provider
// we care about plus the MiniPay-specific marker. wagmi's `injected()`
// connector owns the day-to-day request/response wiring; we declare the
// surface here so the rare direct callsites (ChainGuard's chain switch,
// MiniPay detection) don't need `as any` casts.

interface EthereumProvider {
  isMiniPay?: boolean
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

interface Window {
  ethereum?: EthereumProvider
}
