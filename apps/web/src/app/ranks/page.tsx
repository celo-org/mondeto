'use client'

import { useState, useEffect } from 'react'
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

/**
 * Rank-proximity copy for the player's own row. The delta is phrased per
 * board: AREA/EMPIRE in pixels (global AREA is a territory share, so its
 * gap is already a percentage), TYCOONS as a price gap. Rank 1 gets the
 * defend-it line instead of a target.
 */
function gapCopy(tab: LeaderboardTab, isGlobal: boolean, you: YouStanding): string {
  if (you.entry.rank === 1) {
    return isGlobal || tab === 'TYCOONS' ? 'TOP SPOT — DEFEND IT' : 'RULER — DEFEND IT'
  }
  const target = `#${you.entry.rank - 1}`
  if (you.gapValue === null) return ''
  if (tab === 'TYCOONS') return `$${you.gapValue} FROM ${target}`
  if (tab === 'AREA' && isGlobal) return `${you.gapValue} FROM ${target}`
  return `${you.gapValue} PX FROM ${target}`
}

export default function RanksPage() {
  // Guaranteed-defined read client. Leaderboard is a read-only view and
  // must populate for anonymous users.
  const publicClient = useReadClient()
  const { address } = useAccount()
  const { revealedMaps, currentMapId } = useMaps()
  // Which board to show: 'global' (the cross-map board) or a specific map id.
  // Defaults to GLOBAL — the headline "who's winning overall" view — and the
  // player can drill into any single map's board without leaving /ranks.
  const [boardSel, setBoardSel] = useState<MapId | 'global'>('global')
  const isGlobal = boardSel === 'global'
  // The map whose pixel data + profiles we load. For the global board we still
  // load the current map (its owners' profiles decorate rows; the global hook
  // fetches all maps' pixel snapshots itself).
  const selectedMapId: MapId = isGlobal ? currentMapId : boardSel
  const mondetoContract = getMapContractById(selectedMapId)
  const mondetoAddress = mondetoContract.address
  const [pixelData, setPixelData] = useState<PixelView[]>([])
  const [profilesMap, setProfilesMap] = useState<Map<string, OwnerProfileData>>(new Map())
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('AREA')
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    track('leaderboard_viewed', {
      board: activeTab,
      scope: isGlobal ? 'global' : 'local',
      mapId: isGlobal ? null : (boardSel as MapId),
    })
  }, [activeTab, boardSel, isGlobal])

  // Offer the board selector once there's more than one map to compare.
  // GLOBAL leads (the default), then each individual map.
  const showSelector = revealedMaps.length > 1
  const selectorOptions = [
    { key: 'global', label: 'GLOBAL' },
    ...revealedMaps.map((m) => ({ key: String(m.id), label: m.displayName })),
  ]

  useEffect(() => {
    // The GLOBAL board comes from /api/global-board (server-side), so it does
    // NOT need this on-device single-map read. Skipping it for global is also
    // important: that read can hang on MiniPay's RPC, and the board display
    // must not be gated behind it.
    if (isGlobal) {
      setLoading(false)
      return
    }
    async function load() {
      setLoading(true)
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
      // Fetch profiles for unique owners before setting data
      if (publicClient) {
        const uniqueOwners = new Set<string>()
        for (const px of data) {
          if (px.owner !== ZERO_ADDRESS && px.owner !== '0x0000000000000000000000000000000000000000') {
            uniqueOwners.add(px.owner.toLowerCase())
          }
        }

        const profiles = new Map<string, OwnerProfileData>()
        const ownerArray = [...uniqueOwners]

        // Fetch profiles in parallel (batches of 10)
        for (let i = 0; i < ownerArray.length; i += 10) {
          const batch = ownerArray.slice(i, i + 10)
          const results = await Promise.allSettled(
            batch.map(addr =>
              publicClient.readContract({
                address: mondetoAddress,
                abi: MONDETO_ABI,
                functionName: 'profiles',
                args: [addr as `0x${string}`],
              })
            )
          )
          for (let j = 0; j < results.length; j++) {
            const result = results[j]
            if (result.status === 'fulfilled' && result.value) {
              const [color, labelBytes, urlBytes] = result.value as [number, unknown, unknown]
              const label = decodeBytes(labelBytes)
              const url = decodeBytes(urlBytes)
              profiles.set(batch[j], {
                label,
                url,
                color: color ? uint24ToHex(color) : '',
              })
            }
          }
        }
        setProfilesMap(profiles)
      }
      // Set pixel data after profiles are ready so leaderboard renders with names
      setPixelData(data)
      setLoading(false)
    }
    load()
  }, [isGlobal, publicClient, mondetoAddress, mondetoContract.slug, mondetoContract.width, mondetoContract.height])

  // A specific map shows that map's board (from the pixelData loaded above);
  // GLOBAL shows the normalized cross-map board. `homeMapId` is the id the
  // loaded pixelData belongs to so the local snapshot uses the right dims.
  const { area, empire, tycoons, loading: boardsLoading, you } = useLeaderboard(
    pixelData,
    profilesMap,
    {
      scope: isGlobal ? 'global' : 'local',
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
  const youText = youStanding ? gapCopy(activeTab, isGlobal, youStanding) : undefined
  const youInView =
    !!youStanding &&
    displayData.some((e) => e.owner.toLowerCase() === addrLower)
  // The global board never waits on the local single-map read (it comes from
  // the server endpoint), so don't let a slow/hanging local read block it.
  const isLoading = (isGlobal ? false : loading) || boardsLoading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingTop: 60 }}>
      <TopBar title="MONDETO" />
      {showSelector && (
        <BoardSelector
          options={selectorOptions}
          value={isGlobal ? 'global' : String(boardSel)}
          onChange={(key) => {
            setBoardSel(key === 'global' ? 'global' : (Number(key) as MapId))
            setShowAll(false)
          }}
        />
      )}
      <LeaderboardTabs activeTab={activeTab} scope={isGlobal ? 'global' : 'local'} onTabChange={(tab) => { setActiveTab(tab); setShowAll(false) }} />
      {/* Flex the player's standing on the active board. Only shown when they
          hold a rank on it — the shared card + link recruit challengers. */}
      {youStanding && (
        <div style={{ maxWidth: 500, width: '100%', margin: '0 auto', padding: '8px 16px 0' }}>
          <ShareButton
            kind="rank"
            label="SHARE MY RANK"
            params={{
              name: youStanding.entry.label,
              rank: youStanding.entry.rank,
              value: youStanding.entry.value,
              unit: youStanding.entry.unit,
              board: activeTab === 'AREA' ? 'LAND' : activeTab,
              mapId: isGlobal ? currentMapId : selectedMapId,
              mapName: isGlobal ? undefined : mondetoContract.displayName,
              ref: address?.toLowerCase(),
              color: youStanding.entry.color?.replace('#', ''),
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
              {isLoading && isGlobal && (
                <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>loading global board…</span>
              )}
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
                  // The reigning "Ruler of <map>" is rank-1 of a single map's
                  // LAND board. The global board is cross-map, so no per-map
                  // crown there.
                  isRuler={!isGlobal && activeTab === 'AREA' && entry.rank === 1}
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
                  {"YOU'RE UNRANKED — CLAIM YOUR FIRST PIXEL"}
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
