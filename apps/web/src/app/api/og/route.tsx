import { ImageResponse } from 'next/og'
import { decodeShareParams, type ShareKind, type ShareParams } from '@/lib/share'

/**
 * Dynamic Open Graph card for the share-to-X flywheel. Renders a 1200x630
 * pixel-art card personalized to the sharer — this is the image X/Farcaster
 * show in the timeline, so each share doubles as a Mondeto ad.
 *
 * next/og runs on Satori (flexbox + SVG), NOT canvas — so the app's canvas
 * drawPixels() can't be reused here. Instead we render a decorative grid of
 * squares in the sharer's color as the pixel motif.
 *
 * Params are display-only and untrusted (a forgeable brag card), so every
 * text field is clamped and the color is validated to a hex triplet.
 */
export const runtime = 'edge'

const BRAND = {
  black: '#1B1B1B',
  card: '#111111',
  lime: '#A7FF05',
  orange: '#FF4C00',
  purple: '#B430FF',
  white: '#FFFFFF',
  muted: '#A0A0A0',
} as const

// Clamp untrusted text so a crafted URL can't blow out the layout.
function clamp(value: string | undefined, max: number): string {
  if (!value) return ''
  return value.replace(/[\u0000-\u001f]/g, "").slice(0, max)
}

// Validate `c` to a 6-digit hex; fall back to lime so we never inject a bad
// CSS color into the render.
function safeColor(hex: string | undefined): string {
  if (hex && /^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`
  return BRAND.lime
}

function accentFor(kind: ShareKind): string {
  if (kind === 'reward') return BRAND.lime
  if (kind === 'rank') return BRAND.purple
  return BRAND.lime
}

// The big headline value each card leads with.
function headline(kind: ShareKind, params: ShareParams): string {
  switch (kind) {
    case 'reward':
      return params.amount ? `$${clamp(params.amount, 12)}` : 'PRIZE WON'
    case 'rank':
      return params.rank ? `#${params.rank}` : 'RANKED'
    case 'positions':
      if (params.ruler && params.mapName) return `RULER`
      return params.value ? clamp(params.value, 10) : 'ON THE MAP'
    case 'invite':
    default:
      return 'EVERY PIXEL'
  }
}

function subline(kind: ShareKind, params: ShareParams): string {
  const map = params.mapName ? clamp(params.mapName, 16).toUpperCase() : 'THE WORLD'
  switch (kind) {
    case 'reward':
      return `WON ON MONDETO${params.mapName ? ` — ${map}` : ''}`
    case 'rank':
      return `${clamp(params.board ?? 'LAND', 10).toUpperCase()} BOARD — ${map}`
    case 'positions':
      if (params.ruler) return `OF ${map}`
      return `PIXELS ON ${map}`
    case 'invite':
    default:
      return 'IS UP FOR GRABS'
  }
}

// Small stat chip line under the headline (rank+value, or the player name).
function statLine(kind: ShareKind, params: ShareParams): string {
  const name = params.name ? clamp(params.name, 20).toUpperCase() : ''
  if (kind === 'rank' && params.value) {
    const val = `${clamp(params.value, 10)}${params.unit ? ' ' + clamp(params.unit, 6) : ''}`
    return name ? `${name} · ${val}` : val
  }
  if (kind === 'positions' && params.value && !params.ruler) {
    return name ? `${name} · ${clamp(params.value, 10)} PX` : `${clamp(params.value, 10)} PX`
  }
  return name
}

// A 12x6 decorative grid; a deterministic subset lights up in the sharer's
// color so the card feels like a slice of their map without any real data.
function PixelGrid({ color }: { color: string }) {
  const cols = 12
  const rows = 6
  const cells = []
  for (let i = 0; i < cols * rows; i++) {
    // Deterministic pseudo-pattern (no randomness — stable per render).
    const lit = (i * 7 + (i % 5) * 3) % 4 === 0
    cells.push(
      <div
        key={i}
        style={{
          width: 44,
          height: 44,
          background: lit ? color : '#222222',
          borderRadius: 6,
        }}
      />,
    )
  }
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        width: cols * 52,
        gap: 8,
      }}
    >
      {cells}
    </div>
  )
}

async function loadFont(origin: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${origin}/brand/font/retro_computer_personal_use.ttf`)
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const { kind, params } = decodeShareParams(url.searchParams)
  const accent = accentFor(kind)
  const playerColor = safeColor(params.color)

  const font = await loadFont(url.origin)
  const fonts = font
    ? [{ name: 'Retro', data: font, weight: 400 as const, style: 'normal' as const }]
    : undefined
  const fontFamily = font ? 'Retro' : 'monospace'

  const head = headline(kind, params)
  const sub = subline(kind, params)
  const stat = statLine(kind, params)

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: BRAND.black,
          fontFamily,
          padding: '64px',
          position: 'relative',
        }}
      >
        {/* Accent frame */}
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            right: 24,
            bottom: 24,
            border: `4px solid ${accent}`,
            borderRadius: 16,
          }}
        />

        {/* Left column: the brag */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            flex: 1,
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                color: BRAND.muted,
                fontSize: 22,
                letterSpacing: 4,
                marginBottom: 24,
              }}
            >
              MONDETO
            </div>
            <div
              style={{
                color: accent,
                fontSize: head.length > 6 ? 96 : 128,
                lineHeight: 1,
                letterSpacing: 2,
              }}
            >
              {head}
            </div>
            <div
              style={{
                color: BRAND.white,
                fontSize: 34,
                letterSpacing: 3,
                marginTop: 24,
              }}
            >
              {sub}
            </div>
            {stat ? (
              <div
                style={{
                  color: BRAND.muted,
                  fontSize: 22,
                  letterSpacing: 2,
                  marginTop: 20,
                }}
              >
                {stat}
              </div>
            ) : null}
          </div>

          <div
            style={{
              color: BRAND.black,
              background: accent,
              fontSize: 20,
              letterSpacing: 2,
              padding: '14px 22px',
              borderRadius: 8,
              alignSelf: 'flex-start',
            }}
          >
            PLAY ON MINIPAY · MONDETO.APP
          </div>
        </div>

        {/* Right column: pixel motif in the player's color */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 640,
            zIndex: 1,
          }}
        >
          <PixelGrid color={playerColor} />
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
    },
  )
}
