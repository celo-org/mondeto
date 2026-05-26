import { notFound } from 'next/navigation'

// Gate every page under /dev/* so they never appear on the production
// deployment. Vercel sets VERCEL_ENV to 'production' for the prod URL only;
// preview / staging deployments and local dev report something else (or
// undefined), so those environments keep full access.
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.VERCEL_ENV === 'production') {
    notFound()
  }
  return <>{children}</>
}
