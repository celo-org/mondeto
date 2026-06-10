'use client'

import { useState, useEffect } from 'react'
import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import LeaderboardTabs from '@/components/Leaderboard/LeaderboardTabs'
import LeaderboardRow from '@/components/Leaderboard/LeaderboardRow'
import BoardSelector from '@/components/Leaderboard/BoardSelector'
import {
  useLeaderboard,
  type LeaderboardTab,
  type OwnerProfileData,
} from '@/hooks/useLeaderboard'
import { useMaps } from '@/hooks/useMaps'
import type { MapId } from '@/lib/maps/types'
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

export default function RanksPage() {
  // Guaranteed-defined read client. Leaderboard is a read-only view and
  // must populate for anonymous users.
  const publicClient = useReadClient()
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

  // Offer the board selector once there's more than one map to compare.
  // GLOBAL leads (the default), then each individual map.
  const showSelector = revealedMaps.length > 1
  const selectorOptions = [
    { key: 'global', label: 'GLOBAL' },
    ...revealedMaps.map((m) => ({ key: String(m.id), label: m.displayName })),
  ]

  useEffect(() => {
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
  }, [publicClient, mondetoAddress, mondetoContract.slug, mondetoContract.width, mondetoContract.height])

  // A specific map shows that map's board (from the pixelData loaded above);
  // GLOBAL shows the normalized cross-map board. `homeMapId` is the id the
  // loaded pixelData belongs to so the local snapshot uses the right dims.
  const { area, empire, tycoons, loading: boardsLoading } = useLeaderboard(
    pixelData,
    profilesMap,
    { scope: isGlobal ? 'global' : 'local', homeMapId: selectedMapId },
  )

  const dataMap: Record<LeaderboardTab, typeof area> = {
    AREA: area,
    EMPIRE: empire,
    TYCOONS: tycoons,
  }

  const currentData = dataMap[activeTab]
  const displayData = showAll ? currentData : currentData.slice(0, 20)
  const hasOwned = currentData.length > 0
  const isLoading = loading || boardsLoading

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
            {displayData.map((entry) => (
              <LeaderboardRow
                key={entry.owner}
                entry={entry}
                // The reigning "Ruler of <map>" is rank-1 of a single map's
                // LAND board. The global board is cross-map, so no per-map
                // crown there.
                isRuler={!isGlobal && activeTab === 'AREA' && entry.rank === 1}
              />
            ))}
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
          </>
        )}
      </div>
      <BottomNav activeRoute="/ranks" />
    </div>
  )
}
