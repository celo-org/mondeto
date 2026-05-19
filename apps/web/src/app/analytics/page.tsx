'use client'

import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import { useAnalytics } from '@/hooks/useAnalytics'
import { OPEN_NEXT_THRESHOLD, useMapSnapshots } from '@/hooks/useMapSnapshots'
import { formatUSDT } from '@/lib/colorUtils'
import { averagePrice, shouldOpenNextMap } from '@/lib/maps/assignment'
import { percentClaimed } from '@/lib/maps/adapter'

const PIXEL_FONT = "'Press Start 2P', monospace"

function Stat({
  label,
  value,
  unit,
  loading,
}: {
  label: string
  value: string
  unit?: string
  loading: boolean
}) {
  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '14px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 6,
          fontFamily: PIXEL_FONT,
          color: 'var(--text-muted)',
          letterSpacing: 2,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontSize: 18,
            fontFamily: PIXEL_FONT,
            color: 'var(--text)',
            letterSpacing: 1,
          }}
        >
          {loading ? '…' : value}
        </span>
        {unit && (
          <span
            style={{
              fontSize: 8,
              fontFamily: PIXEL_FONT,
              color: 'var(--text-muted)',
              letterSpacing: 1,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 7,
        fontFamily: PIXEL_FONT,
        color: 'var(--text-muted)',
        letterSpacing: 3,
        marginTop: 18,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  )
}

function AdvisoryPanel({
  decision,
  threshold,
  loading,
}: {
  decision: ReturnType<typeof shouldOpenNextMap> | null
  threshold: number
  loading: boolean
}) {
  if (loading || !decision) {
    return (
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '12px 14px',
          fontFamily: PIXEL_FONT,
          fontSize: 8,
          color: 'var(--text-muted)',
          letterSpacing: 1,
          marginBottom: 12,
        }}
      >
        loading map snapshots…
      </div>
    )
  }

  const avg = decision.freshestOpenMapAvgPrice ?? 0
  const open = decision.open
  // Operator-facing copy. Keep tone consistent with the rest of /analytics.
  const headline = open
    ? `Reveal another map — freshest map avg $${avg.toFixed(2)} >= threshold $${threshold.toFixed(2)}`
    : `Healthy — freshest map avg $${avg.toFixed(2)} < threshold $${threshold.toFixed(2)}`
  const dot = open ? '🟡' : '🟢'
  const border = open ? '#d4a017' : '#2a8c4a'
  const tint = open ? 'rgba(212, 160, 23, 0.12)' : 'rgba(42, 140, 74, 0.12)'

  return (
    <div
      data-testid="advisory-panel"
      data-decision={open ? 'open' : 'hold'}
      style={{
        background: tint,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: '12px 14px',
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 6,
          fontFamily: PIXEL_FONT,
          color: 'var(--text-muted)',
          letterSpacing: 2,
        }}
      >
        OPEN-NEXT-MAP SIGNAL
      </div>
      <div
        style={{
          fontSize: 9,
          fontFamily: PIXEL_FONT,
          color: 'var(--text)',
          letterSpacing: 1,
          lineHeight: 1.6,
        }}
      >
        {dot} {headline}
      </div>
    </div>
  )
}

function MapBreakdownTable({
  rows,
  thresholdAvg,
}: {
  rows: Array<{
    id: number
    revealed: boolean
    avg: number
    claimed: number
    status: 'open' | 'hidden'
  }>
  thresholdAvg: number
}) {
  if (rows.length === 0) return null

  const cell: React.CSSProperties = {
    padding: '8px 6px',
    fontSize: 7,
    fontFamily: PIXEL_FONT,
    color: 'var(--text)',
    letterSpacing: 1,
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  }
  const headCell: React.CSSProperties = {
    ...cell,
    color: 'var(--text-muted)',
    fontSize: 6,
    letterSpacing: 2,
    textAlign: 'left',
  }

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflowX: 'auto',
        marginBottom: 8,
      }}
    >
      <table
        data-testid="map-breakdown"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          minWidth: 320,
        }}
      >
        <thead>
          <tr>
            <th style={headCell}>MAP</th>
            <th style={headCell}>REVEALED</th>
            <th style={headCell}>AVG PRICE</th>
            <th style={headCell}>% CLAIMED</th>
            <th style={headCell}>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid={`map-row-${r.id}`}>
              <td style={cell}>{r.id}</td>
              <td style={cell}>{r.revealed ? '✓' : '—'}</td>
              <td style={cell}>${r.avg.toFixed(2)}</td>
              <td style={cell}>{(r.claimed * 100).toFixed(0)}%</td>
              <td
                style={{
                  ...cell,
                  color:
                    r.status === 'open' && r.avg >= thresholdAvg
                      ? '#d4a017'
                      : cell.color,
                }}
              >
                {r.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AnalyticsPage() {
  const a = useAnalytics()
  const maps = useMapSnapshots()

  const decision =
    maps.snapshots.length > 0
      ? shouldOpenNextMap(maps.snapshots, {
          averagePriceThreshold: OPEN_NEXT_THRESHOLD,
        })
      : null

  const rows = maps.snapshots.map((m) => ({
    id: m.meta.id,
    revealed: m.meta.open,
    avg: averagePrice(m),
    claimed: percentClaimed(m),
    status: m.meta.open ? ('open' as const) : ('hidden' as const),
  }))

  const feePct = a.feeRateBps / 100

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        paddingTop: 60,
        paddingBottom: 56,
      }}
    >
      <TopBar title="MONDETO" />

      <div
        style={{
          flex: 1,
          background: 'var(--bg)',
          padding: '12px 16px',
          maxWidth: 720,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontFamily: PIXEL_FONT,
            letterSpacing: 3,
            color: 'var(--text)',
            marginBottom: 6,
          }}
        >
          ANALYTICS
        </div>
        <div
          style={{
            fontSize: 7,
            fontFamily: PIXEL_FONT,
            color: 'var(--text-muted)',
            letterSpacing: 1,
            marginBottom: 12,
          }}
        >
          mondeto on-chain · celo mainnet
        </div>

        {a.error && (
          <div
            style={{
              fontSize: 8,
              color: 'var(--error)',
              border: '1px solid var(--error)',
              borderRadius: 8,
              padding: 10,
              marginBottom: 12,
              fontFamily: PIXEL_FONT,
              letterSpacing: 1,
            }}
          >
            failed to load: {a.error}
          </div>
        )}

        <AdvisoryPanel
          decision={decision}
          threshold={OPEN_NEXT_THRESHOLD}
          loading={maps.loading}
        />

        <MapBreakdownTable rows={rows} thresholdAvg={OPEN_NEXT_THRESHOLD} />

        <div
          style={{
            fontSize: 6,
            fontFamily: PIXEL_FONT,
            color: 'var(--text-muted)',
            letterSpacing: 1,
            lineHeight: 1.7,
            marginBottom: 4,
          }}
        >
          how to reveal another map: open the vercel project&apos;s postgres
          data editor, update the settings row&apos;s revealed_map_ids array,
          redeploy or wait for the next isr refresh.
        </div>

        <SectionHeader>PLAYERS</SectionHeader>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          <Stat label="DAILY ACTIVE" value={a.dailyActiveUsers.toString()} loading={a.loading} />
          <Stat label="WEEKLY ACTIVE" value={a.weeklyActiveUsers.toString()} loading={a.loading} />
          <Stat label="ALL-TIME PLAYERS" value={a.allTimePlayers.toString()} loading={a.loading} />
        </div>

        <SectionHeader>TRANSACTIONS</SectionHeader>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          <Stat label="24H" value={a.txCount24h.toString()} loading={a.loading} />
          <Stat label="7D" value={a.txCount7d.toString()} loading={a.loading} />
          <Stat label="ALL-TIME" value={a.txCountAllTime.toString()} loading={a.loading} />
        </div>

        <SectionHeader>VOLUME</SectionHeader>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          <Stat label="24H VOLUME" value={formatUSDT(a.volume24h)} unit="USDT" loading={a.loading} />
          <Stat label="7D VOLUME" value={formatUSDT(a.volume7d)} unit="USDT" loading={a.loading} />
          <Stat label="ALL-TIME VOLUME" value={formatUSDT(a.volumeAllTime)} unit="USDT" loading={a.loading} />
        </div>

        <SectionHeader>PLATFORM REVENUE</SectionHeader>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          <Stat
            label={`FEES @ ${feePct.toFixed(2)}%`}
            value={formatUSDT(a.revenueAllTime)}
            unit="USDT"
            loading={a.loading}
          />
        </div>

        <div
          style={{
            fontSize: 6,
            fontFamily: PIXEL_FONT,
            color: 'var(--text-muted)',
            letterSpacing: 1,
            marginTop: 18,
            lineHeight: 1.6,
          }}
        >
          window: blocks {a.windowStartBlock.toString()}–{a.windowEndBlock.toString()} ·
          fee rate read live from contract · revenue is an estimate
          (volume × fee%); actual withdrawable balance lives on-chain
        </div>
      </div>

      <BottomNav activeRoute="/analytics" />
    </div>
  )
}
