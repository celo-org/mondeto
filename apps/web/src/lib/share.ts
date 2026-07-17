/**
 * Share-to-X flywheel: central helpers for turning a player's in-game
 * standing into a crawlable, shareable link with a dynamic preview card.
 *
 * Every shared link points at the app's own `/s` route (server-rendered so
 * X/Farcaster crawlers get real OG + Twitter-card meta), which in turn
 * references the `/api/og` image and, for a human click, redirects into the
 * app carrying the sharer's `?map=<id>&ref=<wallet>` — so the existing
 * referral flywheel (referral_landed → buy attribution) keeps working.
 *
 * The URL params are display-only (a brag card, no auth attached), so they're
 * kept short and are always re-clamped/escaped in the OG renderer.
 */

export const APP_ORIGIN = 'https://www.mondeto.app'

/**
 * The origin to build shareable links against. Uses the live deployment origin
 * in the browser (so a link shared from a Vercel preview resolves on that
 * preview instead of 404-ing against production, which may not have `/s` yet),
 * and falls back to the canonical origin on the server.
 */
export function originBase(): string {
  return typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : APP_ORIGIN
}

export type ShareKind = 'positions' | 'rank' | 'invite' | 'reward'

/**
 * Everything a share card can display. All optional except what a given kind
 * needs — `buildShareUrl` only serializes the keys that are set, and the OG
 * renderer + copy tolerate missing fields.
 */
export interface ShareParams {
  /** Display name (on-chain profile label or generated username). */
  name?: string
  /** 1-based rank on the relevant board. */
  rank?: number
  /** Formatted board value (pixel count, USDT price, territory %). */
  value?: string
  /** Unit for `value`: 'px', 'USDT', '' (global AREA is a bare %). */
  unit?: string
  /** Board label: 'LAND' | 'EMPIRE' | 'TYCOONS'. */
  board?: string
  /** Map id the share is anchored to (drives the deep-link + ref). */
  mapId?: number
  /** Map display name, e.g. 'WORLD'. */
  mapName?: string
  /** Sharer wallet — becomes the `ref` on the landing deep-link. */
  ref?: string
  /** Player color as a bare hex (no '#'), e.g. 'A7FF05'. */
  color?: string
  /** Reward payout in USD (reward kind). */
  amount?: string
  /** Campaign id the reward came from (reward kind). */
  campaignId?: string
  /** True when the sharer is rank 1 of a single map's LAND board. */
  ruler?: boolean
}

// Short query keys keep the shared URL compact (it rides inside a tweet).
const KEY_MAP: Record<keyof ShareParams, string> = {
  name: 'n',
  rank: 'r',
  value: 'v',
  unit: 'u',
  board: 'b',
  mapId: 'm',
  mapName: 'mn',
  ref: 'ref',
  color: 'c',
  amount: 'amt',
  campaignId: 'cid',
  ruler: 'k1',
}

/** Serialize ShareParams into short-key query string (skips empty values). */
export function encodeShareParams(kind: ShareKind, params: ShareParams): URLSearchParams {
  const q = new URLSearchParams()
  q.set('k', kind)
  for (const [field, key] of Object.entries(KEY_MAP) as [keyof ShareParams, string][]) {
    const value = params[field]
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'boolean') {
      if (value) q.set(key, '1')
    } else {
      q.set(key, String(value))
    }
  }
  return q
}

/** Parse the short-key query back into a typed ShareParams (for /s + /api/og). */
export function decodeShareParams(sp: URLSearchParams): { kind: ShareKind; params: ShareParams } {
  const kRaw = sp.get('k')
  const kind: ShareKind =
    kRaw === 'rank' || kRaw === 'invite' || kRaw === 'reward' ? kRaw : 'positions'
  const num = (v: string | null): number | undefined => {
    if (v === null) return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  const str = (v: string | null): string | undefined => (v === null || v === '' ? undefined : v)
  return {
    kind,
    params: {
      name: str(sp.get('n')),
      rank: num(sp.get('r')),
      value: str(sp.get('v')),
      unit: str(sp.get('u')),
      board: str(sp.get('b')),
      mapId: num(sp.get('m')),
      mapName: str(sp.get('mn')),
      ref: str(sp.get('ref')),
      color: str(sp.get('c')),
      amount: str(sp.get('amt')),
      campaignId: str(sp.get('cid')),
      ruler: sp.get('k1') === '1',
    },
  }
}

/** The crawlable landing link a player actually shares. */
export function buildShareUrl(kind: ShareKind, params: ShareParams): string {
  return `${originBase()}/s?${encodeShareParams(kind, params).toString()}`
}

/** The in-app deep-link the `/s` route redirects a human to (referral intact). */
export function buildDeepLink(params: ShareParams): string {
  const q = new URLSearchParams()
  if (typeof params.mapId === 'number') q.set('map', String(params.mapId))
  if (params.ref) q.set('ref', params.ref.toLowerCase())
  const qs = q.toString()
  const base = originBase()
  return qs ? `${base}/?${qs}` : `${base}/`
}

/** X/Twitter web-intent URL (opens the composer with text + link prefilled). */
export function buildXIntentUrl(text: string, url: string): string {
  const q = new URLSearchParams({ text, url })
  return `https://x.com/intent/tweet?${q.toString()}`
}

/** Telegram share URL (prefills the message with the link + brag text). */
export function buildTelegramUrl(text: string, url: string): string {
  const q = new URLSearchParams({ url, text })
  return `https://t.me/share/url?${q.toString()}`
}

/**
 * WhatsApp share URL. Uses api.whatsapp.com/send (not wa.me/?text=, which needs
 * a phone number and shows an "invalid number" page when shared without one).
 * WhatsApp takes a single text field, so the link is folded into the message.
 */
export function buildWhatsAppUrl(message: string): string {
  const q = new URLSearchParams({ text: message })
  return `https://api.whatsapp.com/send?${q.toString()}`
}

/**
 * Message body for the native share sheet. Some targets (Telegram, notably)
 * keep ONLY the `url` when a Web Share payload carries both `text` and `url`,
 * so the player's brag copy vanishes. To guarantee the text always travels, we
 * fold the link into the text and share that as a single string — no separate
 * `url` field for a target to prefer over the copy.
 */
export function composeShareMessage(kind: ShareKind, params: ShareParams): string {
  return `${composeShareText(kind, params)}\n\n${buildShareUrl(kind, params)}`
}

/**
 * X/Twitter variant of the share copy — tags the @mondeto game and the @minipay
 * platform so both accounts get pinged (x.com/mondeto, x.com/minipay). Only used
 * for the X intent; other channels (Telegram/WhatsApp) don't resolve X handles,
 * so they use the plain copy.
 */
export function composeXText(kind: ShareKind, params: ShareParams): string {
  return `${composeShareText(kind, params)} via @mondeto on @minipay`
}

/**
 * Arcade-tone share copy — competitive, no emoji, no real-world-colonial
 * framing (per brand voice). The link is appended by the share sheet / intent,
 * so these strings never include the URL themselves.
 */
export function composeShareText(kind: ShareKind, params: ShareParams): string {
  const where = params.mapName ? ` on ${params.mapName}` : ''
  switch (kind) {
    case 'reward':
      return params.amount
        ? `Just banked $${params.amount} playing Mondeto${where}. Every pixel is up for grabs — come take a shot.`
        : `Just cashed out a Mondeto prize${where}. Every pixel is up for grabs — come take a shot.`
    case 'rank': {
      const board = params.board ?? 'LAND'
      const at = params.rank ? `#${params.rank}` : 'the board'
      const val = params.value ? ` (${params.value}${params.unit ? ' ' + params.unit : ''})` : ''
      return `I'm ${at} on Mondeto's ${board} board${where}${val}. Think you can knock me off? Claim your pixels.`
    }
    case 'positions': {
      if (params.ruler && params.mapName) {
        return `I'm the ruler of ${params.mapName} on Mondeto. Come take it from me — every pixel is up for grabs.`
      }
      const px = params.value ? `${params.value} pixels` : 'my turf'
      return `I hold ${px}${where} on Mondeto. Paint the map before someone paints over you.`
    }
    case 'invite':
    default:
      return `Claim your spot on my Mondeto map before someone else does. Every pixel is up for grabs.`
  }
}
