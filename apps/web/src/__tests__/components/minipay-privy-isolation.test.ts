import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Guards the module boundary that keeps `@privy-io/*` — and the `x402` /
 * `@solana/kit` subtree it drags with it — out of the chunk MiniPay clients
 * download.
 *
 * MiniPay renders with the device's Android System WebView, which on the
 * phones this matters for is a 2018 factory build. Those clients get the
 * injected connector and never mount `PrivyTree`, so they can never use any
 * of that code — but webpack resolves static imports at build time, and one
 * named import from a module mounted by `TopBar` is enough to put the whole
 * graph on every page.
 *
 * This is asserted at source level rather than against built output because
 * it needs to fail in CI on the PR that reintroduces the import, not after a
 * production build. The realistic regression is someone adding `import { X }
 * from '@privy-io/react-auth'` back to the shell — or, more subtly, importing
 * something from a module that itself imports Privy, which is exactly how
 * this happened the first time (`PrivyReadyContext` used to live in
 * `wallet-provider-privy.tsx`).
 */

const COMPONENTS = path.join(process.cwd(), 'src/components')

function read(file: string): string {
  return fs.readFileSync(path.join(COMPONENTS, file), 'utf8')
}

/** Static `import ... from '<spec>'` sources only — ignores `import()`. */
function staticImportSources(source: string): string[] {
  return Array.from(
    source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm),
    (m) => m[1],
  )
}

// Modules reachable from `TopBar` / `navbar` on every page, including the map,
// which is the MiniPay entry path. None of these may reach Privy.
// `wallet-provider.tsx` wraps every page from the root layout and reaches
// `wallet-provider-privy` only through a dynamic `import()`, which the
// static-import matcher deliberately ignores.
const MINIPAY_PATH_MODULES = [
  'connect-button.tsx',
  'connect-button-styles.ts',
  'privy-ready-context.ts',
  'wallet-provider.tsx',
]

describe('MiniPay bundle isolation', () => {
  it.each(MINIPAY_PATH_MODULES)(
    '%s does not statically import @privy-io',
    (file) => {
      const privy = staticImportSources(read(file)).filter((s) =>
        s.startsWith('@privy-io'),
      )
      expect(privy).toEqual([])
    },
  )

  it.each(MINIPAY_PATH_MODULES)(
    '%s does not statically import wallet-provider-privy, which imports Privy',
    (file) => {
      const viaProvider = staticImportSources(read(file)).filter((s) =>
        s.includes('wallet-provider-privy'),
      )
      expect(viaProvider).toEqual([])
    },
  )

  it('the Privy-dependent half is loaded with next/dynamic', () => {
    const shell = read('connect-button.tsx')
    // If this is ever changed to a static import the assertions above still
    // fail, but this pins the mechanism so the intent survives a refactor.
    expect(shell).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\(['"]\.\/connect-button-interactive['"]\)/,
    )
    expect(shell).toMatch(/ssr:\s*false/)
  })

  it('the interactive half is the only place Privy is reached from', () => {
    // Sanity check that the split actually moved the dependency rather than
    // dropping the feature: something still has to import the Privy hook.
    const interactive = read('connect-button-interactive.tsx')
    expect(staticImportSources(interactive)).toContain('@privy-io/react-auth')
  })

  it('PrivyReadyContext lives in a module with no Privy dependency', () => {
    const context = read('privy-ready-context.ts')
    expect(staticImportSources(context)).toEqual(['react'])
  })
})
