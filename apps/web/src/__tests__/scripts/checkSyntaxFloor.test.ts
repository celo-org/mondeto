import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { SUPPORT_FLOOR_CHROME_MAJOR, BROWSERSLIST } from '@/lib/browserSupportFloor.mjs'
import { SUPPORT_FLOOR_CHROME_MAJOR as reExported } from '@/lib/userAgentInsight'
import {
  SYNTAX_FEATURES,
  scanSource,
  scanDirectory,
} from '../../../scripts/check-syntax-floor.mjs'

/**
 * The build-time guard for the browser support floor (#225).
 *
 * A dependency that publishes syntax newer than the floor breaks the bundle
 * at *parse* time on the WebViews MiniPay renders with — nothing inside the
 * chunk runs, including analytics, so the only signal is a support report.
 * `scripts/check-syntax-floor.mjs` scans the emitted client chunks after
 * `next build` and fails the build instead. These tests prove the guard can
 * go red without needing a full build, by running it against fixtures.
 */

const SCRIPT = path.resolve(process.cwd(), 'scripts/check-syntax-floor.mjs')
const FIXTURES = path.resolve(process.cwd(), 'src/__tests__/fixtures/syntax-floor')

function runCli(dir: string) {
  const r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

describe('the floor is named once', () => {
  it('is Chrome 80, as decided on #196', () => {
    expect(SUPPORT_FLOOR_CHROME_MAJOR).toBe(80)
  })

  it('userAgentInsight re-exports the same constant rather than its own copy', () => {
    expect(reExported).toBe(SUPPORT_FLOOR_CHROME_MAJOR)
  })

  it('the production browserslist is derived from it', () => {
    // package.json cannot import a constant, so this pins the copy it holds
    // to the one list the Next config and the polyfill set are built from.
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'))
    expect(pkg.browserslist).toEqual(BROWSERSLIST)
    expect(BROWSERSLIST).toContain(`chrome >= ${SUPPORT_FLOOR_CHROME_MAJOR}`)
  })

  it('the build runs the guard after next build', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'))
    expect(pkg.scripts.build).toBe('next build && node scripts/check-syntax-floor.mjs')
  })
})

describe('feature table', () => {
  it('flags exactly the features first shipped after the floor', () => {
    // `>` not `>=`: a feature that arrived in Chrome 80 itself (optional
    // chaining, nullish coalescing) is allowed — the floor has zero headroom.
    expect(SYNTAX_FEATURES['optional-chaining'].chrome).toBe(SUPPORT_FLOOR_CHROME_MAJOR)
    expect(SYNTAX_FEATURES['nullish-coalescing'].chrome).toBe(SUPPORT_FLOOR_CHROME_MAJOR)
    expect(SYNTAX_FEATURES['logical-assignment'].chrome).toBeGreaterThan(SUPPORT_FLOOR_CHROME_MAJOR)
    expect(SYNTAX_FEATURES['private-method'].chrome).toBeGreaterThan(SUPPORT_FLOOR_CHROME_MAJOR)
    expect(SYNTAX_FEATURES['class-static-block'].chrome).toBeGreaterThan(SUPPORT_FLOOR_CHROME_MAJOR)
    expect(SYNTAX_FEATURES['regexp-hasindices'].chrome).toBeGreaterThan(SUPPORT_FLOOR_CHROME_MAJOR)
    expect(SYNTAX_FEATURES['private-field'].chrome).toBeLessThan(SUPPORT_FLOOR_CHROME_MAJOR)
  })
})

describe('scanSource', () => {
  it.each([
    ['||=', 'a ||= b', 'logical-assignment'],
    ['&&=', 'a &&= b', 'logical-assignment'],
    ['??=', 'a ??= b', 'logical-assignment'],
    ['class static block', 'class A { static { A.x = 1 } }', 'class-static-block'],
    ['private method', 'class A { #m() {} }', 'private-method'],
    ['static private method', 'class A { static #m() {} }', 'private-method'],
    ['private accessor', 'class A { get #g() { return 1 } }', 'private-method'],
    ['private brand check', 'class A { #p; has(o) { return #p in o } }', 'private-in'],
    ['RegExp d flag', 'const r = /x/d', 'regexp-hasindices'],
    ['RegExp v flag', 'const r = /[\\p{L}]/v', 'regexp-unicode-sets'],
    ['top-level await', 'const x = await fetch("/")', 'top-level-await'],
  ])('flags %s', (_label, src, feature) => {
    const findings = scanSource(src, 'inline.js')
    expect(findings.map((f) => f.feature)).toContain(feature)
  })

  it.each([
    ['optional chaining', 'const v = a?.b?.()'],
    ['nullish coalescing', 'const v = a ?? b'],
    ['class fields, public and private', 'class A { x = 1; #p = 2; static s = 3 }'],
    ['numeric separator', 'const n = 1_000_000'],
    ['BigInt literal', 'const n = 10n'],
    ['optional catch binding', 'try { f() } catch { }'],
    ['dynamic import and import.meta', 'import("./x").then(() => import.meta)'],
    ['named groups and lookbehind', 'const r = /(?<=a)(?<n>b)/u'],
    ['await inside an async function', 'async function f() { await g() }'],
    ['for-await inside an async function', 'async function f() { for await (const x of g()) {} }'],
  ])('allows %s', (_label, src) => {
    expect(scanSource(src, 'inline.js')).toEqual([])
  })

  it('does not count operators that only occur inside strings, comments or regex bodies', () => {
    // The reason this is a parser and not a grep: minified chunks carry
    // arbitrary text, and `||=` inside a string is not syntax.
    const src = `
      const s = "x ||= y";       // comment: a ??= b
      const t = 'c &&= d';
      const r = /\\|\\|=/;
    `
    expect(scanSource(src, 'inline.js')).toEqual([])
  })

  it('reports a file it cannot parse at all as a finding, not as clean', () => {
    // Fail closed: syntax acorn does not know is newer than anything in the
    // table, so it is certainly above the floor.
    const findings = scanSource('class A { @dec m() {} }', 'inline.js')
    expect(findings).toHaveLength(1)
    expect(findings[0].feature).toBe('unparseable')
  })

  it('locates each finding by line and column', () => {
    const [f] = scanSource('let a;\nlet b;\na ||= b', 'inline.js')
    expect(f).toMatchObject({ file: 'inline.js', feature: 'logical-assignment', line: 3, column: 1 })
  })
})

describe('scanDirectory', () => {
  it('passes a directory whose chunks all parse on the floor', () => {
    const r = scanDirectory(path.join(FIXTURES, 'clean'))
    expect(r.files).toBe(1)
    expect(r.findings).toEqual([])
  })

  it('reports the offending file and count', () => {
    const r = scanDirectory(path.join(FIXTURES, 'above-floor'))
    expect(r.files).toBe(1)
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0].file).toMatch(/above-floor[\\/]chunk\.js$/)
  })
})

describe('CLI (the seam the build script uses)', () => {
  it('exits 0 on the clean fixture and names what it scanned', () => {
    const r = runCli(path.join(FIXTURES, 'clean'))
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/1 file/)
    expect(r.stdout).toMatch(new RegExp(`Chrome ${SUPPORT_FLOOR_CHROME_MAJOR}`))
  })

  it('exits 1 on the fixture with ||= and names the file, the feature and the count', () => {
    const r = runCli(path.join(FIXTURES, 'above-floor'))
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/above-floor[\\/]chunk\.js/)
    expect(r.stderr).toMatch(/logical-assignment/)
    expect(r.stderr).toMatch(/Chrome 85/)
    expect(r.stderr).toMatch(/1 finding/)
  })

  it('exits 1 when there is nothing to scan — a guard over zero files proves nothing', () => {
    const empty = fs.mkdtempSync(path.join(process.cwd(), '.tmp-empty-'))
    try {
      const r = runCli(empty)
      expect(r.status).toBe(1)
      expect(r.stderr).toMatch(/no \.js files/i)
    } finally {
      fs.rmSync(empty, { recursive: true, force: true })
    }
  })

  it('exits 1 on a directory that does not exist', () => {
    const r = runCli(path.join(FIXTURES, 'does-not-exist'))
    expect(r.status).toBe(1)
  })
})
