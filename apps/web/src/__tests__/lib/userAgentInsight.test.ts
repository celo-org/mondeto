import { describe, it, expect } from 'vitest'
import { inspectUserAgent, KNOWN_PARSEABLE_CHROME_MAJOR } from '@/lib/userAgentInsight'

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
    })
  })

  it('clears a current WebView', () => {
    expect(inspectUserAgent(PIXEL_WEBVIEW_150)).toEqual({
      chromeMajor: 150,
      isAndroidWebView: true,
      belowKnownFloor: false,
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
      })
    }
  })

  it('puts the boundary exactly at the syntax our dependencies ship', () => {
    const at = `Chrome/${KNOWN_PARSEABLE_CHROME_MAJOR}.0.0.0`
    const below = `Chrome/${KNOWN_PARSEABLE_CHROME_MAJOR - 1}.0.0.0`
    expect(inspectUserAgent(at).belowKnownFloor).toBe(false)
    expect(inspectUserAgent(below).belowKnownFloor).toBe(true)
  })
})
