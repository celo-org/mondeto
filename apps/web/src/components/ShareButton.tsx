'use client'

import { useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import {
  type ShareKind,
  type ShareParams,
  SHARE_LINK,
  buildXIntentUrl,
  buildTelegramUrl,
  buildWhatsAppUrl,
  composeXText,
  composeTelegramText,
  composeShareMessage,
} from '@/lib/share'

/**
 * One "Share" button for the share-to-X flywheel.
 *
 * Tapping it opens our own small menu of targets — X, WhatsApp, Telegram, Copy
 * link — the same on every device. We intentionally do NOT use the Web Share
 * API: on iOS it popped the system sheet and then this menu (a double popup),
 * and it buried our chosen channels behind the OS picker. Instagram has no web
 * share URL, so it isn't offered here.
 *
 * The text always travels with the link: the X intent takes text+url; WhatsApp
 * + Copy get a single string with the link folded in (some apps drop a payload's
 * text when a url is also set).
 */
export function ShareButton({
  kind,
  params,
  label,
  filled = true,
  compact = false,
  icon,
}: {
  kind: ShareKind
  params: ShareParams
  label: string
  /** Render the button in the filled (lime) pixel style. */
  filled?: boolean
  /** Compact icon+label trigger that flexes to share a row (secondary action). */
  compact?: boolean
  /** Leading glyph for the trigger (shown in compact mode). */
  icon?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close the fallback menu on an outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const url = SHARE_LINK
  const telegramText = composeTelegramText(kind, params)
  const message = composeShareMessage(kind, params)

  // Our own menu is the single, consistent UI on every device. We deliberately
  // don't call the Web Share API: on iOS it popped the system sheet AND then
  // this menu, and it hid our chosen targets behind the OS picker. Tapping a
  // target below opens it directly (each is a user-gesture window.open).
  const onShare = () => setOpen((v) => !v)

  const openTarget = (platform: string, href: string) => {
    track('share_clicked', { kind, platform, mapId: params.mapId ?? null })
    window.open(href, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  const copyLink = async () => {
    track('share_clicked', { kind, platform: 'clipboard', mapId: params.mapId ?? null })
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
    setOpen(false)
  }

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative', width: compact ? 'auto' : '100%', flex: compact ? '1 1 0' : undefined, minWidth: 0 }}
    >
      <button
        onClick={onShare}
        aria-label={compact ? label : undefined}
        className={`pixel-btn font-display${filled ? ' pixel-btn-filled' : ''}`}
        style={
          compact
            ? { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', fontSize: 9, letterSpacing: 1.5, padding: '11px 8px', cursor: 'pointer' }
            : { display: 'block', width: '100%', fontSize: 10, letterSpacing: 2, padding: 12, cursor: 'pointer' }
        }
      >
        {icon ? <span style={{ display: 'flex', width: 14, height: 14 }}>{icon}</span> : null}
        {copied ? 'COPIED' : label}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'var(--card-bg)',
            border: '2px solid var(--brand-lime)',
            borderRadius: 8,
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <TargetRow icon={<XGlyph />} label="X" onClick={() => openTarget('twitter', buildXIntentUrl(composeXText(kind, params), url))} />
          <TargetRow icon={<WhatsAppGlyph />} label="WhatsApp" onClick={() => openTarget('whatsapp', buildWhatsAppUrl(message))} />
          <TargetRow icon={<TelegramGlyph />} label="Telegram" onClick={() => openTarget('telegram', buildTelegramUrl(telegramText, url))} />
          <TargetRow icon={<LinkGlyph />} label={copied ? 'Copied' : 'Copy link'} onClick={copyLink} />
        </div>
      )}
    </div>
  )
}

function TargetRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className="font-display"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '9px 10px',
        fontSize: 9,
        letterSpacing: 1.5,
        color: 'var(--text)',
        background: 'transparent',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(167,255,5,0.12)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ display: 'flex', width: 16, height: 16, color: 'var(--brand-lime)' }}>{icon}</span>
      {label.toUpperCase()}
    </button>
  )
}

/* Minimal inline brand glyphs (lucide has no brand logos). 16px, currentColor. */
function XGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
function TelegramGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  )
}
function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.16 8.16 0 01-1.26-4.37c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 012.41 5.82c0 4.54-3.7 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42l-.48-.01c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z" />
    </svg>
  )
}
function LinkGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.5-1.5" />
    </svg>
  )
}
