export function hexToUint24(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

export function uint24ToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0')
}

function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16)
  const ag = parseInt(a.slice(3, 5), 16)
  const ab = parseInt(a.slice(5, 7), 16)
  const br = parseInt(b.slice(1, 3), 16)
  const bg = parseInt(b.slice(3, 5), 16)
  const bb = parseInt(b.slice(5, 7), 16)
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const blue = Math.round(ab + (bb - ab) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`
}

export function formatUSDT(amount: bigint, decimals = 6): string {
  if (amount === 0n) return '0.00'
  const whole = amount / BigInt(10 ** decimals)
  const frac = amount % BigInt(10 ** decimals)
  const fracStr = frac.toString().padStart(decimals, '0')
  // Show enough decimals so the value isn't "0.00"
  if (whole > 0n) return `${whole}.${fracStr.slice(0, 2)}`
  // Find first non-zero digit and show enough to be meaningful
  const firstNonZero = fracStr.search(/[1-9]/)
  if (firstNonZero < 0) return '0.00'
  // Show up to the first non-zero digit + 1 more
  const end = Math.max(firstNonZero + 2, 2)
  // Trim trailing zeros
  const raw = fracStr.slice(0, end)
  const trimmed = raw.replace(/0+$/, '') || '00'
  return `0.${trimmed.length < 2 ? trimmed.padEnd(2, '0') : trimmed}`
}

export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex)
}

/** Format a $-denominated stablecoin amount for the BALANCE stat tile. */
export function formatBalanceForDisplay(amount: number): string {
  if (!isFinite(amount) || amount <= 0) return '0.00'
  if (amount >= 100) return Math.floor(amount).toString()
  if (amount >= 1) return amount.toFixed(2)
  return amount.toFixed(4)
}
