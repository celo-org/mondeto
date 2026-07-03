'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useMaps } from '@/hooks/useMaps'
import { track } from '@/lib/analytics'

const APP_ORIGIN = 'https://www.mondeto.app'

/**
 * Builds a shareable invite link that lands the invitee on the sender's
 * current map with the sender's wallet as the referral code:
 *   https://www.mondeto.app/?map=<id>&ref=<wallet>
 * The landing side is handled in app/page.tsx (referral_landed + map
 * deep-link); buys made in that visit carry the ref for attribution.
 */
export function InviteButton() {
  const { address } = useAccount()
  const { currentMapId } = useMaps()
  const [copied, setCopied] = useState(false)

  if (!address) return null

  const link = `${APP_ORIGIN}/?map=${currentMapId}&ref=${address.toLowerCase()}`

  const share = async () => {
    track('invite_shared', { mapId: currentMapId })
    const payload = {
      title: 'MONDETO',
      text: 'Claim your spot on my map before someone else does.',
      url: link,
    }
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(payload)
        return
      } catch {
        // Share sheet dismissed or unavailable — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <button
      onClick={share}
      className="pixel-btn font-display"
      style={{
        display: 'block',
        width: '100%',
        fontSize: 10,
        letterSpacing: 2,
        padding: 12,
        cursor: 'pointer',
      }}
    >
      {copied ? 'LINK COPIED' : 'INVITE A RIVAL'}
    </button>
  )
}
