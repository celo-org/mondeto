'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { useRewards } from '@/hooks/useRewards'
import { useMaps } from '@/hooks/useMaps'
import { useCurrentMapMeta } from '@/hooks/useCurrentMapMeta'
import { track } from '@/lib/analytics'
import { ShareButton } from '@/components/ShareButton'
import type { RewardEntry } from '@/lib/rewards'

const PIXEL_FONT = "'Press Start 2P', monospace"
const BRAND_LIME = '#A7FF05'

/**
 * "You won $X in the campaign" — the witness-announcement half of the
 * share-to-X flywheel. When the connected wallet has an unseen reward (from
 * Edge Config via /api/rewards), this modal invites them to flex the win on X
 * with their referral link baked in, turning a payout into recruitment.
 *
 * Dismissal is per campaign id and per session (mirrors CampaignBanner): a new
 * campaign's payout shows again, but the same win won't nag on every reload.
 */
export default function RewardAnnouncement() {
  const { address } = useAccount()
  const { rewards } = useRewards()
  const { currentMapId } = useMaps()
  const mapMeta = useCurrentMapMeta()
  const [dismissed, setDismissed] = useState(false)

  // Show the highest-value reward the player hasn't dismissed this session.
  const reward = useMemo<RewardEntry | null>(() => {
    const unseen = rewards.filter((r) => {
      try {
        return sessionStorage.getItem(`mondeto-reward-seen-${r.campaignId}`) !== '1'
      } catch {
        return true
      }
    })
    if (unseen.length === 0) return null
    return unseen.reduce((best, r) =>
      Number(r.amountUsd) > Number(best.amountUsd) ? r : best,
    )
  }, [rewards])

  useEffect(() => {
    if (reward && !dismissed) {
      track('reward_viewed', { campaignId: reward.campaignId, amountUsd: reward.amountUsd })
    }
  }, [reward, dismissed])

  if (!reward || dismissed || !address) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(`mondeto-reward-seen-${reward.campaignId}`, '1')
    } catch {}
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Campaign reward"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          background: 'var(--card-bg)',
          border: `2px solid ${BRAND_LIME}`,
          borderRadius: 10,
          padding: '20px 18px',
          maxWidth: 420,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 8, fontFamily: PIXEL_FONT, letterSpacing: 2, color: 'var(--text-muted)' }}>
          CAMPAIGN PAYOUT
        </div>
        <div style={{ fontSize: 32, fontFamily: PIXEL_FONT, letterSpacing: 2, color: BRAND_LIME, lineHeight: 1 }}>
          ${reward.amountUsd}
        </div>
        <div
          style={{
            fontSize: 8,
            fontFamily: PIXEL_FONT,
            letterSpacing: 1.5,
            lineHeight: 1.7,
            color: 'var(--text)',
            maxWidth: 320,
          }}
        >
          {reward.board && reward.rank
            ? `YOU FINISHED #${reward.rank} ON THE ${reward.board.toUpperCase()} BOARD AND BANKED $${reward.amountUsd}.`
            : `YOU BANKED $${reward.amountUsd} IN THE CAMPAIGN.`}
          {' '}FLEX IT AND RECRUIT A RIVAL.
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <ShareButton
            kind="reward"
            filled
            label="FLEX MY WIN"
            params={{
              amount: reward.amountUsd,
              campaignId: reward.campaignId,
              board: reward.board,
              rank: reward.rank,
              mapId: currentMapId,
              mapName: mapMeta.displayName,
              ref: address.toLowerCase(),
            }}
          />
          <button
            onClick={dismiss}
            className="pixel-btn font-display"
            style={{
              display: 'block',
              width: '100%',
              fontSize: 9,
              letterSpacing: 2,
              padding: 10,
              cursor: 'pointer',
            }}
          >
            LATER
          </button>
        </div>
      </div>
    </div>
  )
}
