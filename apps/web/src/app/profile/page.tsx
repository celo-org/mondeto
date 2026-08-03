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
import { rankGap } from '@/lib/maps/leaderboards'
import { fetchAreaLeaderboard, fetchOwnedPixelIds, subgraphConfigured } from '@/lib/subgraph'
import { MONDETO_ABI } from '@/lib/contract'
import { ZERO_ADDRESS } from '@/constants/map'
import { useReadClient } from '@/hooks/useReadClient'
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
  const { name, setName, color, setColor, saveState, error: saveError, save } = useProfile(addrStr, currentMapId)
  const walletBalance = useStablecoinBalance()
  // Guaranteed-defined read client. Pixel-count + P&L still resolve when
  // the user is browsing without a wallet (they just won't have personal
  // stats, but the contract reads work generically).
  const publicClient = useReadClient()
  const [nameError, setNameError] = useState<string | null>(null)

  const [pixelCount, setPixelCount] = useState(0)
  // Total current market value of the wallet's held land across ALL active
  // (revealed) maps — a portfolio figure, not just the map on screen. Summed
  // from each owned pixel's current on-chain price (6-dec USDT). null until the
  // multi-map scan resolves (renders a placeholder); 0n when nothing is owned.
  const [landValue, setLandValue] = useState<bigint | null>(null)
  const [rank, setRank] = useState(0)
  const [rankGapLabel, setRankGapLabel] = useState<string | undefined>(undefined)
  const [spent, setSpent] = useState(0n)
  const [earned, setEarned] = useState(0n)
  // Whether the P&L fetch has produced a value yet (cache or network). Until it
  // has, the SPENT/EARNED cards show a placeholder instead of a misleading
  // "0.00" — the full-history scan behind /api/pnl takes a few seconds cold.
  const [pnlReady, setPnlReady] = useState(false)

  // SPENT / EARNED — lifetime earn/spend via /api/pnl (subgraph-backed when
  // configured). Independent of the owned-pixel stats effect below.
  useEffect(() => {
    if (!addrStr) return

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
  }, [addrStr, mondetoAddress, currentMapId])

  // Owned-pixel portfolio — PIXELS, LAND VALUE, and RANK, all keyed to what the
  // wallet actually holds across ALL active (revealed) maps rather than the map
  // currently on screen. A player who owns nothing on the map they're viewing
  // still sees their real totals and their rank on the map they hold.
  //
  // Owned pixel ids come from the subgraph (tiny, reliable) so we never decode a
  // whole on-chain pixel batch here — that heavy `getPixelBatch` read is exactly
  // what fails on throttled RPCs, which zeroed these stats. When the subgraph
  // isn't configured we fall back to the on-chain full-map decode. Either way:
  //   PIXELS     = total owned across active maps
  //   LAND VALUE = Σ selectionPrice(owned ids) per map (exact current buy price)
  //   RANK       = standing on the map where the wallet owns the most
  useEffect(() => {
    if (!addrStr || revealedMaps.length === 0) {
      setPixelCount(0)
      setLandValue(0n)
      setRank(0)
      setRankGapLabel(undefined)
      return
    }
    if (!publicClient) return

    let cancelled = false
    // Reset LAND VALUE to its loading placeholder while the scan runs.
    setLandValue(null)
    const read = publicClient.readContract.bind(publicClient)
    const useSubgraph = subgraphConfigured()

    async function loadPortfolio() {
      const me = addrStr!.toLowerCase()

      // Owned pixel ids (and, in the on-chain fallback, per-map owner tallies for
      // the local rank) for every revealed map. One map failing yields an empty
      // set for that map, never a thrown scan.
      const perMap = await Promise.all(
        revealedMaps.map(async (m) => {
          try {
            if (useSubgraph) {
              const ids = await fetchOwnedPixelIds(m.id, me)
              return { map: m, ids, ownerCounts: null as Map<string, number> | null }
            }
            const { mask } = getMaskData(m.slug)
            const pixels = await fetchAllPixelsFromContract(
              read as Parameters<typeof fetchAllPixelsFromContract>[0],
              m.address, m.width, m.height, mask,
            )
            const ids: number[] = []
            const ownerCounts = new Map<string, number>()
            for (let id = 0; id < pixels.length; id++) {
              const owner = pixels[id].owner
              if (!owner || owner === ZERO_ADDRESS) continue
              const lo = owner.toLowerCase()
              ownerCounts.set(lo, (ownerCounts.get(lo) ?? 0) + 1)
              if (lo === me) ids.push(id)
            }
            return { map: m, ids, ownerCounts }
          } catch (e) {
            console.warn(`owned pixels lookup failed for map ${m.id}:`, e)
            return { map: m, ids: [] as number[], ownerCounts: null as Map<string, number> | null }
          }
        }),
      )
      if (cancelled) return

      // PIXELS — total held across active maps.
      setPixelCount(perMap.reduce((n, x) => n + x.ids.length, 0))

      // LAND VALUE — exact current buy price of the held ids via selectionPrice,
      // per map. Chunked so a whale's holdings don't blow up a single eth_call.
      let value = 0n
      for (const { map, ids } of perMap) {
        if (ids.length === 0) continue
        try {
          const CHUNK = 400
          for (let i = 0; i < ids.length; i += CHUNK) {
            const price = (await read({
              address: map.address,
              abi: MONDETO_ABI,
              functionName: 'selectionPrice',
              args: [ids.slice(i, i + CHUNK).map((n) => BigInt(n))],
            })) as bigint
            value += price
          }
        } catch (e) {
          console.warn(`selectionPrice failed for map ${map.id}:`, e)
        }
      }
      if (cancelled) return
      setLandValue(value)

      // RANK — on the map where the wallet holds the most land (lowest id wins a
      // tie). "-" only when it owns nothing anywhere.
      const dominant = perMap
        .filter((x) => x.ids.length > 0)
        .sort((a, b) => b.ids.length - a.ids.length || a.map.id - b.map.id)[0]
      if (!dominant) {
        setRank(0)
        setRankGapLabel(undefined)
        return
      }
      try {
        if (useSubgraph) {
          const board = await fetchAreaLeaderboard(dominant.map.id)
          const rg = rankGap(board, addrStr!)
          if (cancelled) return
          if (rg) {
            setRank(rg.rank)
            setRankGapLabel(rg.rank === 1 ? 'RULER' : `${rg.gap ?? 0} PX FROM #${rg.rank - 1}`)
          } else {
            setRank(0)
            setRankGapLabel(undefined)
          }
        } else if (dominant.ownerCounts) {
          // On-chain fallback: rank on the dominant map from its owner tally.
          const sorted = [...dominant.ownerCounts.entries()].sort((a, b) => b[1] - a[1])
          const idx = sorted.findIndex(([o]) => o === me)
          if (cancelled) return
          setRank(idx >= 0 ? idx + 1 : 0)
          if (idx === 0) setRankGapLabel('RULER')
          else if (idx > 0) setRankGapLabel(`${sorted[idx - 1][1] - dominant.ids.length} PX FROM #${idx}`)
          else setRankGapLabel(undefined)
        }
      } catch (e) {
        console.warn('rank computation failed:', e)
      }
    }

    loadPortfolio()
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
          landValue={
            addrStr
              ? landValue === null
                ? '…'
                : formatUSDT(landValue)
              : undefined
          }
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
            {/* Rewards are on-chain, so a wallet address is the only thing
                support can look a payment up by. Saying so here is cheaper than
                a round-trip asking for it after someone sends a phone number. */}
            <div
              style={{
                fontSize: 6,
                fontFamily: "'Press Start 2P', monospace",
                color: 'var(--text-muted)',
                letterSpacing: 1,
                lineHeight: 1.6,
                textAlign: 'center',
              }}
            >
              HAVE YOUR 0x WALLET ADDRESS READY
            </div>
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
