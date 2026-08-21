#!/usr/bin/env node
/**
 * Post-build guard: fail `next build` if any emitted client JavaScript uses
 * syntax newer than the browser support floor (#225).
 *
 * Why this exists. MiniPay renders with the device's Android System WebView.
 * On the handsets this matters for that is a factory Chromium 80, and a single
 * `||=` in a 1 MB chunk is a SyntaxError that kills the whole chunk at parse
 * time — nothing inside it runs, including analytics, so the only signal is a
 * support report. Dependencies publish newer syntax on ordinary version bumps,
 * so the fix in `next.config.mjs` (an SWC pass over `node_modules`) needs a
 * tripwire that bites on the PR that regresses it, not three months later.
 *
 * How. Parse every `.js` under `.next/static` with acorn at the latest
 * ecmaVersion, walk the AST, and flag the nodes whose feature first shipped
 * in a Chrome major *above* the floor. A parser rather than a grep because
 * minified chunks carry arbitrary text: `"a ||= b"` inside a string is not
 * syntax. Anything acorn cannot parse at all is newer than everything in the
 * table and is reported as a finding, not skipped — the guard fails closed.
 *
 * Usage: node scripts/check-syntax-floor.mjs [dir]   (default: .next/static)
 * Exit 0 when every file is clean; 1 on any finding, on zero files scanned,
 * or on a missing directory. Output names each offending file, the feature,
 * the Chrome major it needs and where it is.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as acorn from 'acorn'
import { SUPPORT_FLOOR_CHROME_MAJOR } from '../src/lib/browserSupportFloor.mjs'

export { SUPPORT_FLOOR_CHROME_MAJOR }

/**
 * Syntax features acorn can tell apart, with the first Chrome major that
 * parses each (MDN browser-compat-data). Kept wider than the floor in both
 * directions on purpose: the floor is compared against this table, so moving
 * the floor moves the verdicts without anyone re-deriving a list. Only
 * features with `chrome > SUPPORT_FLOOR_CHROME_MAJOR` are findings.
 *
 * Runtime APIs (`Object.hasOwn`, `Promise.any`, …) are not syntax and cannot
 * be seen here; they are covered by the core-js polyfills in `src/polyfills.ts`.
 */
export const SYNTAX_FEATURES = {
  'dynamic-import': { chrome: 63, label: 'import()' },
  'import-meta': { chrome: 64, label: 'import.meta' },
  'optional-catch-binding': { chrome: 66, label: 'catch without a binding' },
  bigint: { chrome: 67, label: 'BigInt literal' },
  'class-field': { chrome: 72, label: 'public class field' },
  'private-field': { chrome: 74, label: 'private class field (#x = …)' },
  'numeric-separator': { chrome: 75, label: 'numeric separator (1_000)' },
  'optional-chaining': { chrome: 80, label: 'optional chaining (?.)' },
  'nullish-coalescing': { chrome: 80, label: 'nullish coalescing (??)' },
  'private-method': { chrome: 84, label: 'private method or accessor (#m() {})' },
  'logical-assignment': { chrome: 85, label: 'logical assignment (||= &&= ??=)' },
  'top-level-await': { chrome: 89, label: 'top-level await' },
  'regexp-hasindices': { chrome: 90, label: 'RegExp d flag' },
  'regexp-post-es2020': { chrome: 90, label: 'RegExp syntax newer than ES2020' },
  'private-in': { chrome: 91, label: 'private brand check (#x in obj)' },
  'class-static-block': { chrome: 94, label: 'class static block' },
  'regexp-unicode-sets': { chrome: 112, label: 'RegExp v flag' },
  unparseable: { chrome: Infinity, label: 'syntax acorn cannot parse (newer than anything in this table)' },
}

const LOGICAL_ASSIGNMENT = new Set(['||=', '&&=', '??='])

/**
 * Scan one source text. Returns every construct above the floor, located by
 * line and column (1-based column, to match editor conventions).
 */
export function scanSource(source, file, floor = SUPPORT_FLOOR_CHROME_MAJOR) {
  const findings = []
  const add = (feature, node, detail) => {
    const { chrome } = SYNTAX_FEATURES[feature]
    if (chrome <= floor) return
    const loc = node?.loc?.start
    findings.push({
      file,
      feature,
      chrome,
      line: loc ? loc.line : 1,
      column: loc ? loc.column + 1 : 1,
      detail: detail ?? SYNTAX_FEATURES[feature].label,
    })
  }

  let ast
  try {
    ast = parse(source)
  } catch (err) {
    const loc = err?.loc
    add('unparseable', loc ? { loc: { start: loc } } : undefined, String(err?.message ?? err))
    return findings
  }

  // Generic walk over ESTree nodes, tracking whether we are inside a function
  // body so that `await` can be classified as top-level or not.
  const visit = (node, inFunction) => {
    if (!node || typeof node.type !== 'string') return
    switch (node.type) {
      case 'AssignmentExpression':
        if (LOGICAL_ASSIGNMENT.has(node.operator)) add('logical-assignment', node, node.operator)
        break
      case 'LogicalExpression':
        if (node.operator === '??') add('nullish-coalescing', node)
        break
      case 'ChainExpression':
        add('optional-chaining', node)
        break
      case 'StaticBlock':
        add('class-static-block', node)
        break
      case 'MethodDefinition':
        if (node.key?.type === 'PrivateIdentifier') add('private-method', node, `#${node.key.name}`)
        break
      case 'PropertyDefinition':
        if (node.key?.type === 'PrivateIdentifier') add('private-field', node, `#${node.key.name}`)
        else add('class-field', node)
        break
      case 'BinaryExpression':
        if (node.operator === 'in' && node.left?.type === 'PrivateIdentifier') add('private-in', node)
        break
      case 'CatchClause':
        if (node.param === null) add('optional-catch-binding', node)
        break
      case 'ImportExpression':
        add('dynamic-import', node)
        break
      case 'MetaProperty':
        add('import-meta', node)
        break
      case 'AwaitExpression':
        if (!inFunction) add('top-level-await', node)
        break
      case 'ForOfStatement':
        if (node.await && !inFunction) add('top-level-await', node)
        break
      case 'Literal':
        if (node.regex) checkRegex(node, add)
        else if (node.bigint !== undefined) add('bigint', node)
        else if (typeof node.value === 'number' && node.raw?.includes('_')) add('numeric-separator', node)
        break
      default:
        break
    }
    const nextInFunction =
      inFunction ||
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue
      const value = node[key]
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') visit(child, nextInFunction)
      } else if (value && typeof value.type === 'string') {
        visit(value, nextInFunction)
      }
    }
  }
  visit(ast, false)
  return findings
}

function parse(source) {
  const base = { ecmaVersion: 'latest', locations: true, allowHashBang: true }
  try {
    return acorn.parse(source, { ...base, sourceType: 'script' })
  } catch (scriptError) {
    try {
      return acorn.parse(source, { ...base, sourceType: 'module' })
    } catch {
      throw scriptError
    }
  }
}

function checkRegex(node, add) {
  const { pattern, flags } = node.regex
  if (flags.includes('d')) add('regexp-hasindices', node, `/${pattern}/${flags}`)
  if (flags.includes('v')) add('regexp-unicode-sets', node, `/${pattern}/${flags}`)
  // ES2020 is a clean proxy for the floor on the regex side: every pattern
  // feature Chrome 80 accepts (lookbehind, named groups, `s`, `\p{…}`) is
  // ES2018, and everything acorn accepts at `latest` but rejects at 2020
  // (modifiers, duplicate named groups, …) is Chrome 90+.
  if (flags.includes('d') || flags.includes('v')) return
  try {
    acorn.parse(`/${pattern}/${flags}`, { ecmaVersion: 2020 })
  } catch {
    add('regexp-post-es2020', node, `/${pattern}/${flags}`)
  }
}

function listJsFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full)
    }
  }
  walk(dir)
  return out.sort()
}

/** Scan every `.js` under `dir`, recursively. */
export function scanDirectory(dir, floor = SUPPORT_FLOOR_CHROME_MAJOR) {
  const files = listJsFiles(dir)
  const findings = []
  for (const file of files) findings.push(...scanSource(fs.readFileSync(file, 'utf8'), file, floor))
  return { files: files.length, findings }
}

export function main(argv = process.argv.slice(2)) {
  const dir = path.resolve(argv[0] ?? '.next/static')
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`check-syntax-floor: ${dir} is not a directory (run after \`next build\`)`)
    return 1
  }
  const { files, findings } = scanDirectory(dir)
  if (files === 0) {
    console.error(`check-syntax-floor: no .js files under ${dir} — nothing was verified`)
    return 1
  }
  if (findings.length === 0) {
    console.log(`check-syntax-floor: ${files} file${files === 1 ? '' : 's'} under ${path.relative(process.cwd(), dir) || '.'} parse on Chrome ${SUPPORT_FLOOR_CHROME_MAJOR}`)
    return 0
  }
  const byFile = new Map()
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, [])
    byFile.get(f.file).push(f)
  }
  console.error(
    `check-syntax-floor: ${findings.length} finding${findings.length === 1 ? '' : 's'} above the Chrome ${SUPPORT_FLOOR_CHROME_MAJOR} support floor in ${byFile.size} of ${files} files:`,
  )
  for (const [file, list] of byFile) {
    console.error(`  ${path.relative(process.cwd(), file)}: ${list.length}`)
    for (const f of list.slice(0, 10)) {
      console.error(`    ${f.line}:${f.column}  ${f.feature} (Chrome ${f.chrome})  ${f.detail}`)
    }
    if (list.length > 10) console.error(`    … and ${list.length - 10} more`)
  }
  console.error(
    '\nA dependency is shipping syntax the support floor cannot parse. The SWC pass in next.config.mjs should have down-levelled it — check that the rule still covers this file, or that the feature is one SWC transforms (private methods are not). See apps/web/CLAUDE.md, "Browser support floor".',
  )
  return 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
