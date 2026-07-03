'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  isCampaignActive,
  timeRemainingLabel,
  type CampaignConfig,
} from '@/lib/campaign'

/**
 * Marquee banner for the active campaign. Content comes from /api/campaign
 * (Edge Config) at runtime — never hardcoded, so prize amounts and timing
 * don't leak through the repo and campaigns start/stop without a deploy.
 *
 * Dismissal is per campaign id and per session: dismissing "launch-week-1"
 * keeps it hidden for this visit, but a NEW campaign id shows again.
 */
export default function CampaignBanner() {
  const router = useRouter()
  const [campaign, setCampaign] = useState<CampaignConfig | null>(null)
  const [dismissed, setDismissed] = useState(false)
  // Re-render every 60s so the countdown label stays fresh while visible.
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false
    fetch('/api/campaign')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { campaign: CampaignConfig | null } | null) => {
        if (cancelled || !data?.campaign) return
        setCampaign(data.campaign)
        try {
          setDismissed(
            sessionStorage.getItem(`mondeto-campaign-dismissed-${data.campaign.id}`) === '1',
          )
        } catch {}
      })
      .catch(() => {
        // No banner on failure — the map is the product, the banner is extra.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!campaign?.endsAt) return
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [campaign?.endsAt])

  if (!campaign || dismissed) return null
  if (!isCampaignActive(campaign, now)) return null

  const remaining = timeRemainingLabel(campaign, now)
  const line = remaining ? `${campaign.text} — ENDS IN ${remaining}` : campaign.text

  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDismissed(true)
    try {
      sessionStorage.setItem(`mondeto-campaign-dismissed-${campaign.id}`, '1')
    } catch {}
  }

  return (
    <div
      onClick={campaign.ctaRoute ? () => router.push(campaign.ctaRoute!) : undefined}
      style={{
        position: 'absolute',
        bottom: 56,
        left: 0,
        right: 0,
        zIndex: 14,
        height: 20,
        background: '#A7FF05',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        cursor: campaign.ctaRoute ? 'pointer' : 'default',
      }}
    >
      <div
        style={{
          display: 'flex',
          whiteSpace: 'nowrap',
          animation: 'marquee 18s linear infinite',
          fontSize: 7,
          fontFamily: "'Press Start 2P', monospace",
          letterSpacing: 1,
          color: '#000000',
        }}
      >
        <span style={{ paddingRight: 80 }}>{line}</span>
        <span style={{ paddingRight: 80 }}>{line}</span>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss campaign banner"
        style={{
          position: 'absolute',
          right: 4,
          background: '#A7FF05',
          border: 'none',
          color: '#000000',
          fontSize: 8,
          cursor: 'pointer',
          padding: '0 4px',
          fontFamily: "'Press Start 2P', monospace",
        }}
      >
        x
      </button>
    </div>
  )
}
