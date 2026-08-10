import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**'],
      exclude: [
        'src/__tests__/**',
        '**/*.d.ts',
        // Dev-only surfaces. `src/app/dev/layout.tsx` calls notFound() when
        // VERCEL_ENV === 'production', so none of this reaches players and
        // gating on its coverage would only distort the number.
        'src/app/dev/**',
        // Next.js file conventions — framework glue with no logic of ours.
        'src/app/**/{layout,error,not-found,loading,opengraph-image}.tsx',
        'src/instrumentation.ts',
      ],
      // Floors, not targets. Each is set just under what the suite achieves
      // today, so the gate catches a *regression* without demanding new tests
      // from whoever happens to touch a file next. When coverage rises,
      // raise these — they are meant to ratchet, and they only ratchet if
      // someone moves them.
      //
      // Measured on the commit that introduced this config:
      //
      //                stmts   branch    func    lines
      //   overall     28.98%   25.39%  28.57%   29.50%
      //   src/lib     71.70%   65.76%  73.36%   73.79%
      //   src/hooks   33.65%   27.58%  26.97%   35.29%
      //   components   6.6%  and  app  0.1%  — effectively untested
      //
      // The split is deliberate. Business logic under lib/ is genuinely well
      // tested and worth protecting at a high floor. Components and routes are
      // near zero, and a single global number would let lib/ rot while the
      // average is propped up by something else.
      //
      // components/ and app/ are deliberately NOT gated. Putting a 6% floor on
      // them would be a number that passes without asserting anything. The
      // honest statement is that they are untested, and that belongs in an
      // issue rather than in a threshold that rubber-stamps the status quo.
      thresholds: {
        statements: 28,
        branches: 25,
        functions: 28,
        lines: 29,
        'src/lib/**': {
          statements: 71,
          branches: 65,
          functions: 73,
          lines: 73,
        },
        'src/hooks/**': {
          statements: 33,
          branches: 27,
          functions: 26,
          lines: 35,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
