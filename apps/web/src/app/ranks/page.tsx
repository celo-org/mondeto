'use client'

import { useState, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import LeaderboardTabs from '@/components/Leaderboard/LeaderboardTabs'
import LeaderboardRow from '@/components/Leaderboard/LeaderboardRow'
import {
  useLeaderboard,
  type LeaderboardTab,
  type LeaderboardScope,
  type OwnerProfileData,
} from '@/hooks/useLeaderboard'
import { useMaps } from '@/hooks/useMaps'
import type { PixelView } from '@/lib/mock'
import { fetchAllPixelsFromContract } from '@/lib/contractReads'
import { MONDETO_ABI } from '@/lib/contract'
import { getContractByMapId } from '@/lib/maps/contracts'
import { ZERO_ADDRESS } from '@/constants/map'
import { uint24ToHex } from '@/lib/colorUtils'
import { decodeBytes } from '@/lib/decodeBytes'

const PIXEL_FONT = "'Press Start 2P', monospace"

export default function RanksPage() {
  const publicClient = usePublicClient()
  const { revealedMaps, homeMapId, currentMapId } = useMaps()
  // ScopeToggle's "your home — map N" caption requires a known home, which
  // only exists once the wallet is connected; hide the toggle otherwise.
  const showScopeToggle = revealedMaps.length > 1 && homeMapId !== null
  const mondetoAddress = getContractByMapId(currentMapId)
  const [pixelData, setPixelData] = useState<PixelView[]>([])
  const [profilesMap, setProfilesMap] = useState<Map<string, OwnerProfileData>>(new Map())
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('AREA')
  const [scope, setScope] = useState<LeaderboardScope>('local')
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

  const { area, empire, tycoons, loading: boardsLoading } = useLeaderboard(
    pixelData,
    profilesMap,
    { scope, homeMapId: homeMapId ?? undefined },
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
      {showScopeToggle && homeMapId !== null && (
        <ScopeToggle
          scope={scope}
          onScopeChange={(next) => {
            setScope(next)
            setShowAll(false)
          }}
          homeMapId={homeMapId}
        />
      )}
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

interface ScopeToggleProps {
  scope: LeaderboardScope
  onScopeChange: (scope: LeaderboardScope) => void
  homeMapId: number
}

function ScopeToggle({ scope, onScopeChange, homeMapId }: ScopeToggleProps) {
  const caption =
    scope === 'local'
      ? `your home — map ${homeMapId}`
      : 'all maps'

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        borderBottom: '1px solid var(--border)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'space-between',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', gap: 6 }}>
        {(['local', 'global'] as const).map((s) => {
          const isActive = s === scope
          return (
            <button
              key={s}
              onClick={() => onScopeChange(s)}
              style={{
                fontSize: 8,
                fontFamily: PIXEL_FONT,
                letterSpacing: 2,
                padding: '6px 12px',
                cursor: 'pointer',
                background: isActive ? '#A7FF05' : 'transparent',
                color: isActive ? '#1B1B1B' : 'rgba(255,255,255,0.55)',
                border: `1px solid ${isActive ? '#A7FF05' : 'rgba(255,255,255,0.2)'}`,
                borderRadius: 0,
              }}
            >
              {s === 'local' ? 'LOCAL' : 'GLOBAL'}
            </button>
          )
        })}
      </div>
      <span
        style={{
          fontSize: 7,
          fontFamily: PIXEL_FONT,
          color: 'var(--text-muted)',
          letterSpacing: 1,
        }}
      >
        {caption}
      </span>
    </div>
  )
}
