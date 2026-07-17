'use client'

import { useRouter } from 'next/navigation'
import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import { useMaps } from '@/hooks/useMaps'
import { useShouldOpenNextMap } from '@/hooks/useShouldOpenNextMap'
import { getMaskData } from '@/lib/maps/masks'
import type { MapContract } from '@/lib/maps/contracts'
import type { MapId } from '@/lib/maps/types'

const PIXEL_FONT = "'Press Start 2P', monospace"

interface RowProps {
  map: MapContract
  fillPct: number | null
  landCount: number
  isHome: boolean
  isCurrent: boolean
  onPick: (id: MapId) => void
}

function AtlasRow({ map, fillPct, landCount, isHome, isCurrent, onPick }: RowProps) {
  return (
    <button
      type="button"
      onClick={() => onPick(map.id)}
      aria-current={isCurrent ? 'true' : undefined}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '14px 14px',
        background: isCurrent ? 'var(--button-bg)' : 'var(--card-bg)',
        color: isCurrent ? 'var(--button-text)' : 'var(--text)',
        border: '1px solid var(--text-muted)',
        borderRadius: 'var(--radius-md)',
        fontFamily: PIXEL_FONT,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, letterSpacing: 2 }}>{map.displayName}</span>
          {isHome && (
            <span
              style={{
                fontSize: 6,
                letterSpacing: 1,
                padding: '2px 5px',
                borderRadius: 4,
                border: '1px solid currentColor',
              }}
            >
              HOME
            </span>
          )}
        </span>
        <span style={{ fontSize: 6, letterSpacing: 1, opacity: 0.7 }}>
          {map.width}×{map.height} • {landCount} land pixels
        </span>
      </span>
      <span style={{ fontSize: 8, letterSpacing: 1, opacity: 0.85 }}>
        {fillPct === null ? '?' : `${Math.round(fillPct)}%`}
      </span>
    </button>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 8,
        fontFamily: PIXEL_FONT,
        letterSpacing: 3,
        color: 'var(--text-muted)',
        padding: '20px 4px 8px',
      }}
    >
      {children}
    </div>
  )
}

export default function AtlasPage() {
  const router = useRouter()
  const { revealedMaps, homeMapId, currentMapId, setCurrentMapId } = useMaps()
  const { perMap, loading } = useShouldOpenNextMap()

  const fillFor = (id: MapId): number | null => {
    const summary = perMap.find((p) => p.mapId === id)
    return summary ? summary.fillPct : null
  }

  const worldMaps = revealedMaps.filter((m) => m.slug === 'world')
  const continentSlugs = new Set(['africa', 'europe', 'asia', 'north-america', 'south-america', 'oceania', 'antarctica'])
  const continentMaps = revealedMaps.filter((m) => continentSlugs.has(m.slug))

  const handlePick = (id: MapId) => {
    setCurrentMapId(id)
    router.push('/')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingTop: 60 }}>
      <TopBar title="MONDETO" />
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg)',
          padding: '16px 16px 72px',
          color: 'var(--text)',
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontFamily: PIXEL_FONT,
            letterSpacing: 4,
            marginBottom: 4,
          }}
        >
          ATLAS
        </div>
        <div
          style={{
            fontSize: 7,
            fontFamily: PIXEL_FONT,
            letterSpacing: 1.5,
            color: 'var(--text-muted)',
            marginBottom: 12,
          }}
        >
          pick a map to claim
        </div>

        {loading && (
          <div
            style={{
              fontSize: 6,
              fontFamily: PIXEL_FONT,
              letterSpacing: 1,
              color: 'var(--text-muted)',
              padding: '4px 0 12px',
            }}
          >
            loading fill %…
          </div>
        )}

        {worldMaps.length > 0 && (
          <>
            <SectionHeading>WORLD</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {worldMaps.map((m) => (
                <AtlasRow
                  key={m.id}
                  map={m}
                  fillPct={fillFor(m.id)}
                  landCount={getMaskData(m.slug).landCount}
                  isHome={m.id === homeMapId}
                  isCurrent={m.id === currentMapId}
                  onPick={handlePick}
                />
              ))}
            </div>
          </>
        )}

        {continentMaps.length > 0 && (
          <>
            <SectionHeading>CONTINENTS</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {continentMaps.map((m) => (
                <AtlasRow
                  key={m.id}
                  map={m}
                  fillPct={fillFor(m.id)}
                  landCount={getMaskData(m.slug).landCount}
                  isHome={m.id === homeMapId}
                  isCurrent={m.id === currentMapId}
                  onPick={handlePick}
                />
              ))}
            </div>
          </>
        )}

        <SectionHeading>COUNTRIES</SectionHeading>
        <div
          style={{
            border: '1px dashed var(--text-muted)',
            borderRadius: 'var(--radius-md)',
            padding: '20px 12px',
            textAlign: 'center',
            fontSize: 7,
            fontFamily: PIXEL_FONT,
            letterSpacing: 2,
            color: 'var(--text-muted)',
          }}
        >
          COMING SOON
        </div>
      </div>
      <BottomNav activeRoute="/atlas" />
    </div>
  )
}
