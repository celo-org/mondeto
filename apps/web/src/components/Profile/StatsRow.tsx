'use client'

const PIXEL_FONT = "'Press Start 2P', monospace"

interface StatsRowProps {
  pixels: number
  balance: string
  /** Stablecoin symbol shown under the balance value (USDm / USDC / USDT). */
  balanceSymbol?: string
  rank: number
  spent?: string
  earned?: string
}

export default function StatsRow({ pixels, balance, balanceSymbol, rank, spent, earned }: StatsRowProps) {
  const balanceLabel = balanceSymbol ? `BALANCE · ${balanceSymbol.toUpperCase()}` : 'BALANCE'
  const cards = [
    { value: String(pixels), label: 'PIXELS' },
    { value: balance, label: balanceLabel },
    { value: rank > 0 ? `#${rank}` : '-', label: 'RANK' },
  ]

  const pnlCards = [
    { value: spent || '0.00', label: 'SPENT' },
    { value: earned || '0.00', label: 'EARNED' },
  ]

  return (
    <>
    <div style={{ display: 'flex', gap: 8, margin: '0 auto 12px', maxWidth: 460, padding: '0 16px', width: '100%' }}>
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            flex: 1,
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 6px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 14, fontFamily: PIXEL_FONT, letterSpacing: 2, color: 'var(--text)' }}>
            {card.value}
          </div>
          <div style={{ fontSize: 6, fontFamily: PIXEL_FONT, letterSpacing: 2, color: 'var(--text-muted)', marginTop: 4 }}>
            {card.label}
          </div>
        </div>
      ))}
    </div>
      {(spent || earned) && (
        <div style={{ display: 'flex', gap: 8, margin: '0 auto 12px', maxWidth: 460, padding: '0 16px', width: '100%' }}>
          {pnlCards.map((card) => (
            <div
              key={card.label}
              style={{
                flex: 1,
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 6px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 12, fontFamily: PIXEL_FONT, letterSpacing: 2, color: 'var(--text)' }}>
                {card.value}
              </div>
              <div style={{ fontSize: 6, fontFamily: PIXEL_FONT, letterSpacing: 2, color: 'var(--text-muted)', marginTop: 4 }}>
                {card.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
