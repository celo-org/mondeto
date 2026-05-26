// Augments the global Window interface with the EIP-1193 injected provider
// we care about plus the MiniPay-specific marker. wagmi's `injected()` connector
// owns the actual request/response wiring; we only narrow the surface enough to
// branch on `isMiniPay` without `as any` casts at every callsite.

interface EthereumProvider {
  isMiniPay?: boolean
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

interface Window {
  ethereum?: EthereumProvider
}
