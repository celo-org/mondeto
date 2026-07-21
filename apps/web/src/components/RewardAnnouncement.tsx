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

const SEEN_KEY = 'mondeto-rewards-seen'

/** A stable signature of the wallet's current reward set, so the modal
 *  auto-shows once per distinct set of winnings and re-shows only when a
 *  genuinely new payout lands (a new campaign id joins the set). */
function rewardsSignature(rewards: RewardEntry[]): string {
  return rewards
    .map((r) => r.campaignId)
    .sort()
    .join(',')
}

/** Sum of all reward payouts, formatted like the source strings: a whole
 *  number stays whole ("17"), anything with cents shows two places. */
function totalEarned(rewards: RewardEntry[]): string {
  const sum = rewards.reduce((acc, r) => acc + (Number(r.amountUsd) || 0), 0)
  return Number.isInteger(sum) ? String(sum) : sum.toFixed(2)
}

/**
 * "You won $X in the campaign" — the witness-announcement half of the
 * share-to-X flywheel. When the connected wallet has campaign winnings (from
 * Edge Config via /api/rewards), this modal invites them to flex the total on
 * X with their referral link baked in, turning a payout into recruitment.
 *
 * It auto-pops ONCE per distinct set of winnings: dismissal is persisted to
 * localStorage keyed by the reward-set signature, so reopening the app doesn't
 * nag. A brand-new payout (new campaign id) re-arms it. The persistent way to
 * re-share afterwards lives on the profile page.
 */
export default function RewardAnnouncement() {
  const { address } = useAccount()
  const { rewards } = useRewards()
  const { currentMapId } = useMaps()
  const mapMeta = useCurrentMapMeta()
  const [dismissed, setDismissed] = useState(false)

  const signature = useMemo(() => rewardsSignature(rewards), [rewards])

  // Suppress the auto-pop if this exact reward set was already dismissed.
  const alreadySeen = useMemo(() => {
    if (rewards.length === 0) return true
    try {
      return localStorage.getItem(SEEN_KEY) === signature
    } catch {
      return false
    }
  }, [rewards.length, signature])

  const total = useMemo(() => totalEarned(rewards), [rewards])
  // When a single payout is on the board we can name its rank/board; a
  // multi-payout total can't, so it shows the aggregate line instead.
  const single = rewards.length === 1 ? rewards[0] : null

  const show = rewards.length > 0 && !alreadySeen && !dismissed && !!address

  useEffect(() => {
    if (show) {
      track('reward_viewed', { count: rewards.length, amountUsd: total })
    }
  }, [show, rewards.length, total])

  if (!show) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(SEEN_KEY, signature)
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
          ${total}
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
          {single && single.board && single.rank
            ? `YOU FINISHED #${single.rank} ON THE ${single.board.toUpperCase()} BOARD AND BANKED $${total}.`
            : `YOU BANKED $${total} IN THE CAMPAIGN.`}
          {' '}FLEX IT AND RECRUIT A RIVAL.
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <ShareButton
            kind="reward"
            filled
            label="FLEX MY WIN"
            params={{
              amount: total,
              campaignId: single?.campaignId,
              board: single?.board,
              rank: single?.rank,
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
