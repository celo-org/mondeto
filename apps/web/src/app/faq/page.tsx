import type { Metadata } from 'next'
import Link from 'next/link'
import IntroScreen from '@/components/Overlays/IntroScreen'
import { FAQ_GROUPS } from './content'

export const metadata: Metadata = {
  title: 'FAQ — Mondeto',
}

const PIXEL_FONT = "'Press Start 2P', monospace"

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
            color: 'var(--brand-lime)',
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
          marginBottom: 16,
          color: 'var(--text)',
        }}
      >
        FAQ
      </h1>

      {/* Jump links sit above the carousel on purpose: a player worried about a
          missing payout shouldn't have to swipe five onboarding slides to reach
          the answer. */}
      <nav
        aria-label="FAQ sections"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}
      >
        {FAQ_GROUPS.map(({ id, title }) => (
          <a
            key={id}
            href={`#${id}`}
            style={{
              fontSize: 7,
              fontFamily: PIXEL_FONT,
              letterSpacing: 1,
              color: 'var(--brand-lime)',
              textDecoration: 'none',
              padding: '6px 8px',
              border: '1px solid var(--border)',
              borderRadius: 4,
              lineHeight: 1.4,
            }}
          >
            {title}
          </a>
        ))}
      </nav>

      {/* Replayable onboarding carousel — the same walkthrough new players see
          once, embedded here so "HOW TO WIN" can send them back to it anytime. */}
      <IntroScreen inline />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginTop: 28 }}>
        {FAQ_GROUPS.map(({ id, title, items }) => (
          <section key={id} id={id} style={{ scrollMarginTop: 16 }}>
            <h2
              style={{
                fontSize: 11,
                fontFamily: PIXEL_FONT,
                letterSpacing: 2,
                color: 'var(--brand-lime)',
                marginBottom: 16,
              }}
            >
              {title}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {items.map((item) => (
                <section key={item.id} id={item.id} style={{ scrollMarginTop: 16 }}>
                  <h3
                    style={{
                      fontSize: 11,
                      fontFamily: PIXEL_FONT,
                      letterSpacing: 1,
                      color: 'var(--text)',
                      marginBottom: 8,
                      lineHeight: 1.5,
                    }}
                  >
                    {item.q}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {item.a}
                    {item.link && (
                      <>
                        {' '}
                        <a
                          href={item.link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent)' }}
                        >
                          {item.link.label}
                        </a>
                      </>
                    )}
                  </p>
                </section>
              ))}
            </div>
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
