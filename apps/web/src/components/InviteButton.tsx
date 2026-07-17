'use client'

import { useAccount } from 'wagmi'
import { useMaps } from '@/hooks/useMaps'
import { useCurrentMapMeta } from '@/hooks/useCurrentMapMeta'
import { ShareButton } from '@/components/ShareButton'

/**
 * "Invite a rival" — the recruit-a-player share. Delegates to ShareButton so
 * it shares the crawlable `/s` link (with a preview card) rather than a bare
 * URL, and gains the X web-intent fallback on desktop. The landing side is
 * handled in app/page.tsx (referral_landed + map deep-link); buys made in
 * that visit carry the ref for attribution.
 */
export function InviteButton() {
  const { address } = useAccount()
  const { currentMapId } = useMaps()
  const mapMeta = useCurrentMapMeta()

  if (!address) return null

  return (
    <ShareButton
      kind="invite"
      label="INVITE"
      compact
      filled={false}
      icon={<InviteGlyph />}
      params={{
        mapId: currentMapId,
        mapName: mapMeta.displayName,
        ref: address.toLowerCase(),
      }}
    />
  )
}

/** user-plus glyph. */
function InviteGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 19a6 6 0 00-12 0" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  )
}
