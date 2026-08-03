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
import { getMapContractById } from '@/lib/maps/contracts'
import { getMaskData } from '@/lib/maps/masks'
import { ZERO_ADDRESS } from '@/constants/map'
import { useReadClient } from '@/hooks/useReadClient'
import { useCurrentMapMeta } from '@/hooks/useCurrentMapMeta'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { formatUSDT, formatBalanceForDisplay } from '@/lib/colorUtils'
import { SUPPORT_URL } from '@/lib/deeplinks'
import { checkProfanity } from '@/lib/profanity'
import { ConnectButton } from '@/components/connect-button'
import { InviteButton } from '@/components/InviteButton'
import { ShareButton } from '@/components/ShareButton'
import { track } from '@/lib/analytics'

// Shared "standard" secondary-button style — one source of truth so Support,
// How-to-win, and the Share/Invite pair all read as the same size. Width matches
// a single Share/Invite flex child (each = 50% minus half the 8px row gap), and
// the 11px 8px padding mirrors ShareButton's compact style so heights line up
// too. Applied on top of the `pixel-btn` class (which is inline-flex).
const STANDARD_BTN_STYLE: React.CSSProperties = {
  width: 'calc(50% - 4px)',
  justifyContent: 'center',
  fontSize: 9,
  letterSpacing: 2,
  padding: '11px 8px',
  textDecoration: 'none',
}

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
  // Active map's grid dims + land mask + address — the source of truth for the
  // decode below (per-continent deployments are sized differently).
  const mapMeta = useCurrentMapMeta()
  const { name, setName, color, setColor, saveState, error: saveError, save } = useProfile(addrStr, currentMapId)
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
  // Total current market value of the wallet's owned pixels across ALL active
  // (revealed) maps — a portfolio figure, not just the map on screen. Summed
  // from each owned pixel's current on-chain price (6-dec USDT).
  // landValueReady gates a placeholder so an owner never briefly reads "0.00"
  // while the multi-map scan is in flight.
  const [landValue, setLandValue] = useState(0n)
  const [landValueReady, setLandValueReady] = useState(false)
  // Whether the P&L fetch has produced a value yet (cache or network). Until it
  // has, the SPENT/EARNED cards show a placeholder instead of a misleading
  // "0.00" — the full-history scan behind /api/pnl takes a few seconds cold.
  const [pnlReady, setPnlReady] = useState(false)

  // Fetch owned pixel count from contract
  useEffect(() => {
    if (!publicClient || !addrStr) return

    async function fetchStats() {
      try {
        // Decode the active map's full pixel state via the shared, mask-aware
        // helper (same path usePixelMap/useOwnedMaps use). Returns a PixelView[]
        // indexed by pixelId, so `id` here IS the pixel's on-chain id — which we
        // collect for the owned set (and thus land value) below.
        const pixels = await fetchAllPixelsFromContract(
          publicClient!.readContract.bind(publicClient) as Parameters<typeof fetchAllPixelsFromContract>[0],
          mapMeta.address,
          mapMeta.width,
          mapMeta.height,
          mapMeta.mask,
        )

        const me = addrStr!.toLowerCase()
        // Count pixels owned by current user and track all owners for rank.
        const ownerCounts = new Map<string, number>()
        let myCount = 0

        for (const px of pixels) {
          const owner = px.owner
          if (!owner || owner === ZERO_ADDRESS) continue
          const lc = owner.toLowerCase()
          ownerCounts.set(lc, (ownerCounts.get(lc) ?? 0) + 1)
          if (lc === me) myCount++
        }

        setPixelCount(myCount)

        // Compute rank + the gap to the rank above ("N PX FROM #K") so the
        // RANK card doubles as a nudge toward the next spot on the board.
        const sorted = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1])
        const rankIdx = sorted.findIndex(([owner]) => owner === me)
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
    // A localStorage cache renders the last-known numbers instantly, then the
    // fetch ALWAYS refreshes them in the background (true stale-while-
    // revalidate). We deliberately do NOT early-return on a "fresh" cache:
    // an earlier build cached $0/$0 while the scan was broken, and returning
    // that stale zero without revalidating would pin the profile at 0. The
    // server response is cached 60s server-side, so revalidating every view
    // is cheap. Cache key is versioned (v2) so poisoned v1 entries are ignored.
    async function fetchPnL() {
      const CACHE_KEY = `mondeto-pnl-v2:${mondetoAddress.toLowerCase()}:${addrStr!.toLowerCase()}`

      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached) as { spent: string; earned: string }
          setSpent(BigInt(parsed.spent))
          setEarned(BigInt(parsed.earned))
          // A cached value is enough to drop the placeholder; the fetch below
          // still revalidates in the background.
          setPnlReady(true)
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
      } finally {
        // Resolve the placeholder either way — a failed fetch falls back to
        // showing the last-known (or 0.00) rather than spinning forever.
        setPnlReady(true)
      }
    }

    setPnlReady(false)
    fetchPnL()
  }, [publicClient, addrStr, mapMeta, mondetoAddress, currentMapId])

  // LAND VALUE — total current market value of the wallet's pixels across ALL
  // active (revealed) maps, not just the one on screen. Scans every revealed
  // map's pixel batch (the same all-maps pattern as useOwnedMaps) and sums the
  // current price of the pixels this wallet owns. Prices come from the same
  // on-chain config / client mirror the rest of the app renders, so the total
  // is consistent with the per-pixel prices shown elsewhere. Runs separately
  // from the current-map count/rank scan above since it spans every map.
  useEffect(() => {
    if (!addrStr || revealedMaps.length === 0) {
      setLandValue(0n)
      setLandValueReady(true)
      return
    }
    if (!publicClient) return

    let cancelled = false
    setLandValueReady(false)

    async function fetchLandValue() {
      const me = addrStr!.toLowerCase()
      const read = publicClient!.readContract.bind(publicClient) as Parameters<
        typeof fetchAllPixelsFromContract
      >[0]

      // Scan maps in parallel; a single map failing must not zero the whole
      // portfolio, so each map resolves to its own subtotal (0n on failure).
      const subtotals = await Promise.all(
        revealedMaps.map(async (m) => {
          try {
            const { mask } = getMaskData(m.slug)
            const pixels = await fetchAllPixelsFromContract(read, m.address, m.width, m.height, mask)
            let sum = 0n
            for (const px of pixels) {
              if (px.owner.toLowerCase() === me) sum += px.currentPrice
            }
            return sum
          } catch (e) {
            console.warn(`Failed to value pixels on map ${m.id}:`, e)
            return 0n
          }
        }),
      )

      if (cancelled) return
      setLandValue(subtotals.reduce((a, b) => a + b, 0n))
      setLandValueReady(true)
    }

    fetchLandValue()
    return () => {
      cancelled = true
    }
  }, [publicClient, addrStr, revealedMaps])

  const saveLabel =
    saveState === 'saving' ? 'SAVING\u2026' :
    saveState === 'confirming' ? 'CONFIRMING\u2026' :
    saveState === 'saved' ? 'SAVED \u2713' :
    saveState === 'error' ? 'TRY AGAIN' :
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
          spent={addrStr && !pnlReady ? '…' : formatUSDT(spent)}
          earned={addrStr && !pnlReady ? '…' : formatUSDT(earned)}
          landValue={addrStr && !landValueReady ? '…' : formatUSDT(landValue)}
        />

        {/* "FLEX MY EARNINGS" share is intentionally hidden for now. The
            earnings number is reconstructed from a full PixelsPurchased log
            scan (/api/pnl), which is only complete against an authenticated
            Forno endpoint — bragging a wrong $ figure publicly is worse than
            not offering it. Re-enable once the indexer backs these numbers.
        {addrStr && earned > 0n && (
          <div style={{ width: '100%', maxWidth: 460, padding: '10px 16px 0' }}>
            <ShareButton
              kind="reward"
              filled
              label="FLEX MY EARNINGS"
              params={{
                amount: formatUSDT(earned),
                mapId: currentMapId,
                mapName: mondetoContract.displayName,
                ref: addrStr.toLowerCase(),
              }}
            />
          </div>
        )} */}

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

          {saveState === 'error' && saveError && (
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
              {saveError}
            </div>
          )}

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

          {/* How-to-win — the guide CTA, standalone below the Save/Share/Invite
              cluster and above the Legal-and-Help box. Standard secondary width,
              centered, with breathing room. Always rendered (reachable before
              wallet connect). */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
            <Link
              href="/faq"
              className="pixel-btn pixel-btn-filled font-display"
              style={STANDARD_BTN_STYLE}
            >
              HOW TO WIN
            </Link>
          </div>

          {/* Legal and Help — boxed section grouping the Support action with the
              legal links. The card always renders, so Support stays reachable
              before wallet connect (MiniPay requires Support / Terms / Privacy
              in-app). 2px accent border pops in dark mode where card-bg ≈ page
              bg. */}
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
              LEGAL AND HELP
            </div>
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('support_form_opened')}
              className="pixel-btn pixel-btn-filled font-display"
              style={STANDARD_BTN_STYLE}
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
