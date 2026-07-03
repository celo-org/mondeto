/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required in Next 14 to run `instrumentation.ts` on server boot.
  // Stable in Next 15+ (the flag becomes a no-op).
  experimental: {
    instrumentationHook: true,
  },
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
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
    ];
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
};

module.exports = nextConfig;
