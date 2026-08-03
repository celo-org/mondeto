'use client'

const PIXEL_FONT = "'Press Start 2P', monospace"

interface StatsRowProps {
  pixels: number
  balance: string
  /** Stablecoin symbol shown under the balance value (USDm / USDC / USDT). */
  balanceSymbol?: string
  rank: number
  /** Rank-proximity nudge under the RANK number, e.g. "12 PX FROM #3"
   *  ("RULER" at rank 1). */
  rankGapLabel?: string
  spent?: string
  earned?: string
  /** Total current market value of the wallet's held land across all active
   *  maps (formatted, 6-dec USDT). Omitted → card hidden. */
  landValue?: string
}

export default function StatsRow({ pixels, balance, balanceSymbol, rank, rankGapLabel, spent, earned, landValue }: StatsRowProps) {
  const balanceLabel = balanceSymbol ? `BALANCE · ${balanceSymbol.toUpperCase()}` : 'BALANCE'
  const cards = [
    { value: String(pixels), label: 'PIXELS' },
    { value: balance, label: balanceLabel },
    {
      value: rank > 0 ? `#${rank}` : '-',
      label: 'RANK',
      sub: rank > 0 ? rankGapLabel : undefined,
    },
  ]

  // Money row — LAND VALUE (what your held pixels are worth now) sits with the
  // SPENT / EARNED figures so all three USD numbers read as one group. LAND
  // VALUE is only added when a value was passed; the whole row is hidden when
  // no money figures are supplied.
  const pnlCards = [
    { value: spent || '0.00', label: 'SPENT' },
    { value: earned || '0.00', label: 'EARNED' },
    ...(landValue !== undefined ? [{ value: landValue || '0.00', label: 'LAND VALUE' }] : []),
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
          {card.sub && (
            // Rank-proximity nudge — 6px so it survives the 3-across card
            // layout at 360px; wraps onto a second line when it must.
            <div style={{ fontSize: 6, fontFamily: PIXEL_FONT, letterSpacing: 1, lineHeight: 1.6, color: '#A7FF05', marginTop: 4 }}>
              {card.sub}
            </div>
          )}
          <div style={{ fontSize: 6, fontFamily: PIXEL_FONT, letterSpacing: 2, color: 'var(--text-muted)', marginTop: 4 }}>
            {card.label}
          </div>
        </div>
      ))}
    </div>
      {(spent || earned || landValue !== undefined) && (
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
