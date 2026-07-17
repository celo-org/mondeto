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
      label="INVITE A RIVAL"
      params={{
        mapId: currentMapId,
        mapName: mapMeta.displayName,
        ref: address.toLowerCase(),
      }}
    />
  )
}
