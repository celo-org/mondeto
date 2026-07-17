'use client'

import { useEffect, useState } from 'react'
import { track } from '@/lib/analytics'
import {
  type ShareKind,
  type ShareParams,
  buildShareUrl,
  buildXIntentUrl,
  composeShareText,
  composeShareMessage,
} from '@/lib/share'

/**
 * Share entry point for the share-to-X flywheel.
 *
 * X is the PRIMARY, one-tap action (opens the X composer prefilled with the
 * brag + link) — the native share sheet buries X several icons deep, and this
 * feature is specifically about seeding X. A secondary "more options" button
 * keeps the native sheet (Telegram / WhatsApp / etc.) one tap away.
 *
 * Whichever path runs, the text always travels with the link:
 *  - X intent carries `text` + `url` as separate params (X renders both).
 *  - The native sheet gets text+link folded into ONE string — some targets
 *    (Telegram) drop a Web Share payload's `text` when a `url` is also set, so
 *    we never pass a separate `url` there (see composeShareMessage).
 *
 * The shared link is the crawlable `/s` URL (dynamic preview card), and its
 * `ref` keeps referral attribution flowing.
 */
export function ShareButton({
  kind,
  params,
  label,
  filled = true,
}: {
  kind: ShareKind
  params: ShareParams
  label: string
  /** Render the primary (X) button in the filled lime style. */
  filled?: boolean
}) {
  const [copied, setCopied] = useState(false)
  // Whether the native share sheet exists. Resolved after mount so SSR and the
  // first client render agree (both start false → no hydration mismatch).
  const [hasNativeShare, setHasNativeShare] = useState(false)
  useEffect(() => {
    setHasNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const shareToX = () => {
    const url = buildShareUrl(kind, params)
    const text = composeShareText(kind, params)
    track('share_clicked', { kind, platform: 'twitter', mapId: params.mapId ?? null })
    window.open(buildXIntentUrl(text, url), '_blank', 'noopener,noreferrer')
  }

  const shareOther = async () => {
    const message = composeShareMessage(kind, params) // text + link in one string
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      track('share_clicked', { kind, platform: 'native', mapId: params.mapId ?? null })
      try {
        await navigator.share({ title: 'MONDETO', text: message })
        return
      } catch {
        // Sheet dismissed / unavailable — fall through to copy.
      }
    }
    track('share_clicked', { kind, platform: 'clipboard', mapId: params.mapId ?? null })
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        onClick={shareToX}
        className={`pixel-btn font-display${filled ? ' pixel-btn-filled' : ''}`}
        style={{ display: 'block', width: '100%', fontSize: 10, letterSpacing: 2, padding: 12, cursor: 'pointer' }}
      >
        {label} ON X
      </button>
      <button
        onClick={shareOther}
        className="pixel-btn font-display"
        style={{ display: 'block', width: '100%', fontSize: 8, letterSpacing: 2, padding: 9, cursor: 'pointer', opacity: 0.85 }}
      >
        {copied ? 'LINK COPIED' : hasNativeShare ? 'MORE OPTIONS' : 'COPY LINK'}
      </button>
    </div>
  )
}
