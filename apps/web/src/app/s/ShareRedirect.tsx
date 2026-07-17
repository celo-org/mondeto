'use client'

import { useEffect } from 'react'
import { buildDeepLink } from '@/lib/share'

/**
 * Client half of the /s share landing. Crawlers stop at the server-rendered
 * meta; a real visitor hits this and gets bounced into the app on the sharer's
 * map with their referral code, so the existing landing handler in
 * app/page.tsx picks up ?map= + ?ref= (referral_landed + deep-link).
 *
 * We use a hard location replace (not next/router) so the app boots fresh with
 * the deep-link query — the referral effect in page.tsx runs once on the URL
 * the page opened with.
 */
export default function ShareRedirect({
  mapId,
  refWallet,
}: {
  mapId?: number
  refWallet?: string
}) {
  useEffect(() => {
    const target = buildDeepLink({ mapId, ref: refWallet })
    window.location.replace(target)
  }, [mapId, refWallet])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text-muted)',
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 9,
        letterSpacing: 2,
      }}
    >
      ENTERING MONDETO&hellip;
    </div>
  )
}
