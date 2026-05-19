'use client'

import { useState, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import LeaderboardTabs from '@/components/Leaderboard/LeaderboardTabs'
import LeaderboardRow from '@/components/Leaderboard/LeaderboardRow'
import { useLeaderboard, type LeaderboardTab, type OwnerProfileData } from '@/hooks/useLeaderboard'
import type { PixelView } from '@/lib/mock'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { MONDETO_ABI } from '@/lib/contract'
import { useMaps } from '@/hooks/useMaps'
import { getContractByMapId } from '@/lib/maps/contracts'
import { ZERO_ADDRESS } from '@/constants/map'
import { uint24ToHex } from '@/lib/colorUtils'
import { decodeBytes } from '@/lib/decodeBytes'

export default function RanksPage() {
  const publicClient = usePublicClient()
  const { currentMapId } = useMaps()
  const mondetoAddress = getContractByMapId(currentMapId)
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
          data = await fetchAllPixelsFromContract(
            publicClient.readContract.bind(publicClient) as Parameters<typeof fetchAllPixelsFromContract>[0],
            mondetoAddress,
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
  }, [publicClient, mondetoAddress])

  const { area, empire, tycoons } = useLeaderboard(pixelData, profilesMap)

  const dataMap: Record<LeaderboardTab, typeof area> = {
    AREA: area,
    EMPIRE: empire,
    TYCOONS: tycoons,
  }

  const currentData = dataMap[activeTab]
  const displayData = showAll ? currentData : currentData.slice(0, 20)
  const hasOwned = currentData.length > 0

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
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '40%', gap: 8 }}>
            <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="var(--text-muted)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 2s linear infinite' }}>
              <circle cx={12} cy={12} r={10} />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
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
                  margin: '8px auto',
                  fontSize: 7,
                  fontFamily: "'Press Start 2P', monospace",
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '5px 12px',
                  cursor: 'pointer',
                  letterSpacing: 0.5,
                }}
              >
                show more
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
            <svg
              viewBox="0 0 24 24"
              width={32}
              height={32}
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth={1}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx={12} cy={12} r={10} />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>no claims yet</span>
            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>be the first to own the world</span>
          </div>
        )}
      </div>
      <BottomNav activeRoute="/ranks" />
    </div>
  )
}
