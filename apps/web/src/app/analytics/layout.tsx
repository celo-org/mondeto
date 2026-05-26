// `/analytics` calls wagmi hooks (via `useShouldOpenNextMap` and the
// `TopBar`-mounted `ConnectButton`) that route through Privy's WagmiProvider
// at render time. Next.js's static prerender can't run those, so we opt the
// whole route out of static generation.
//
// The `dynamic` export only takes effect in server components, which is why
// it lives in this layout — the page itself is a `'use client'` component
// and the equivalent export there is silently ignored.
export const dynamic = 'force-dynamic'

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
