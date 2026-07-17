import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'FAQ — Mondeto',
}

const PIXEL_FONT = "'Press Start 2P', monospace"

const QA: Array<{ q: string; a: string }> = [
  {
    q: 'What is Mondeto?',
    a: 'A pixel-buying game on Celo. The world map is 170 × 100 pixels. You buy pixels with USDT and paint the world your color.',
  },
  {
    q: 'How do prices work?',
    a: 'Each pixel starts at a base price (currently 0.003 USDT). Every time someone buys it, the price doubles. So the more times a pixel changes hands, the more expensive it gets.',
  },
  {
    q: 'What if a pixel sits unsold?',
    a: 'Prices don\'t climb forever. After a quiet window, the price halves. So abandoned land becomes cheap again — good for hunters.',
  },
  {
    q: 'Who pays whom when I buy a pixel?',
    a: 'If you buy a pixel from another player, they receive most of what you pay. A small platform fee (currently 3%) goes to Mondeto. If the pixel was unowned, the full amount is the contract\'s.',
  },
  {
    q: 'Can someone buy my pixel away from me?',
    a: 'Yes. Ownership is permissionless — anyone can buy any pixel at the current price. That\'s the whole game. But they pay you double what you paid, so getting sniped is profitable.',
  },
  {
    q: 'What network fees do I pay?',
    a: 'Almost nothing. Celo network fees are paid automatically in USDT inside MiniPay — typically a fraction of a cent.',
  },
  {
    q: 'Why USDT and not USDC or USDm?',
    a: 'v1 of Mondeto accepts USDT only. If you hold USDC or USDm, swap inside MiniPay first. Multi-stablecoin support is on the v2 roadmap.',
  },
  {
    q: 'How do leaderboards work?',
    a: 'Three boards: AREA (most pixels owned), EMPIRE (largest single connected run of land), TYCOON (single most valuable pixel). Top players win prizes when campaigns are active.',
  },
  {
    q: 'I see weird names like "mango-curie". What are those?',
    a: 'When you haven\'t set a player name yet, Mondeto picks one for you — a fruit plus a famous (and non-controversial) figure. Set your own name on the profile page if you want.',
  },
  {
    q: 'Who runs Mondeto?',
    a: 'Mondeto is operated by Celo Core Co. It is not operated by, affiliated with, or endorsed by Opera or MiniPay — MiniPay is just the wallet that makes Mondeto accessible inside their app.',
  },
  {
    q: 'Where does support go?',
    a: 'Use the SUPPORT button on your profile page — it opens a short form. A human reads every submission.',
  },
]

export default function FaqPage() {
  return (
    <article
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '20px 20px 40px',
        fontFamily: "'IBM Plex Mono', monospace",
        color: 'var(--text)',
        lineHeight: 1.6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Link
          href="/profile"
          aria-label="Close"
          style={{
            fontSize: 16,
            fontFamily: PIXEL_FONT,
            color: 'var(--text-muted)',
            textDecoration: 'none',
            padding: '4px 10px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            lineHeight: 1,
          }}
        >
          ✕
        </Link>
      </div>

      <h1
        style={{
          fontSize: 18,
          fontFamily: PIXEL_FONT,
          letterSpacing: 3,
          marginBottom: 24,
          color: 'var(--text)',
        }}
      >
        FAQ
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {QA.map(({ q, a }, i) => (
          <section key={i}>
            <h2
              style={{
                fontSize: 11,
                fontFamily: PIXEL_FONT,
                letterSpacing: 1,
                color: 'var(--text)',
                marginBottom: 8,
              }}
            >
              {q}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{a}</p>
          </section>
        ))}
      </div>

      <p
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginTop: 32,
        }}
      >
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← back to the map
        </Link>
      </p>
    </article>
  )
}
