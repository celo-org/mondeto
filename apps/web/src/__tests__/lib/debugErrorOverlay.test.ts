import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { DEBUG_ERROR_OVERLAY } from '@/lib/debugErrorOverlay'

/**
 * The overlay is the one piece of JavaScript that has to run on the engine
 * that just failed to parse everything else — MiniPay's Android System
 * WebView, Chrome 80 on the handsets #196 is about. Two things are pinned:
 *
 * 1. The payload contains no syntax above ES5. A single arrow function or
 *    `const` would make the diagnostic tool die of the disease it diagnoses,
 *    and nothing else in the build would notice — Next down-levels our
 *    source but an inline string is shipped verbatim.
 * 2. Its behaviour through the seam: the string is evaluated in a fresh
 *    browser-like window, exactly as the inline <script> would be, and
 *    events are dispatched at it. Absence assertions (no flag → nothing
 *    mounted) are paired with the presence control (flag → banner) so they
 *    cannot pass vacuously.
 */

// ES5 syntax guard. Conservative on purpose: it also scans string literals,
// so a false positive fails loudly rather than a modern token slipping by.
// `acorn` is not a declared dependency of this package, so the guard is a
// pinned token list rather than a parser — extend it, never relax it.
const POST_ES5_SYNTAX: Array<[name: string, pattern: RegExp]> = [
  ['arrow function', /=>/],
  ['const declaration', /\bconst\b/],
  ['let declaration', /\blet\b/],
  ['template literal', /`/],
  ['optional chaining', /\?\./],
  ['nullish coalescing', /\?\?/],
  ['spread / rest', /\.\.\./],
  ['class', /\bclass\b/],
  ['for...of', /\bfor\s*\([^)]*\bof\b/],
  ['async / await', /\b(async|await)\b/],
  ['generator', /function\s*\*|\byield\b/],
  ['logical assignment', /(\|\||&&)=/],
  ['exponent operator', /\*\*/],
  ['default parameter', /function\s*\w*\s*\([^)]*=/],
  // Not guarded: shorthand methods / property names in object literals. In
  // minified code `{show(` is indistinguishable by regex from a block whose
  // first statement is a call, which the payload is full of.
]

describe('debugErrorOverlay payload is ES5-only', () => {
  it.each(POST_ES5_SYNTAX)('contains no %s', (_name, pattern) => {
    expect(DEBUG_ERROR_OVERLAY).not.toMatch(pattern)
  })

  it('is syntactically valid JavaScript at all (control for the guard above)', () => {
    // A guard that only asserts absence would pass on an empty string.
    expect(DEBUG_ERROR_OVERLAY.length).toBeGreaterThan(200)
    expect(() => new Function(DEBUG_ERROR_OVERLAY)).not.toThrow()
  })

  it('the guard itself can see modern syntax (control)', () => {
    const poisoned = DEBUG_ERROR_OVERLAY.replace('(function(){', '(function(){const x=()=>1;')
    const hits = POST_ES5_SYNTAX.filter(([, p]) => p.test(poisoned)).map(([n]) => n)
    expect(hits).toEqual(expect.arrayContaining(['arrow function', 'const declaration']))
  })
})

// ---------------------------------------------------------------------------

type Page = { window: JSDOM['window']; banner: () => HTMLElement | null }

/** Boot a fresh window at `url` and run the overlay in it, as the inline
 *  <script> would. Fresh per call so listeners never leak between tests. */
function boot(url: string): Page {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url,
    runScripts: 'outside-only',
  })
  dom.window.eval(DEBUG_ERROR_OVERLAY)
  return {
    window: dom.window,
    banner: () => fixedBanners(dom.window)[0] ?? null,
  }
}

/** Every fixed, top-of-viewport element in <body> — the script adds exactly
 *  one, and nothing else in the fixture adds any. */
function fixedBanners(w: JSDOM['window']): HTMLElement[] {
  const children: HTMLElement[] = Array.from(w.document.body.children) as HTMLElement[]
  return children.filter((el) => (el.getAttribute('style') ?? '').includes('position:fixed'))
}

function throwUncaught(w: JSDOM['window'], message: string, filename = '', lineno = 0) {
  w.dispatchEvent(new w.ErrorEvent('error', { message, filename, lineno }))
}

function rejectUnhandled(w: JSDOM['window'], reason: unknown) {
  const ev = new w.Event('unhandledrejection')
  Object.defineProperty(ev, 'reason', { value: reason })
  w.dispatchEvent(ev)
}

describe('debugErrorOverlay with ?debug=1', () => {
  it('paints an uncaught error with message, source and line', () => {
    const page = boot('http://localhost/?debug=1')
    throwUncaught(page.window, "Uncaught SyntaxError: Unexpected token '='", '/_next/static/chunks/286.js', 1)

    const banner = page.banner()
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toContain("ERROR: Uncaught SyntaxError: Unexpected token '='")
    expect(banner!.textContent).toContain('at /_next/static/chunks/286.js:1')
  })

  it('paints an unhandled rejection, preferring the stack and falling back to the message', () => {
    const page = boot('http://localhost/?debug=1')
    const withStack = new Error('rpc exploded')
    withStack.stack = 'Error: rpc exploded\n    at fetchThing (chunk.js:9)'
    rejectUnhandled(page.window, withStack)
    rejectUnhandled(page.window, { message: 'message only' })

    const text = page.banner()!.textContent ?? ''
    expect(text).toContain('UNHANDLED REJECTION: Error: rpc exploded\n    at fetchThing (chunk.js:9)')
    expect(text).toContain('UNHANDLED REJECTION: message only')
  })

  it('stringifies reasons that are not errors instead of throwing', () => {
    const page = boot('http://localhost/?debug=1')
    expect(() => {
      rejectUnhandled(page.window, 'plain string')
      rejectUnhandled(page.window, undefined)
      rejectUnhandled(page.window, null)
    }).not.toThrow()

    const text = page.banner()!.textContent ?? ''
    expect(text).toContain('UNHANDLED REJECTION: plain string')
    expect(text).toContain('UNHANDLED REJECTION: undefined')
    expect(text).toContain('UNHANDLED REJECTION: null')
  })

  it('appends every failure to one banner, in order', () => {
    const page = boot('http://localhost/?debug=1')
    throwUncaught(page.window, 'first')
    throwUncaught(page.window, 'second')

    const fixed = fixedBanners(page.window)
    expect(fixed).toHaveLength(1)
    const lines: Array<string | null> = Array.from(fixed[0].children, (el) => el.textContent)
    expect(lines).toEqual(['ERROR: first', 'ERROR: second'])
  })

  it('reports the engine once the document has loaded, so a failure arrives with its environment', async () => {
    const page = boot('http://localhost/?debug=1')
    await new Promise((r) => setTimeout(r, 0))

    const text = page.banner()!.textContent ?? ''
    expect(text).toContain('UA: ' + page.window.navigator.userAgent)
    expect(text).toMatch(/HAS: hasOwn:(function|undefined) replaceAll:(function|undefined)/)
  })

  it('is armed by the flag anywhere in the query string', () => {
    const page = boot('http://localhost/?utm_source=x&debug=1')
    throwUncaught(page.window, 'boom')
    expect(page.banner()).not.toBeNull()
  })

  it('stays on top of everything and inside the viewport', () => {
    const page = boot('http://localhost/?debug=1')
    throwUncaught(page.window, 'boom')
    const style = page.banner()!.getAttribute('style') ?? ''
    expect(style).toContain('z-index:2147483647')
    expect(style).toContain('max-height:60%')
    expect(style).toContain('overflow:auto')
  })
})

describe('debugErrorOverlay without ?debug=1', () => {
  it.each([
    ['no query string', 'http://localhost/'],
    ['unrelated query', 'http://localhost/?utm_source=x'],
    ['debug=0', 'http://localhost/?debug=0'],
    ['debug=10 (prefix match is not the flag)', 'http://localhost/?debug=10'],
    ['xdebug=1 (suffix match is not the flag)', 'http://localhost/?xdebug=1'],
  ])('installs nothing and paints nothing: %s', async (_label, url) => {
    const page = boot(url)

    expect(page.window.onerror).toBeNull()

    throwUncaught(page.window, 'boom', 'chunk.js', 1)
    rejectUnhandled(page.window, new Error('nope'))
    await new Promise((r) => setTimeout(r, 0)) // past DOMContentLoaded

    expect(page.banner()).toBeNull()
    expect(page.window.document.body.children).toHaveLength(0)
  })
})
