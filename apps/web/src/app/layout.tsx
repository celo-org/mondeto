import type { Metadata, Viewport } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { WalletProvider } from "@/components/wallet-provider"
import { PostHogProvider } from "@/components/posthog-provider"
import { CurrentMapProvider } from "@/hooks/useMaps"
import { RevealsProvider } from "@/hooks/useRevealedMapIds"
import RewardAnnouncement from "@/components/RewardAnnouncement"
import Script from 'next/script'
import { LEGACY_SHIM } from "@/lib/legacyShim"
import { DEBUG_ERROR_OVERLAY } from "@/lib/debugErrorOverlay"

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Built-ins that our dependency tree calls but pre-2021 Chromium
            lacks. `beforeInteractive` is what puts this ahead of Next's own
            bootstrap scripts — a plain inline <script> here is emitted
            *after* them in the head, and we need the patches installed
            before any chunk evaluates. MiniPay renders with the device's
            system WebView, which on older Android is still Chrome 80. See
            lib/legacyShim.ts. */}
        <Script
          id="legacy-shim"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: LEGACY_SHIM }}
        />
        {/* `?debug=1` only — paints uncaught errors into an on-screen banner.
            MiniPay's WebView has no reachable console, so "see the browser
            console" is a dead end on the devices that actually fail. See
            lib/debugErrorOverlay.ts. */}
        <Script
          id="debug-error-overlay"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: DEBUG_ERROR_OVERLAY }}
        />
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
