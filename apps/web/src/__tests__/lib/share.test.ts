import { describe, it, expect } from 'vitest'
import {
  encodeShareParams,
  decodeShareParams,
  buildShareUrl,
  buildDeepLink,
  buildXIntentUrl,
  buildTelegramUrl,
  buildWhatsAppUrl,
  composeShareText,
  composeShareMessage,
  composeXText,
  composeTelegramText,
  formatMapName,
  originBase,
  SHARE_LINK,
  type ShareParams,
} from '@/lib/share'

const FULL: ShareParams = {
  name: 'mango-curie',
  rank: 3,
  value: '42',
  unit: 'px',
  board: 'LAND',
  mapId: 0,
  mapName: 'WORLD',
  ref: '0xABC',
  color: 'A7FF05',
  amount: '1.50',
  campaignId: 'c1',
  ruler: true,
}

describe('encode/decodeShareParams', () => {
  it('round-trips every field, preserving kind', () => {
    const sp = encodeShareParams('rank', FULL)
    const { kind, params } = decodeShareParams(sp)
    expect(kind).toBe('rank')
    expect(params).toEqual(FULL)
  })

  it('preserves mapId 0 (falsy but valid)', () => {
    const sp = encodeShareParams('positions', { mapId: 0 })
    expect(sp.get('m')).toBe('0')
    expect(decodeShareParams(sp).params.mapId).toBe(0)
  })

  it('skips empty, null and undefined values', () => {
    const sp = encodeShareParams('invite', { name: '', rank: undefined, value: '42' })
    expect(sp.has('n')).toBe(false)
    expect(sp.has('r')).toBe(false)
    expect(sp.get('v')).toBe('42')
  })

  it('only serializes a boolean flag when true', () => {
    expect(encodeShareParams('positions', { ruler: false }).has('k1')).toBe(false)
    expect(encodeShareParams('positions', { ruler: true }).get('k1')).toBe('1')
  })

  it('falls back to "positions" for a missing or unknown kind', () => {
    expect(decodeShareParams(new URLSearchParams()).kind).toBe('positions')
    expect(decodeShareParams(new URLSearchParams('k=bogus')).kind).toBe('positions')
  })

  it('accepts the other known kinds verbatim', () => {
    for (const k of ['rank', 'invite', 'reward'] as const) {
      expect(decodeShareParams(new URLSearchParams(`k=${k}`)).kind).toBe(k)
    }
  })

  it('drops non-finite numeric params on decode', () => {
    const { params } = decodeShareParams(new URLSearchParams('k=rank&r=abc&m=xyz'))
    expect(params.rank).toBeUndefined()
    expect(params.mapId).toBeUndefined()
  })
})

describe('URL builders', () => {
  it('buildShareUrl points at the /s route with encoded params', () => {
    const url = buildShareUrl('rank', { rank: 3 })
    expect(url.startsWith(`${originBase()}/s?`)).toBe(true)
    expect(url).toContain('k=rank')
    expect(url).toContain('r=3')
  })

  it('buildDeepLink carries map + lowercased ref', () => {
    expect(buildDeepLink({ mapId: 2, ref: '0xABCdef' })).toBe(
      `${originBase()}/?map=2&ref=0xabcdef`,
    )
  })

  it('buildDeepLink returns the bare origin when there is nothing to carry', () => {
    expect(buildDeepLink({})).toBe(`${originBase()}/`)
  })

  it('buildXIntentUrl prefills text + url', () => {
    const url = buildXIntentUrl('hello world', 'https://x.test/s')
    expect(url.startsWith('https://x.com/intent/tweet?')).toBe(true)
    expect(url).toContain('text=hello+world')
    expect(url).toContain('url=https%3A%2F%2Fx.test%2Fs')
  })

  it('buildTelegramUrl targets t.me/share/url', () => {
    const url = buildTelegramUrl('brag', 'https://x.test/s')
    expect(url.startsWith('https://t.me/share/url?')).toBe(true)
    expect(url).toContain('text=brag')
  })

  it('buildWhatsAppUrl folds the message into a single text field', () => {
    const url = buildWhatsAppUrl('come play https://x.test/s')
    expect(url.startsWith('https://api.whatsapp.com/send?')).toBe(true)
    expect(url).toContain('text=come+play')
  })
})

describe('formatMapName', () => {
  it('title-cases an all-caps map name', () => {
    expect(formatMapName('WORLD')).toBe('World')
    expect(formatMapName('NORTH AMERICA')).toBe('North America')
  })
})

describe('composeShareText', () => {
  it('reward: names the banked amount and reads "on the world map"', () => {
    const t = composeShareText('reward', { amount: '1.50', mapName: 'WORLD' })
    expect(t).toContain('$1.50')
    expect(t).toContain('on the world map')
    expect(t).toContain('@mondeto on @minipay')
  })

  it('reward: a continent map keeps proper-noun casing ("on the Europe map")', () => {
    const t = composeShareText('reward', { amount: '1', mapName: 'NORTH AMERICA' })
    expect(t).toContain('on the North America map')
  })

  it('reward: falls back to a generic prize line without an amount', () => {
    expect(composeShareText('reward', {})).toContain('cashed out a prize')
  })

  it('rank: names the rank, board and value', () => {
    const t = composeShareText('rank', { rank: 3, board: 'EMPIRE', value: '42', unit: 'px' })
    expect(t).toContain('#3')
    expect(t).toContain('EMPIRE')
    expect(t).toContain('(42 px)')
    expect(t).toContain('@mondeto on @minipay')
  })

  it('positions: ruler copy takes over when ruler + mapName are set', () => {
    expect(composeShareText('positions', { ruler: true, mapName: 'WORLD' })).toContain(
      'ruler of World',
    )
  })

  it('positions: reports the pixel count otherwise', () => {
    expect(composeShareText('positions', { value: '7' })).toContain('7 pixels')
  })

  it('invite: uses the generic claim line', () => {
    expect(composeShareText('invite', {})).toContain('Claim your spot')
  })
})

describe('channel composers', () => {
  const params: ShareParams = { rank: 1, board: 'LAND', mapName: 'WORLD' }

  it('composeShareMessage folds in the brag and the single share link', () => {
    const msg = composeShareMessage('rank', params)
    expect(msg).toContain(composeShareText('rank', params))
    expect(msg).toContain(SHARE_LINK)
  })

  it('composeXText carries the brag with the handles woven in', () => {
    const t = composeXText('rank', params)
    expect(t).toBe(composeShareText('rank', params))
    expect(t).toContain('@mondeto on @minipay')
  })

  it('composeTelegramText carries the brag with the handles woven in', () => {
    const t = composeTelegramText('rank', params)
    expect(t).toBe(composeShareText('rank', params))
    expect(t).toContain('@minipay')
  })
})
