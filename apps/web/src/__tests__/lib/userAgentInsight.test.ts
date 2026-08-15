import { describe, it, expect } from 'vitest'
import {
  classifyRequestKind,
  inspectUserAgent,
  shouldRetainRawUserAgent,
  KNOWN_PARSEABLE_CHROME_MAJOR,
  SUPPORT_FLOOR_CHROME_MAJOR,
} from '@/lib/userAgentInsight'

// The two devices from the #196 investigation, verbatim in shape: a Huawei
// Mate 20 Lite whose system WebView never left the 2018 factory image, and a
// current Pixel. The first is what we cannot render on.
const HUAWEI_WEBVIEW_80 =
  'Mozilla/5.0 (Linux; Android 10; SNE-LX3 Build/HUAWEISNE-L21; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/80.0.3987.99 Mobile Safari/537.36'
const PIXEL_WEBVIEW_150 =
  'Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro Build/BP41.250916.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/150.0.7871.181 Mobile Safari/537.36'
const DESKTOP_CHROME_150 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.186 Safari/537.36'
const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

describe('inspectUserAgent', () => {
  it('flags the WebView 80 device that cannot parse our bundle', () => {
    expect(inspectUserAgent(HUAWEI_WEBVIEW_80)).toEqual({
      chromeMajor: 80,
      isAndroidWebView: true,
      belowKnownFloor: true,
      belowSupportFloor: false,
      isLikelyBot: false,
    })
  })

  it('clears a current WebView', () => {
    expect(inspectUserAgent(PIXEL_WEBVIEW_150)).toEqual({
      chromeMajor: 150,
      isAndroidWebView: true,
      belowKnownFloor: false,
      belowSupportFloor: false,
      isLikelyBot: false,
    })
  })

  it('distinguishes a real browser from an embedded WebView', () => {
    expect(inspectUserAgent(DESKTOP_CHROME_150).isAndroidWebView).toBe(false)
    expect(inspectUserAgent(PIXEL_WEBVIEW_150).isAndroidWebView).toBe(true)
  })

  it('treats an unknown engine as unknown rather than old', () => {
    // Safari advertises no Chrome/ token; guessing "old" here would inflate
    // the very number this exists to measure.
    const safari = inspectUserAgent(IOS_SAFARI)
    expect(safari.chromeMajor).toBeNull()
    expect(safari.belowKnownFloor).toBe(false)
  })

  it('handles a missing or empty header without throwing', () => {
    for (const value of [null, undefined, '']) {
      expect(inspectUserAgent(value)).toEqual({
        chromeMajor: null,
        isAndroidWebView: false,
        belowKnownFloor: false,
        belowSupportFloor: false,
        isLikelyBot: false,
      })
    }
  })

  it('puts the boundary exactly at the syntax our dependencies ship', () => {
    // Full UA strings, not bare fragments: the boundary has to hold in a
    // realistic header, which is the only kind we ever receive.
    const at = HUAWEI_WEBVIEW_80.replace('Chrome/80.0.3987.99', `Chrome/${KNOWN_PARSEABLE_CHROME_MAJOR}.0.0.0`)
    const below = HUAWEI_WEBVIEW_80.replace(
      'Chrome/80.0.3987.99',
      `Chrome/${KNOWN_PARSEABLE_CHROME_MAJOR - 1}.0.0.0`,
    )
    expect(inspectUserAgent(at).belowKnownFloor).toBe(false)
    expect(inspectUserAgent(below).belowKnownFloor).toBe(true)
  })

  it('reads the Chromium base, not the vendor number, for Edge/Opera/Samsung', () => {
    // userAgentInsight.ts documents this as deliberate but nothing pinned it,
    // so an "improvement" that started matching Edg/ or OPR/ would pass.
    const edge =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91'
    const opera =
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.185 Mobile Safari/537.36 OPR/61.2.3076.56749'
    const samsung =
      'Mozilla/5.0 (Linux; Android 9) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/10.1 Chrome/71.0.3578.99 Mobile Safari/537.36'
    expect(inspectUserAgent(edge).chromeMajor).toBe(120)
    expect(inspectUserAgent(opera).chromeMajor).toBe(86)
    expect(inspectUserAgent(samsung).chromeMajor).toBe(71)
    expect(inspectUserAgent(samsung).belowKnownFloor).toBe(true)
  })

  it('reports Chrome and Edge on iOS as unknown, not as an ancient engine', () => {
    // The trap most UA parsers fall into: these carry no Chrome/ token, so a
    // looser pattern would bucket every iOS Chrome user under a WebKit major.
    const crios =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1'
    const edgios =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/126.0.2592.87 Mobile/15E148 Safari/605.1.15'
    for (const ua of [crios, edgios]) {
      expect(inspectUserAgent(ua).chromeMajor).toBeNull()
      expect(inspectUserAgent(ua).belowKnownFloor).toBe(false)
    }
  })

  it('misses the wv token on pre-Lollipop WebViews, which is why bots are gated separately', () => {
    // Android 4.4's WebView predates the `wv` token, so it reads as a plain
    // browser. Pinned as known behaviour: it still lands in the numerator, and
    // only drops out when the analysis gates on isAndroidWebView.
    const kitkat =
      'Mozilla/5.0 (Linux; U; Android 4.4.2; en-us; SM-G900F Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36'
    const insight = inspectUserAgent(kitkat)
    expect(insight.chromeMajor).toBe(30)
    expect(insight.isAndroidWebView).toBe(false)
    expect(insight.belowKnownFloor).toBe(true)
  })

  it('survives absurd and malformed version strings', () => {
    expect(inspectUserAgent('Chrome/99999999999999999999').belowKnownFloor).toBe(false)
    expect(inspectUserAgent('Chrome/0080').chromeMajor).toBe(80)
    // Googlebot's literal placeholder — no digits, so no version.
    expect(inspectUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1) Chrome/W.X.Y.Z').chromeMajor)
      .toBeNull()
  })
})

describe('isLikelyBot', () => {
  it('catches the spoofed old-Chrome strings that would poison the numerator', () => {
    // The classic old-Googlebot spoof: a real Chrome major, old enough to
    // count as broken, from something that was never a handset.
    const spoof =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
    const insight = inspectUserAgent(spoof)
    expect(insight.chromeMajor).toBe(41)
    expect(insight.belowKnownFloor).toBe(true)
    expect(insight.isLikelyBot).toBe(true)
  })

  it('catches the unfurlers that inflate the denominator on shared links', () => {
    for (const ua of [
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Mozilla/5.0 (compatible; Twitterbot/1.0)',
      'WhatsApp/2.23.20.0',
      'TelegramBot (like TwitterBot)',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) HeadlessChrome/120.0.0.0',
    ]) {
      expect(inspectUserAgent(ua).isLikelyBot).toBe(true)
    }
  })

  it('does not flag the real devices this census is about', () => {
    for (const ua of [HUAWEI_WEBVIEW_80, PIXEL_WEBVIEW_150, DESKTOP_CHROME_150, IOS_SAFARI]) {
      expect(inspectUserAgent(ua).isLikelyBot).toBe(false)
    }
  })
})

describe('shouldRetainRawUserAgent', () => {
  it('keeps the string for the population under investigation', () => {
    // Old engine, embedded WebView, or an engine we couldn't parse at all —
    // the three shapes we may need to re-parse later.
    expect(shouldRetainRawUserAgent(inspectUserAgent(HUAWEI_WEBVIEW_80))).toBe(true)
    expect(shouldRetainRawUserAgent(inspectUserAgent(PIXEL_WEBVIEW_150))).toBe(true)
    expect(shouldRetainRawUserAgent(inspectUserAgent(IOS_SAFARI))).toBe(true)
  })

  it('drops it for the healthy majority, where the parsed fields say everything', () => {
    expect(shouldRetainRawUserAgent(inspectUserAgent(DESKTOP_CHROME_150))).toBe(false)
  })

  it('keeps the support floor separate from the parse floor', () => {
    // The gap between the two is the whole point: engines we committed to
    // serving and currently break on. Reported as one number it disappears.
    expect(SUPPORT_FLOOR_CHROME_MAJOR).toBeLessThan(KNOWN_PARSEABLE_CHROME_MAJOR)

    const inGap = inspectUserAgent(`Chrome/${SUPPORT_FLOOR_CHROME_MAJOR}.0.0.0`)
    expect(inGap.belowSupportFloor).toBe(false) // we said we support it...
    expect(inGap.belowKnownFloor).toBe(true) //    ...and it can't parse us

    const outOfScope = inspectUserAgent(`Chrome/${SUPPORT_FLOOR_CHROME_MAJOR - 1}.0.0.0`)
    expect(outOfScope.belowSupportFloor).toBe(true)

    const fine = inspectUserAgent(`Chrome/${KNOWN_PARSEABLE_CHROME_MAJOR}.0.0.0`)
    expect(fine.belowKnownFloor).toBe(false)
    expect(fine.belowSupportFloor).toBe(false)
  })
})

describe('classifyRequestKind', () => {
  it('separates the request kinds a healthy client can make', () => {
    expect(classifyRequestKind(null, null)).toBe('document')
    expect(classifyRequestKind('1', null)).toBe('rsc')
    expect(classifyRequestKind('1', '1')).toBe('prefetch')
  })

  it('calls a prefetch a prefetch even though it is also an RSC request', () => {
    // Order matters: Next sends both headers on a prefetch, so testing RSC
    // first would bury every prefetch in the rsc bucket.
    expect(classifyRequestKind('1', '1')).toBe('prefetch')
    expect(classifyRequestKind(null, '1')).toBe('prefetch')
  })

  it('treats a missing or empty header as a plain document request', () => {
    // Only a document request can stand for a person who never hydrated —
    // misfiling one as RSC would drop a broken client from the count.
    expect(classifyRequestKind(undefined, undefined)).toBe('document')
    expect(classifyRequestKind('', '')).toBe('document')
  })
})
