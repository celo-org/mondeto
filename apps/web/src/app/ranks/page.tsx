'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAccount } from 'wagmi'
import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import LeaderboardTabs from '@/components/Leaderboard/LeaderboardTabs'
import LeaderboardRow from '@/components/Leaderboard/LeaderboardRow'
import BoardSelector from '@/components/Leaderboard/BoardSelector'
import {
  useLeaderboard,
  type LeaderboardTab,
  type OwnerProfileData,
  type YouStanding,
} from '@/hooks/useLeaderboard'
import { useMaps } from '@/hooks/useMaps'
import { useOwnedMaps } from '@/hooks/useOwnedMaps'
import type { MapId } from '@/lib/maps/types'
import { track } from '@/lib/analytics'
import { ShareButton } from '@/components/ShareButton'
import type { PixelView } from '@/lib/mock'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { MONDETO_ABI } from '@/lib/contract'
import { getMapContractById } from '@/lib/maps/contracts'
import { getMaskData } from '@/lib/maps/masks'
import { ZERO_ADDRESS } from '@/constants/map'
import { useReadClient } from '@/hooks/useReadClient'
import { uint24ToHex } from '@/lib/colorUtils'
import { decodeBytes } from '@/lib/decodeBytes'

const PIXEL_FONT = "'Press Start 2P', monospace"
const BRAND_LIME = '#A7FF05'

// Owner profiles (custom label/color) are cosmetic decoration, so cache the
// resolved set per map for 30s — matching the global board's snapshot TTL — so
// flipping tabs or maps doesn't re-hit the chain. Best-effort: any read/write
// failure just falls through to a fresh multicall.
const PROFILES_CACHE_TTL_MS = 30_000
const profilesCacheKey = (addr: string) => `mondeto:profiles:v1:${addr.toLowerCase()}`

function readProfilesCache(addr: string): Map<string, OwnerProfileData> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(profilesCacheKey(addr))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ts: number; profiles: Record<string, OwnerProfileData> }
    if (Date.now() - parsed.ts > PROFILES_CACHE_TTL_MS) return null
    return new Map(Object.entries(parsed.profiles))
  } catch {
    return null
  }
}

function writeProfilesCache(addr: string, profiles: Map<string, OwnerProfileData>) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      profilesCacheKey(addr),
      JSON.stringify({ ts: Date.now(), profiles: Object.fromEntries(profiles) }),
    )
  } catch {
    // sessionStorage full/unavailable — cache is best-effort.
  }
}

/**
 * Rank-proximity copy for the player's own row. The delta is phrased per
 * board: AREA/EMPIRE in pixels, TYCOONS as a price gap. Rank 1 gets the
 * defend-it line instead of a target.
 */
function gapCopy(tab: LeaderboardTab, you: YouStanding): string {
  if (you.entry.rank === 1) {
    return tab === 'TYCOONS' ? 'TOP SPOT — DEFEND IT' : 'RULER — DEFEND IT'
  }
  const target = `#${you.entry.rank - 1}`
  if (you.gapValue === null) return ''
  if (tab === 'TYCOONS') return `$${you.gapValue} FROM ${target}`
  return `${you.gapValue} PX FROM ${target}`
}

export default function RanksPage() {
  // Guaranteed-defined read client. Leaderboard is a read-only view and
  // must populate for anonymous users.
  const publicClient = useReadClient()
  const { address } = useAccount()
  const { revealedMaps, currentMapId } = useMaps()
  // Per-map boards only. A global/cross-map board is intentionally not offered
  // here — if we want one later we'll add it back as its own option.
  //
  // The board shown follows the map the player is viewing (`currentMapId`)
  // until they tap a different map's chip, which parks an explicit override.
  const [override, setOverride] = useState<MapId | null>(null)
  const selectedMapId: MapId = override ?? currentMapId
  const mondetoContract = getMapContractById(selectedMapId)
  const mondetoAddress = mondetoContract.address
  const [pixelData, setPixelData] = useState<PixelView[]>([])
  const [profilesMap, setProfilesMap] = useState<Map<string, OwnerProfileData>>(new Map())
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('AREA')
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    track('leaderboard_viewed', { board: activeTab, scope: 'local', mapId: selectedMapId })
  }, [activeTab, selectedMapId])

  // The switcher only lists maps the player actually owns pixels on — no point
  // offering a board they're not in. The map currently being viewed is always
  // included so its chip stays selectable even before the ownership scan
  // resolves (or if they own nothing there yet). One map → no switcher.
  const { counts } = useOwnedMaps()
  const boardMaps = useMemo(() => {
    const owned = revealedMaps.filter(
      (m) => (counts[m.id] ?? 0) > 0 || m.id === selectedMapId,
    )
    return owned.sort((a, b) => a.id - b.id)
  }, [revealedMaps, counts, selectedMapId])
  const showSelector = boardMaps.length > 1
  const selectorOptions = boardMaps.map((m) => ({ key: String(m.id), label: m.displayName }))

  // Load the map's pixel grid and paint the board as soon as it resolves.
  // Ranking is pure pixel math and rows fall back to generated usernames, so
  // the board is fully usable before any profile loads — profiles (below) only
  // swap in custom labels/colors. Keeping them off this path is what makes the
  // board appear in ~1–2s instead of waiting on the owner fan-out.
  useEffect(() => {
    let cancelled = false
    async function loadPixels() {
      setLoading(true)
      // Drop the previous map's names so they don't briefly decorate this one.
      setProfilesMap(new Map())
      let data: PixelView[] = []
      try {
        if (publicClient) {
          const { mask } = getMaskData(mondetoContract.slug)
          data = await fetchAllPixelsFromContract(
            publicClient.readContract.bind(publicClient) as Parameters<typeof fetchAllPixelsFromContract>[0],
            mondetoAddress,
            mondetoContract.width,
            mondetoContract.height,
            mask,
          )
        }
      } catch (e) {
        console.warn('Failed to fetch from contract:', e)
      }
      if (cancelled) return
      setPixelData(data)
      setLoading(false)
    }
    loadPixels()
    return () => {
      cancelled = true
    }
  }, [publicClient, mondetoAddress, mondetoContract.slug, mondetoContract.width, mondetoContract.height])

  // Resolve owner profiles OFF the critical path. A single viem multicall
  // aggregates every owner into Multicall3 `aggregate3` calls (one round-trip of
  // latency) instead of the previous ~27 serialized `profiles()` batches that
  // stalled the board on MiniPay's fallback RPCs. When they land, `decorate()`
  // re-runs and upgrades rows in place. Cached per map for 30s.
  useEffect(() => {
    const client = publicClient
    if (!client || pixelData.length === 0) return
    let cancelled = false

    const uniqueOwners = new Set<string>()
    for (const px of pixelData) {
      if (px.owner !== ZERO_ADDRESS && px.owner !== '0x0000000000000000000000000000000000000000') {
        uniqueOwners.add(px.owner.toLowerCase())
      }
    }
    if (uniqueOwners.size === 0) return
    const ownerArray = [...uniqueOwners]

    const cached = readProfilesCache(mondetoAddress)
    if (cached) {
      setProfilesMap(cached)
      return
    }

    async function resolveProfiles() {
      const profiles = new Map<string, OwnerProfileData>()
      try {
        const results = await client.multicall({
          allowFailure: true,
          contracts: ownerArray.map((addr) => ({
            address: mondetoAddress,
            abi: MONDETO_ABI,
            functionName: 'profiles',
            args: [addr as `0x${string}`],
          })),
        })
        for (let i = 0; i < results.length; i++) {
          const r = results[i]
          if (r.status === 'success' && r.result) {
            const [color, labelBytes, urlBytes] = r.result as [number, unknown, unknown]
            profiles.set(ownerArray[i], {
              label: decodeBytes(labelBytes),
              url: decodeBytes(urlBytes),
              color: color ? uint24ToHex(color) : '',
            })
          }
        }
      } catch (e) {
        console.warn('Failed to resolve owner profiles:', e)
        return
      }
      if (cancelled) return
      setProfilesMap(profiles)
      writeProfilesCache(mondetoAddress, profiles)
    }
    resolveProfiles()
    return () => {
      cancelled = true
    }
  }, [publicClient, pixelData, mondetoAddress])

  // The selected map's board, built from the pixelData loaded above.
  // `homeMapId` is the id that pixelData belongs to so the snapshot uses the
  // right dims.
  const { area, empire, tycoons, loading: boardsLoading, you } = useLeaderboard(
    pixelData,
    profilesMap,
    {
      scope: 'local',
      homeMapId: selectedMapId,
      viewer: address,
    },
  )

  const dataMap: Record<LeaderboardTab, typeof area> = {
    AREA: area,
    EMPIRE: empire,
    TYCOONS: tycoons,
  }
  const youMap: Record<LeaderboardTab, YouStanding | null> = {
    AREA: you.area,
    EMPIRE: you.empire,
    TYCOONS: you.tycoons,
  }

  const currentData = dataMap[activeTab]
  const displayData = showAll ? currentData : currentData.slice(0, 20)
  const hasOwned = currentData.length > 0
  // The connected player's standing on the active board. If their row is
  // already in the visible slice it gets highlighted inline; otherwise a
  // copy of it is pinned at the bottom of the list viewport.
  const addrLower = address?.toLowerCase()
  const youStanding = addrLower ? youMap[activeTab] : null
  // The player's BEST standing across all three boards (lowest rank number),
  // tagged with its board — so the share always brags the strongest position and
  // names which board it's on, no matter which tab is being viewed.
  const bestBoard = useMemo(() => {
    const opts = [
      { board: 'LAND', s: you.area },
      { board: 'EMPIRE', s: you.empire },
      { board: 'TYCOONS', s: you.tycoons },
    ].filter((o): o is { board: string; s: YouStanding } => !!o.s)
    if (opts.length === 0) return null
    return opts.reduce((best, o) => (o.s.entry.rank < best.s.entry.rank ? o : best))
  }, [you.area, you.empire, you.tycoons])
  const youText = youStanding ? gapCopy(activeTab, youStanding) : undefined
  const youInView =
    !!youStanding &&
    displayData.some((e) => e.owner.toLowerCase() === addrLower)
  const isLoading = loading || boardsLoading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingTop: 60 }}>
      <TopBar title="MONDETO" />
      {showSelector && (
        <BoardSelector
          options={selectorOptions}
          value={String(selectedMapId)}
          onChange={(key) => {
            setOverride(Number(key) as MapId)
            setShowAll(false)
          }}
        />
      )}
      <LeaderboardTabs activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setShowAll(false) }} />
      {/* Flex the player's BEST standing across the three boards (with its board
          name). Shown whenever they're ranked on any board — the shared card +
          link recruit challengers. */}
      {bestBoard && (
        <div style={{ maxWidth: 500, width: '100%', margin: '0 auto', padding: '8px 16px 0' }}>
          <ShareButton
            kind="rank"
            label="SHARE MY RANK"
            params={{
              name: bestBoard.s.entry.label,
              rank: bestBoard.s.entry.rank,
              value: bestBoard.s.entry.value,
              unit: bestBoard.s.entry.unit,
              board: bestBoard.board,
              mapId: selectedMapId,
              mapName: mondetoContract.displayName,
              ref: address?.toLowerCase(),
              color: bestBoard.s.entry.color?.replace('#', ''),
            }}
          />
        </div>
      )}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg)',
          padding: '8px 0',
          paddingBottom: 56,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
        }}
      >
        {isLoading || !hasOwned ? (
          // Loading and empty states share one centered layout so the
          // GIF lands at the exact same spot in both — the caption slot
          // below is always reserved (rendered empty while loading) so
          // the GIF doesn't jump up when the "no claims yet" text appears.
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <img
              src="/brand/mondeto-symbol.gif"
              alt=""
              width={72}
              height={72}
              style={{ display: 'block', imageRendering: 'pixelated' }}
            />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                minHeight: 32,
              }}
            >
              {!isLoading && (
                <>
                  <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>no claims yet</span>
                  <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>be the first to own the world</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {displayData.map((entry) => {
              const isYou = !!addrLower && entry.owner.toLowerCase() === addrLower
              return (
                <LeaderboardRow
                  key={entry.owner}
                  entry={entry}
                  // The reigning "Ruler of <map>" is rank-1 of a map's LAND board.
                  isRuler={activeTab === 'AREA' && entry.rank === 1}
                  isYou={isYou}
                  gapText={isYou ? youText : undefined}
                />
              )
            })}
            {!showAll && currentData.length > 20 && (
              <button
                onClick={() => setShowAll(true)}
                style={{
                  display: 'block',
                  margin: '12px auto',
                  fontSize: 8,
                  fontFamily: PIXEL_FONT,
                  color: '#A7FF05',
                  background: 'none',
                  border: '1px solid #A7FF05',
                  borderRadius: 0,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                }}
              >
                SHOW MORE
              </button>
            )}
            {/* analytics: rank_gap_viewed lands with the analytics baseline */}
            {youStanding && !youInView && (
              // Player is ranked but below the visible slice — pin their row
              // to the bottom of the list viewport (56 = fixed BottomNav).
              <div
                style={{
                  position: 'sticky',
                  bottom: 56,
                  zIndex: 5,
                  background: 'var(--bg)',
                }}
              >
                <LeaderboardRow entry={youStanding.entry} isYou gapText={youText} />
              </div>
            )}
            {addrLower && !youStanding && (
              // Connected but owning nothing on this board — slim nudge row.
              <div
                style={{
                  position: 'sticky',
                  bottom: 56,
                  zIndex: 5,
                  background: 'var(--bg)',
                }}
              >
                <div
                  style={{
                    maxWidth: 500,
                    margin: '0 auto',
                    padding: '10px 16px',
                    border: `1px solid ${BRAND_LIME}`,
                    background: 'rgba(167,255,5,0.08)',
                    fontSize: 7,
                    fontFamily: PIXEL_FONT,
                    letterSpacing: 1.5,
                    lineHeight: 1.6,
                    color: BRAND_LIME,
                    textAlign: 'center',
                  }}
                >
                  {"YOU'RE UNRANKED — CLAIM A PIXEL"}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav activeRoute="/ranks" />
    </div>
  )
}
