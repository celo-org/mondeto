import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Flat config, replacing `.eslintrc.json`.
//
// Two deprecations forced this rather than a version bump: `next lint` is
// removed in Next 16 (it printed the notice on every CI run), and ESLint 8 is
// end-of-life. `eslint.config.mjs` is the default in ESLint 9 and the only
// supported format in ESLint 10, so writing eslintrc here would have meant
// doing the migration twice.
//
// `eslint-config-next` is still an eslintrc-style shareable config, so it is
// pulled in through FlatCompat rather than imported directly. That is what the
// upstream `next-lint-to-eslint-cli` codemod generates, and it is the reason
// @eslint/eslintrc is a direct devDependency.
//
// Deliberately behaviour-neutral: same `next/core-web-vitals` rule set, same
// single override, same 22 warnings before and after. Which rules we actually
// want, and gating on `--max-warnings`, are #210 — not this change.
const compat = new FlatCompat({ baseDirectory: __dirname })

// Named rather than exported anonymously: flat config puts this file inside the
// lint scope for the first time, and a bare `export default [...]` trips
// import/no-anonymous-default-export from the very config declaring it.
const eslintConfig = [
  {
    // Flat config has no implicit ignores beyond node_modules, whereas
    // `next lint` skipped build output by default. Without this, `eslint .`
    // walks generated trees and reports on bundles we don't own.
    //
    // This list has to cover everything gitignored that can appear under
    // apps/web, not just the outputs CI happens to produce: CI lints a clean
    // checkout, so a gap here shows up only on developer machines. `.vercel/`
    // is the one to remember — `apps/web/.gitignore` exists solely for it, and
    // `vercel build` fills it with the entire bundled app.
    ignores: [
      '.next/**',
      '.vercel/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'next-env.d.ts',
      'public/**',
    ],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      // Apostrophes in player-facing copy read as typos when escaped.
      'react/no-unescaped-entities': 'off',
    },
  },
]

export default eslintConfig
