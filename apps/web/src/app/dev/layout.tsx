import { notFound } from 'next/navigation'

// Gate every page under /dev/* so they never appear on the production
// deployment. Vercel sets VERCEL_ENV to 'production' for the prod URL only;
// preview / staging deployments and local dev report something else (or
// undefined), so those environments keep full access.
//
// `dynamic = 'force-dynamic'` opts the whole subtree out of static
// prerender. The dev pages use client-only wagmi hooks (useReadContract,
// useAccount, etc.) that can't run during the build's SSR pass — letting
// Next prerender them produces "useConfig must be used within
// WagmiProvider" at build time because the provider hasn't initialized.
export const dynamic = 'force-dynamic'

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.VERCEL_ENV === 'production') {
    notFound()
  }
  return <>{children}</>
}
