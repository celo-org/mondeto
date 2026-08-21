import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SUPPORT_FLOOR_CHROME_MAJOR } from './src/lib/browserSupportFloor.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))

// The SWC target for dependency code and the polyfill set. Chrome only: the
// floor is a MiniPay (Android System WebView) decision, see #196. Desktop
// browsers that can parse Chrome 80's syntax level (Safari 13.1+, Firefox
// 74+) are covered by the same output.
const DOWNLEVEL_TARGETS = { chrome: String(SUPPORT_FLOOR_CHROME_MAJOR) }
const DOWNLEVEL_LOADER = path.join(here, 'scripts/downlevel-loader.cjs')
const CORE_JS_VERSION = require('core-js/package.json').version

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required in Next 14 to run `instrumentation.ts` on server boot.
  // Stable in Next 15+ (the flag becomes a no-op).
  experimental: {
    instrumentationHook: true,
  },
  webpack: (config, { isServer }) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')

    if (!isServer) {
      // Browser support floor (#225). Next down-levels our own source to the
      // browserslist target but ships `node_modules` as published, and viem,
      // @noble/hashes and @wagmi/connectors publish `||=` / `??=` (Chrome
      // 85+), which is a parse error — the whole chunk dies — on the Chrome
      // 80 WebViews MiniPay renders with. Run SWC over every dependency
      // script in the client bundle with an explicit target. A blanket pass,
      // not `transpilePackages`: that matches the named package only, and
      // the failing syntax arrives transitively. `post` so it runs after
      // Next's own loaders and sees the final module source. The server
      // bundle is untouched. `scripts/check-syntax-floor.mjs` verifies the
      // result after every build.
      config.module.rules.push({
        enforce: 'post',
        test: /\.(js|mjs|cjs)$/,
        include: /[\\/]node_modules[\\/]/,
        use: [{ loader: DOWNLEVEL_LOADER, options: { targets: DOWNLEVEL_TARGETS } }],
      })
      // The runtime half. `src/polyfills.ts` imports `core-js/stable`; SWC's
      // preset-env in entry mode replaces that with exactly the core-js
      // modules the targets lack (Promise.any, Error cause, structuredClone,
      // Array.prototype.findLast, …). No hand-maintained list.
      config.module.rules.push({
        enforce: 'post',
        test: path.join(here, 'src/polyfills.ts'),
        use: [
          {
            loader: DOWNLEVEL_LOADER,
            options: { targets: DOWNLEVEL_TARGETS, coreJsEntry: true, coreJsVersion: CORE_JS_VERSION },
          },
        ],
      })
      // The loader's own source is a build input; make the persistent cache
      // see edits to it.
      if (config.cache && typeof config.cache === 'object' && config.cache.type === 'filesystem') {
        config.cache.buildDependencies ??= {}
        config.cache.buildDependencies.config ??= []
        config.cache.buildDependencies.config.push(DOWNLEVEL_LOADER)
      }
    }
    return config
  },
  // PostHog reverse proxy — the browser hits `/ingest/*` on our own origin,
  // which we then forward to PostHog US Cloud (the company org — the key in
  // NEXT_PUBLIC_POSTHOG_KEY must be a US-project key, or events are
  // silently rejected). This bypasses adblockers / privacy extensions that
  // block `*.posthog.com` and `*.i.posthog.com` by default, which would
  // otherwise drop ~30-40% of our analytics (especially desktop /
  // power-user traffic).
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
      {
        source: '/ingest/decide',
        destination: 'https://us.i.posthog.com/decide',
      },
    ]
  },
  // PostHog's ingestion endpoints rely on trailing slashes; Next.js's
  // default redirect would break them.
  skipTrailingSlashRedirect: true,
  // Permissions-Policy explicitly allows our own origin to use the
  // Geolocation API. Many Chromium-based WebViews (including newer
  // MiniPay builds) default-deny geolocation when no policy header is
  // present, which silently leaves `navigator.geolocation.getCurrentPosition`
  // pending forever. Declaring `geolocation=(self)` is the documented
  // way to opt in. See:
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy/geolocation
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self)',
          },
        ],
      },
    ]
  },
}

export default nextConfig
