import Link from 'next/link'

const PIXEL_FONT = "'Press Start 2P', monospace"

const FLAVOR = [
  'you dropped in the water. swim back to land.',
  'lost at sea. tap below to find dry ground.',
  'no land here, just deep water. head home.',
  'this part of the map is just ocean. try the mainland.',
]

export default function NotFound() {
  // Random funny line — picked at render time so reloads can vary.
  const line = FLAVOR[Math.floor(Math.random() * FLAVOR.length)]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        gap: 18,
      }}
    >
      <img
        src="/brand/mondeto-symbol.gif"
        alt=""
        width={96}
        height={96}
        style={{ display: 'block', imageRendering: 'pixelated' }}
      />

      <div
        style={{
          fontSize: 48,
          fontFamily: PIXEL_FONT,
          letterSpacing: 4,
          color: 'var(--text)',
        }}
      >
        404
      </div>

      <div
        style={{
          fontSize: 9,
          fontFamily: PIXEL_FONT,
          letterSpacing: 2,
          color: 'var(--text-muted)',
          maxWidth: 360,
          lineHeight: 1.6,
        }}
      >
        far, far away —<br />
        {line}
      </div>

      <Link
        href="/"
        style={{
          marginTop: 10,
          background: 'var(--button-bg)',
          color: 'var(--button-text)',
          fontSize: 9,
          fontFamily: PIXEL_FONT,
          letterSpacing: 2,
          padding: '12px 22px',
          borderRadius: 11,
          textDecoration: 'none',
        }}
      >
        [ BACK TO LAND ]
      </Link>
    </div>
  )
}
