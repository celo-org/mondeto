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
 * The single link every share carries — a static campaign short-link. It's the
 * ONE URL in every message across every channel (no second MiniPay link, no
 * per-player `/s` referral link). Whatever preview a recipient sees comes from
 * wherever this short-link resolves, configured outside the app.
 */
export const SHARE_LINK = 'https://qrco.de/bgvujx'

/**
 * Message body for the native share sheet / WhatsApp / Copy. Some targets
 * (Telegram, notably) keep ONLY the `url` when a Web Share payload carries both
 * `text` and `url`, so the brag copy vanishes — we fold the link into the text
 * and share one string.
 */
export function composeShareMessage(kind: ShareKind, params: ShareParams): string {
  return `${composeShareText(kind, params)}\n\n${SHARE_LINK}`
}

/**
 * X/Twitter copy — the @mondeto + @minipay handles are already woven into the
 * brag text (only X resolves them), and the link rides X's separate `url` param.
 */
export function composeXText(kind: ShareKind, params: ShareParams): string {
  return composeShareText(kind, params)
}

/**
 * Telegram copy — the link rides Telegram's separate `url` param, so this is
 * just the brag text.
 */
export function composeTelegramText(kind: ShareKind, params: ShareParams): string {
  return composeShareText(kind, params)
}

/** 'WORLD' -> 'World', 'NORTH AMERICA' -> 'North America' (share-copy display). */
export function formatMapName(name: string): string {
  return name.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())
}

/**
 * The " on <map>" clause for share copy. WORLD reads as the common-noun
 * "the world map"; the continent maps keep their proper-noun casing —
 * "the Europe map", "the North America map".
 */
export function whereClause(mapName: string | undefined): string {
  if (!mapName) return ''
  if (mapName.toUpperCase() === 'WORLD') return ' on the world map'
  return ` on the ${formatMapName(mapName)} map`
}

/**
 * Arcade-tone share copy — competitive, no emoji, no real-world-colonial
 * framing (per brand voice). The @mondeto + @minipay handles are woven in (X
 * resolves them; elsewhere they read as plain text). The link is appended by
 * the share sheet / intent, so these strings never include the URL themselves.
 */
export function composeShareText(kind: ShareKind, params: ShareParams): string {
  const where = whereClause(params.mapName)
  switch (kind) {
    case 'reward':
      return params.amount
        ? `Just banked $${params.amount}${where} playing @mondeto on @minipay. Every pixel is up for grabs — come take a shot.`
        : `Just cashed out a prize${where} playing @mondeto on @minipay. Every pixel is up for grabs — come take a shot.`
    case 'rank': {
      const board = params.board ?? 'LAND'
      const at = params.rank ? `#${params.rank}` : 'the board'
      const val = params.value ? ` (${params.value}${params.unit ? ' ' + params.unit : ''})` : ''
      return `I'm ${at} on the ${board} board${where}${val} playing @mondeto on @minipay. Think you can knock me off? Claim your pixels.`
    }
    case 'positions': {
      if (params.ruler && params.mapName) {
        return `I'm the ruler of ${formatMapName(params.mapName)} playing @mondeto on @minipay. Come take it from me — every pixel is up for grabs.`
      }
      const px = params.value ? `${params.value} pixels` : 'my turf'
      return `I hold ${px}${where} playing @mondeto on @minipay. Paint the map before someone paints over you.`
    }
    case 'invite':
    default:
      return `Claim your spot before someone else does — come play @mondeto on @minipay. Every pixel is up for grabs.`
  }
}
