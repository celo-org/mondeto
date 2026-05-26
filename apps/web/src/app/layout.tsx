import type { Metadata, Viewport } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { WalletProvider } from "@/components/wallet-provider"
import { PostHogProvider } from "@/components/posthog-provider"
import { DebugErrorBoundary } from "@/components/DebugErrorBoundary"

export const metadata: Metadata = {
  title: 'Mondeto',
  description: 'Own the world, one pixel at a time',
  icons: {
    icon: '/brand/logo/Mondeto_Globe_Green.svg',
    apple: '/brand/logo/logo-256.png',
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
        <DebugErrorBoundary>
          <PostHogProvider>
            <div className="relative flex min-h-screen flex-col">
              <WalletProvider>
                  <main className="flex-1">
                    {children}
                  </main>
              </WalletProvider>
            </div>
          </PostHogProvider>
        </DebugErrorBoundary>
        <SpeedInsights />
      </body>
    </html>
  );
}
