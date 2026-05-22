'use client'

import { useEffect, useState } from 'react'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'

const SQUID_URL = 'https://www.squidrouter.com/'

/**
 * Browser-only banner pointing users with no Celo stablecoin balance at
 * Squid to bridge in. Hidden inside MiniPay (those users either already
 * hold stables or are guided via MiniPay's own Add Cash flow), and hidden
 * for users who already have a USDm / USDC / USDT balance.
 *
 * Dismissible — set a sessionStorage flag so it doesn't re-pop while the
 * tab is open.
 */
export default function BridgeBanner() {
  const { isConnected, isLoading, totalAmount } = useStablecoinBalance()
  const [isMiniPay, setIsMiniPay] = useState<boolean | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setIsMiniPay(
      typeof window !== 'undefined' && !!(window.ethereum as any)?.isMiniPay,
    )
    try {
      if (sessionStorage.getItem('mondeto-bridge-dismissed') === '1') {
        setDismissed(true)
      }
    } catch {}
  }, [])

  if (isMiniPay !== false) return null
  if (!isConnected || isLoading) return null
  if (totalAmount > 0) return null
  if (dismissed) return null

  const onDismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem('mondeto-bridge-dismissed', '1')
    } catch {}
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 56,
        left: 0,
        right: 0,
        zIndex: 14,
        minHeight: 28,
        background: '#A7FF05',
        color: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 32px',
        fontFamily: "'Press Start 2P', monospace",
      }}
    >
      <span style={{ fontSize: 7, letterSpacing: 1, textAlign: 'center' }}>
        no stables on celo yet —{' '}
        <a
          href={SQUID_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#000', textDecoration: 'underline' }}
        >
          bridge with squid
        </a>
      </span>
      <button
        onClick={onDismiss}
        aria-label="dismiss"
        style={{
          position: 'absolute',
          right: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'transparent',
          border: 'none',
          color: '#000',
          fontSize: 9,
          letterSpacing: 1,
          cursor: 'pointer',
          padding: '0 4px',
          fontFamily: "'Press Start 2P', monospace",
        }}
      >
        x
      </button>
    </div>
  )
}
