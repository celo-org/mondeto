import type { Metadata, Viewport } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { WalletProvider } from "@/components/wallet-provider"
import { ThemeProvider } from "@/lib/theme"
import { PostHogProvider } from "@/components/posthog-provider"

export const metadata: Metadata = {
  title: 'Mondeto',
  description: 'Own the world, one pixel at a time',
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
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Press+Start+2P&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Press+Start+2P&display=swap"
        />
      </head>
      <body
        className="font-mono antialiased"
        style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}
      >
        <PostHogProvider>
          <div className="relative flex min-h-screen flex-col">
            <WalletProvider>
              <ThemeProvider>
                <main className="flex-1">
                  {children}
                </main>
              </ThemeProvider>
            </WalletProvider>
          </div>
        </PostHogProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
