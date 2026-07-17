'use client'

import { useState } from 'react'
import { track } from '@/lib/analytics'
import {
  type ShareKind,
  type ShareParams,
  buildShareUrl,
  buildXIntentUrl,
  composeShareText,
} from '@/lib/share'

/**
 * Reusable share entry point for the share-to-X flywheel.
 *
 * Order of preference:
 *   1. Web Share API — the native sheet (best on mobile / MiniPay, and lets
 *      the player pick X, WhatsApp, Telegram, wherever their rivals are).
 *   2. X web-intent in a popup — desktop fallback, prefilled tweet.
 *   3. Clipboard copy — last resort when neither is available.
 *
 * Whatever path runs, the shared link is the crawlable `/s` URL so the
 * recipient sees a dynamic preview card, and the `ref` inside it keeps the
 * referral attribution flowing.
 */
export function ShareButton({
  kind,
  params,
  label,
  filled = false,
}: {
  kind: ShareKind
  params: ShareParams
  label: string
  /** Render with the filled (lime) pixel-button style. */
  filled?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = buildShareUrl(kind, params)
    const text = composeShareText(kind, params)

    // Web Share API — native sheet. Reported platform is 'native' because the
    // OS picker chooses the destination; X-specific counts come from the
    // intent path below.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      track('share_clicked', { kind, platform: 'native', mapId: params.mapId ?? null })
      try {
        await navigator.share({ title: 'MONDETO', text, url })
        return
      } catch {
        // Sheet dismissed or unavailable — fall through to the intent/copy path.
      }
    }

    // Desktop: open the X composer prefilled. Popup dimensions match X's own
    // share widget so it renders as the compact composer, not a full tab.
    track('share_clicked', { kind, platform: 'twitter', mapId: params.mapId ?? null })
    const intent = buildXIntentUrl(text, url)
    const popup =
      typeof window !== 'undefined'
        ? window.open(intent, '_blank', 'width=550,height=420,noopener,noreferrer')
        : null
    if (popup) return

    // Popup blocked or no window — copy the link so the player can paste it.
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <button
      onClick={share}
      className={`pixel-btn font-display${filled ? ' pixel-btn-filled' : ''}`}
      style={{
        display: 'block',
        width: '100%',
        fontSize: 10,
        letterSpacing: 2,
        padding: 12,
        cursor: 'pointer',
      }}
    >
      {copied ? 'LINK COPIED' : label}
    </button>
  )
}
