import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Pins how the root layout mounts the `?debug=1` error overlay. The
 * load-bearing detail is that it is a *raw inline* <script> in <head>, which
 * the HTML parser executes the moment it reaches it — before any of Next's
 * `async` chunks can have been fetched, let alone executed, and without
 * depending on any of them parsing.
 *
 * The tempting alternative, `<Script strategy="beforeInteractive">`, is what
 * the diagnosis on #204 used and what #247 asked for, and it is measurably
 * too late in the App Router: next/script does not emit a script for it, it
 * serialises the body into a `self.__next_s` queue that `appBootstrap()` in
 * the `main-app` chunk drains right before hydration. Served and measured
 * in headless Chrome with one chunk replaced by a parse error: with the
 * React framework chunk poisoned, the `beforeInteractive` overlay never
 * ran at all (main-app requires React before it reaches appBootstrap); the
 * raw inline script painted the SyntaxError. Details in the PR for #247.
 *
 * Source-level rather than rendered because the layout is an async server
 * component (it reads request headers), which React 18's DOM renderers
 * cannot render in a unit test; same approach as the MiniPay bundle
 * isolation guard in `components/minipay-privy-isolation.test.ts`.
 */

const layout = fs.readFileSync(
  path.join(process.cwd(), 'src/app/layout.tsx'),
  'utf8',
)

/** The JSX of one `<script ...>` / `<Script ...>` element carrying `id`. */
function scriptElement(tag: 'script' | 'Script', id: string): string | null {
  const m = layout.match(new RegExp(`<${tag}\\b[^>]*\\bid=["']${id}["'][^>]*>`))
  return m ? m[0] : null
}

describe('root layout mounts the debug error overlay', () => {
  it('imports the overlay payload', () => {
    expect(layout).toMatch(
      /import\s+\{\s*DEBUG_ERROR_OVERLAY\s*\}\s+from\s+['"]@\/lib\/debugErrorOverlay['"]/,
    )
  })

  it('inlines it as a raw <script> inside <head>', () => {
    const el = scriptElement('script', 'debug-error-overlay')
    expect(el).not.toBeNull()
    expect(el).toMatch(/dangerouslySetInnerHTML=\{\{\s*__html:\s*DEBUG_ERROR_OVERLAY\s*\}\}/)

    const head = layout.slice(layout.indexOf('<head>'), layout.indexOf('</head>'))
    expect(head).toContain(el!)
  })

  it('does not defer it to the browser or to Next', () => {
    const el = scriptElement('script', 'debug-error-overlay')!
    // `async`/`defer`/`src` would all let a chunk run first.
    expect(el).not.toMatch(/\b(async|defer|src)\b/)
    // next/script's beforeInteractive is a queue drained by main-app, not a
    // script — see the header comment.
    expect(scriptElement('Script', 'debug-error-overlay')).toBeNull()
    expect(layout).not.toMatch(/strategy=["']beforeInteractive["']/)
  })
})
