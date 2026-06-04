'use client'

import { useState, useEffect } from 'react'
import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import LeaderboardTabs from '@/components/Leaderboard/LeaderboardTabs'
import LeaderboardRow from '@/components/Leaderboard/LeaderboardRow'
import {
  useLeaderboard,
  type LeaderboardTab,
  type OwnerProfileData,
} from '@/hooks/useLeaderboard'
import { useMaps } from '@/hooks/useMaps'
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
  const { homeMapId, currentMapId } = useMaps()
  const mondetoContract = getMapContractById(currentMapId)
  const mondetoAddress = mondetoContract.address
  const [pixelData, setPixelData] = useState<PixelView[]>([])
  const [profilesMap, setProfilesMap] = useState<Map<string, OwnerProfileData>>(new Map())
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('AREA')
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)

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

  // Global scope toggle removed — leaderboard is local-only for now.
  // Tracked as a follow-up in project memory; restore the ScopeToggle when
  // re-introducing cross-map rankings.
  const { area, empire, tycoons, loading: boardsLoading } = useLeaderboard(
    pixelData,
    profilesMap,
    { scope: 'local', homeMapId: homeMapId ?? undefined },
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
      <LeaderboardTabs activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setShowAll(false) }} />
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
        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img
              src="/brand/mondeto-symbol.gif"
              alt=""
              width={72}
              height={72}
              style={{ display: 'block', imageRendering: 'pixelated' }}
            />
          </div>
        ) : hasOwned ? (
          <>
            {displayData.map((entry) => (
              <LeaderboardRow key={entry.owner} entry={entry} />
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
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '60%',
              gap: 8,
            }}
          >
            <img
              src="/brand/mondeto-symbol.gif"
              alt=""
              width={72}
              height={72}
              style={{ display: 'block', imageRendering: 'pixelated', marginBottom: 6 }}
            />
            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>no claims yet</span>
            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>be the first to own the world</span>
          </div>
        )}
      </div>
      <BottomNav activeRoute="/ranks" />
    </div>
  )
}
