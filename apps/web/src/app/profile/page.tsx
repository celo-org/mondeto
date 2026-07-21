'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import AvatarBlock from '@/components/Profile/AvatarBlock'
import StatsRow from '@/components/Profile/StatsRow'
import ColorPicker from '@/components/Profile/ColorPicker'
import { useProfile } from '@/hooks/useProfile'
import { useStablecoinBalance } from '@/hooks/useStablecoinBalance'
import { useMaps } from '@/hooks/useMaps'
import { useMapRulers } from '@/hooks/useMapRulers'
import { MONDETO_ABI } from '@/lib/contract'
import { getMapContractById } from '@/lib/maps/contracts'
import { ZERO_ADDRESS } from '@/constants/map'
import { useReadClient } from '@/hooks/useReadClient'
import { formatUSDT, formatBalanceForDisplay } from '@/lib/colorUtils'
import { SUPPORT_URL } from '@/lib/deeplinks'
import { checkProfanity } from '@/lib/profanity'
import { ConnectButton } from '@/components/connect-button'
import { InviteButton } from '@/components/InviteButton'
import { ShareButton } from '@/components/ShareButton'
import { useRewards } from '@/hooks/useRewards'
import { track } from '@/lib/analytics'

export default function ProfilePage() {
  const { address } = useAccount()
  const addrStr = address as string | undefined
  // URL input removed — unverified user URLs are an injection vector.
  // setUrl is left wired but unused so existing useProfile callers keep
  // their shape; updateProfile is called below with an empty string for url.
  const { revealedMaps, currentMapId } = useMaps()
  const mondetoContract = getMapContractById(currentMapId)
  const mondetoAddress = mondetoContract.address
  const { rulers } = useMapRulers()

  // Maps where the connected wallet currently owns the most land — the
  // reigning "Ruler of <map>". Sourced from the shared rulers resolver so the
  // badge can't drift from the leaderboard.
  const ruledMaps = useMemo(() => {
    if (!addrStr) return []
    const me = addrStr.toLowerCase()
    return revealedMaps.filter((m) => rulers[m.id] === me)
  }, [addrStr, revealedMaps, rulers])
  const { name, setName, color, setColor, saveState, save } = useProfile(addrStr, currentMapId)
  // Campaign winnings (Edge Config via /api/rewards). The one-time popup
  // (RewardAnnouncement) is the announcement; this is the persistent surface
  // to re-share the total earnings any time.
  const { rewards } = useRewards()
  const rewardsTotal = useMemo(() => {
    const sum = rewards.reduce((acc, r) => acc + (Number(r.amountUsd) || 0), 0)
    return Number.isInteger(sum) ? String(sum) : sum.toFixed(2)
  }, [rewards])
  const walletBalance = useStablecoinBalance()
  // Guaranteed-defined read client. Pixel-count + P&L still resolve when
  // the user is browsing without a wallet (they just won't have personal
  // stats, but the contract reads work generically).
  const publicClient = useReadClient()
  const [nameError, setNameError] = useState<string | null>(null)

  const [pixelCount, setPixelCount] = useState(0)
  const [rank, setRank] = useState(0)
  const [rankGapLabel, setRankGapLabel] = useState<string | undefined>(undefined)
  const [spent, setSpent] = useState(0n)
  const [earned, setEarned] = useState(0n)

  // Fetch owned pixel count from contract
  useEffect(() => {
    if (!publicClient || !addrStr) return

    async function fetchStats() {
      try {
        // Fetch pixel batch for the full map
        const batchData = await publicClient!.readContract({
          address: mondetoAddress,
          abi: MONDETO_ABI,
          functionName: 'getPixelBatch',
          args: [0, 0, mondetoContract.width, mondetoContract.height],
        }) as `0x${string}`

        // Decode packed bytes: 24 bytes per land pixel
        const hex = batchData.slice(2) // remove 0x
        const byteCount = hex.length / 2
        const recordCount = Math.floor(byteCount / 24)

        // Count pixels owned by current user and track all owners for rank
        const ownerCounts = new Map<string, number>()
        let myCount = 0

        for (let i = 0; i < recordCount; i++) {
          const offset = i * 48 // 24 bytes = 48 hex chars
          const ownerHex = '0x' + hex.slice(offset, offset + 40)
          if (ownerHex === '0x0000000000000000000000000000000000000000') continue

          const count = (ownerCounts.get(ownerHex.toLowerCase()) ?? 0) + 1
          ownerCounts.set(ownerHex.toLowerCase(), count)

          if (ownerHex.toLowerCase() === addrStr!.toLowerCase()) {
            myCount++
          }
        }

        setPixelCount(myCount)

        // Compute rank + the gap to the rank above ("N PX FROM #K") so the
        // RANK card doubles as a nudge toward the next spot on the board.
        const sorted = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1])
        const rankIdx = sorted.findIndex(([owner]) => owner === addrStr!.toLowerCase())
        setRank(rankIdx >= 0 ? rankIdx + 1 : 0)
        if (rankIdx === 0) {
          setRankGapLabel('RULER')
        } else if (rankIdx > 0) {
          const gap = sorted[rankIdx - 1][1] - myCount
          setRankGapLabel(`${gap} PX FROM #${rankIdx}`)
        } else {
          setRankGapLabel(undefined)
        }
      } catch (e) {
        console.warn('Failed to fetch pixel stats from contract:', e)
      }
    }

    fetchStats()

    // P&L (spent / earned) comes from a wide PixelsPurchased log scan across
    // the whole contract history. That scan is heavy and unreliable on the
    // phone — on MiniPay's constrained network it routinely failed and left
    // the profile showing $0/$0 — so it runs server-side at /api/pnl, where
    // the reads hit Vercel's network. Values come back in 6-decimal
    // "microcents" (the unit `formatUSDT` renders).
    //
    // A localStorage stale-while-revalidate cache renders the last-known
    // numbers instantly, then the fetch refreshes them in the background.
    async function fetchPnL() {
      const CACHE_KEY = `mondeto-pnl:${mondetoAddress.toLowerCase()}:${addrStr!.toLowerCase()}`
      const CACHE_TTL_MS = 10 * 60_000

      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached) as { ts: number; spent: string; earned: string }
          setSpent(BigInt(parsed.spent))
          setEarned(BigInt(parsed.earned))
          if (Date.now() - parsed.ts < CACHE_TTL_MS) return
        }
      } catch {}

      try {
        const res = await fetch(
          `/api/pnl?address=${addrStr!.toLowerCase()}&mapId=${currentMapId}`,
        )
        if (!res.ok) return
        const { spent: s, earned: e } = (await res.json()) as {
          spent: string
          earned: string
        }
        const totalSpent = BigInt(s ?? '0')
        const totalEarned = BigInt(e ?? '0')
        setSpent(totalSpent)
        setEarned(totalEarned)

        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              ts: Date.now(),
              spent: totalSpent.toString(),
              earned: totalEarned.toString(),
            }),
          )
        } catch {}
      } catch (e) {
        console.warn('Failed to fetch P&L:', e)
      }
    }

    fetchPnL()
  }, [publicClient, addrStr, mondetoAddress, currentMapId, mondetoContract.width, mondetoContract.height])

  const saveLabel =
    saveState === 'saving' ? 'SAVING\u2026' :
    saveState === 'confirming' ? 'CONFIRMING\u2026' :
    saveState === 'saved' ? 'SAVED \u2713' :
    'SAVE'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingTop: 60 }}>
      <TopBar title="MONDETO" />
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg)',
          paddingBottom: 56,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!addrStr && (
          // Overlay, not an inline card — floats over the (zeroed) profile
          // content instead of pushing it down. Covers the content region
          // between the TopBar (56px) and the bottom nav (56px) so both stay
          // usable; sits below the TopBar's zIndex 20.
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Connect to play"
            style={{
              position: 'fixed',
              top: 60,
              bottom: 56,
              left: 0,
              right: 0,
              zIndex: 19,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              background: 'rgba(0, 0, 0, 0.72)',
              backdropFilter: 'blur(2px)',
            }}
          >
            <div
              style={{
                background: 'var(--card-bg)',
                border: '2px solid var(--brand-lime)',
                padding: '16px 18px',
                maxWidth: 460,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "'Press Start 2P', monospace",
                  letterSpacing: 2,
                  color: 'var(--text)',
                }}
              >
                CONNECT TO PLAY
              </div>
              <div
                style={{
                  fontSize: 7,
                  fontFamily: "'Press Start 2P', monospace",
                  letterSpacing: 1.5,
                  lineHeight: 1.6,
                  color: 'var(--text-muted)',
                  maxWidth: 320,
                }}
              >
                link a wallet to claim pixels, set your color, and save your name on-chain
              </div>
              <ConnectButton />
            </div>
          </div>
        )}
        <AvatarBlock color={color} name={name} />
        {ruledMaps.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 6,
              margin: '0 16px 10px',
            }}
          >
            {ruledMaps.map((m) => (
              <span
                key={m.id}
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 7,
                  letterSpacing: 1.5,
                  padding: '5px 9px',
                  borderRadius: 999,
                  color: '#A7FF05',
                  border: '1px solid #A7FF05',
                  whiteSpace: 'nowrap',
                }}
              >
                RULER OF {m.displayName}
              </span>
            ))}
          </div>
        )}
        <StatsRow
          pixels={pixelCount}
          balance={formatBalanceForDisplay(walletBalance.preferred?.amount ?? walletBalance.totalAmount)}
          balanceSymbol={walletBalance.preferred?.symbol}
          rank={rank}
          rankGapLabel={rankGapLabel}
          spent={formatUSDT(spent)}
          earned={formatUSDT(earned)}
        />

        {addrStr && rewards.length > 0 && (
          <div style={{ width: '100%', maxWidth: 460, padding: '10px 16px 0' }}>
            <ShareButton
              kind="reward"
              filled
              label={`FLEX $${rewardsTotal} IN WINNINGS`}
              params={{
                amount: rewardsTotal,
                campaignId: rewards.length === 1 ? rewards[0].campaignId : undefined,
                board: rewards.length === 1 ? rewards[0].board : undefined,
                rank: rewards.length === 1 ? rewards[0].rank : undefined,
                mapId: currentMapId,
                mapName: mondetoContract.displayName,
                ref: addrStr.toLowerCase(),
              }}
            />
          </div>
        )}

        <div style={{ width: '100%', maxWidth: 460, padding: '0 16px' }}>
          {/* Name field */}
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 6, fontFamily: "'Press Start 2P', monospace", color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 6 }}>
              NAME
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (nameError) setNameError(null)
              }}
              maxLength={32}
              placeholder="enter name..."
              style={{ fontSize: 10, fontFamily: "'Press Start 2P', monospace", letterSpacing: 1, color: 'var(--text)', background: 'transparent', border: 'none', width: '100%', outline: 'none' }}
            />
          </div>

          {nameError && (
            <div
              style={{
                fontSize: 7,
                fontFamily: "'Press Start 2P', monospace",
                color: 'var(--error)',
                letterSpacing: 1,
                marginBottom: 8,
                paddingLeft: 4,
              }}
            >
              {nameError}
            </div>
          )}

          <ColorPicker color={color} onChange={setColor} />

          {/* Save button */}
          <button
            onClick={() => {
              const check = checkProfanity(name)
              if (!check.ok) {
                setNameError(check.reason ?? 'invalid name')
                return
              }
              setNameError(null)
              save()
            }}
            disabled={!addrStr || saveState === 'saving' || saveState === 'confirming'}
            className="pixel-btn pixel-btn-filled font-display"
            style={{
              display: 'block',
              margin: '16px 0 8px',
              width: '100%',
              fontSize: 10,
              letterSpacing: 2,
              padding: 12,
              opacity: (!addrStr || saveState === 'saving' || saveState === 'confirming') ? 0.5 : 1,
              cursor: (!addrStr || saveState === 'saving' || saveState === 'confirming') ? 'default' : 'pointer',
            }}
          >
            {saveLabel}
          </button>

          {/* Share actions — grouped and secondary to Save (compact icon
              buttons in a row), so they read as "spread the word", not a second
              primary action. Share needs pixels to brag about; Invite always
              shows. Each opens the share menu (X / WhatsApp / Telegram / copy). */}
          {addrStr && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {pixelCount > 0 && (
                <ShareButton
                  kind="positions"
                  label="SHARE"
                  compact
                  filled={false}
                  icon={<ShareGlyph />}
                  params={{
                    name,
                    value: String(pixelCount),
                    ruler: rank === 1,
                    mapId: currentMapId,
                    mapName: mondetoContract.displayName,
                    ref: addrStr.toLowerCase(),
                    color: (color || '').replace('#', ''),
                  }}
                />
              )}
              <InviteButton />
            </div>
          )}

          {/* Support + legal footer — boxed card so it reads as a distinct
              section. MiniPay requires Support / Terms / Privacy to be
              reachable in-app. Uses a 2px accent border so it pops in dark
              mode where card-bg is nearly identical to the page bg. */}
          <div
            style={{
              marginTop: 32,
              background: 'var(--card-bg)',
              border: '2px solid var(--text-muted)',
              borderRadius: 10,
              padding: '14px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 6,
                fontFamily: "'Press Start 2P', monospace",
                color: 'var(--text-muted)',
                letterSpacing: 2,
              }}
            >
              HELP &amp; LEGAL
            </div>
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('support_form_opened')}
              className="pixel-btn pixel-btn-filled font-display"
              style={{ fontSize: 9, letterSpacing: 2, padding: '8px 18px', textDecoration: 'none' }}
            >
              SUPPORT
            </a>
            <div
              style={{
                display: 'flex',
                gap: 18,
                paddingTop: 10,
                borderTop: '1px solid var(--text-muted)',
                width: '100%',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Link
                href="/faq"
                style={{
                  fontSize: 7,
                  fontFamily: "'Press Start 2P', monospace",
                  letterSpacing: 2,
                  color: 'var(--text-muted)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                help
              </Link>
              <Link
                href="/terms"
                style={{
                  fontSize: 7,
                  fontFamily: "'Press Start 2P', monospace",
                  letterSpacing: 2,
                  color: 'var(--text-muted)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                terms
              </Link>
              <Link
                href="/privacy"
                style={{
                  fontSize: 7,
                  fontFamily: "'Press Start 2P', monospace",
                  letterSpacing: 2,
                  color: 'var(--text-muted)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                privacy
              </Link>
            </div>
          </div>
        </div>
      </div>
      <BottomNav activeRoute="/profile" />
    </div>
  )
}

/** Share (upload/arrow-out) glyph for the compact share button. */
function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
      <path d="M12 3v13M8 7l4-4 4 4" />
    </svg>
  )
}
