import type { Metadata, Viewport } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { WalletProvider } from "@/components/wallet-provider"
import { PostHogProvider } from "@/components/posthog-provider"
import { CurrentMapProvider } from "@/hooks/useMaps"
import { RevealsProvider } from "@/hooks/useRevealedMapIds"
import RewardAnnouncement from "@/components/RewardAnnouncement"
import { headers } from 'next/headers'
import { logger } from "@/lib/logger"
import {
  classifyRequestKind,
  inspectUserAgent,
  shouldRetainRawUserAgent,
} from "@/lib/userAgentInsight"

const APP_URL = 'https://www.mondeto.app'
const TITLE = 'Mondeto — every pixel is up for grabs'
const DESCRIPTION = 'Own the world, one pixel at a time. Live on MiniPay, built on Celo.'
// Default share card for links to the app itself; per-share cards come from
// the /s route's generateMetadata (see app/s/page.tsx).
const DEFAULT_OG_IMAGE = `${APP_URL}/api/og?k=invite`

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'Mondeto',
  description: DESCRIPTION,
  icons: {
    icon: '/brand/logo/Mondeto_Globe_Green.svg',
    apple: '/brand/logo/logo-256.png',
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: APP_URL,
    siteName: 'Mondeto',
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  other: {
    'talentapp:project_verification': 'a80e900fa7d73b76b19ceb2f9d6a5c7c7ea7a1c44a2e83a1008417c256b302e30a7961e29790868f11ebce8ca3477d21b934f544f4b1a676e1a097df4487dded',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Force every route to render on demand. The app's root client tree
// includes `WalletProvider` -> `PrivyProvider` -> `PrivyWagmiProvider`,
// and Privy's runtime check (`useWallets was called outside the
// PrivyProvider component`) intermittently crashes static prerender in
// Vercel's CI (with the failure jumping between /faq, /privacy, /analytics
// depending on which client page Next renders first). Local builds pass
// every time. Opting the whole tree out of static generation costs us
// the prerender of three tiny static pages — fine — and prevents
// whack-a-mole on this every time we touch a wallet-aware hook.
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Engine census, deliberately server-side. A bundle that fails to parse
  // never initialises PostHog, so the browsers we most need to count are
  // precisely the ones missing from client analytics (#196). The document
  // request precedes any of our JavaScript, so this sees them. `dynamic =
  // 'force-dynamic'` above already opted every route out of static
  // rendering, so reading a header costs nothing extra.
  //
  // Unlike every other `logger.*` call in this codebase, which sit on failure
  // paths, this one is unconditional and turns an exception channel into a
  // per-request stream. That is deliberate — a `document request` line is not
  // a sign anything went wrong. It also means every request now writes to
  // Vercel's volume-limited runtime log stream, which during an incident can
  // push `error` lines out of the retention window. Accepted knowingly, and a
  // reason this census should be time-boxed rather than left running.
  //
  // The headline number is `isAndroidWebView && belowKnownFloor &&
  // !isLikelyBot` over records with a known `chromeMajor`. The desktop
  // old-Chrome bucket is essentially all bots and must not reach the figure
  // quoted in #196.
  //
  // What this deliberately cannot do is isolate MiniPay. That is only
  // detectable client-side, from `window.ethereum.isMiniPay`, and
  // `isAndroidWebView` matches every embedded WebView — Facebook, Instagram,
  // Opera's in-app browser, assorted crawlers. So the denominator here is all
  // traffic, not MiniPay traffic, and the resulting percentage must not be
  // read as a MiniPay figure.
  const requestHeaders = await headers()
  const userAgent = requestHeaders.get('user-agent')
  const engine = inspectUserAgent(userAgent)
  logger.info('document request', {
    requestKind: classifyRequestKind(
      requestHeaders.get('rsc'),
      requestHeaders.get('next-router-prefetch'),
    ),
    // Omitted entirely when the UA advertises no Chromium version. A sentinel
    // like -1 would poison aggregations and, worse, undo the parser's own
    // guarantee that unknown is not old — every Safari and crawler would fall
    // under a `chromeMajor < 85` filter.
    ...(engine.chromeMajor !== null ? { chromeMajor: engine.chromeMajor } : {}),
    isAndroidWebView: engine.isAndroidWebView,
    belowKnownFloor: engine.belowKnownFloor,
    belowSupportFloor: engine.belowSupportFloor,
    isLikelyBot: engine.isLikelyBot,
    // The raw string only rides along for the population under investigation:
    // it is what lets us re-parse a device shape the parser mishandles, and
    // for the healthy majority it is bytes and personal data we don't need.
    ...(shouldRetainRawUserAgent(engine) ? { ua: userAgent ?? 'none' } : {}),
  })

  return (
    <html lang="en">
      <head>
        {/* Pre-warm Google Fonts DNS + TLS so the @font-face requests don't
            block first paint. Combined with preload below this is the
            highest-impact PageSpeed change for our mobile target. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="preload"
          as="style"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body
        className="font-mono antialiased"
        style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}
        suppressHydrationWarning
      >
        <PostHogProvider>
          <div className="relative flex min-h-screen flex-col">
            <WalletProvider>
                <RevealsProvider>
                  <CurrentMapProvider>
                    <main className="flex-1">
                      {children}
                    </main>
                    {/* Global "you won $X — flex it" announcement; renders
                        nothing unless the connected wallet has an unseen
                        campaign reward (Edge Config via /api/rewards). */}
                    <RewardAnnouncement />
                  </CurrentMapProvider>
                </RevealsProvider>
            </WalletProvider>
          </div>
        </PostHogProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
