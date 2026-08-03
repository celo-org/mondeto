'use client'

// `dynamic = 'force-dynamic'` lives in ./layout.tsx — the route segment
// config is only honoured in server components.

import TopBar from '@/components/Layout/TopBar'
import BottomNav from '@/components/Layout/BottomNav'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useShouldOpenNextMap } from '@/hooks/useShouldOpenNextMap'
import { formatUSDT } from '@/lib/colorUtils'

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

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

function AdvisoryPanel() {
  const advisory = useShouldOpenNextMap()
  const decision = advisory.decision
  const isOpen = decision?.open ?? false
  const headline = advisory.loading
    ? '…'
    : isOpen
      ? 'OPEN NEXT MAP'
      : 'HEALTHY'
  // Color and emoji match the existing pixel-card style.
  const pillColor = isOpen ? 'var(--warning, #f1c40f)' : 'var(--success, #2ecc71)'
  const pillEmoji = isOpen ? '\u{1F7E1}' : '\u{1F7E2}'

  const freshestId = decision?.freshestOpenMapId
  const freshestAvg = decision?.freshestOpenMapAvgPrice ?? null

  return (
    <>
      <SectionHeader>OPERATOR ADVISORY</SectionHeader>
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
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
          STATUS
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontSize: 18,
              fontFamily: PIXEL_FONT,
              color: pillColor,
              letterSpacing: 1,
            }}
          >
            {advisory.loading ? '…' : `${pillEmoji} ${headline}`}
          </span>
        </div>
        <div
          style={{
            fontSize: 7,
            fontFamily: PIXEL_FONT,
            color: 'var(--text-muted)',
            letterSpacing: 1,
            lineHeight: 1.7,
          }}
        >
          freshest open map:{' '}
          <span style={{ color: 'var(--text)' }}>
            {freshestId === null || freshestId === undefined
              ? '—'
              : `map ${freshestId}`}
          </span>
          <br />
          avg price:{' '}
          <span style={{ color: 'var(--text)' }}>
            {freshestAvg === null ? '—' : formatUsd(freshestAvg)}
          </span>
          <br />
          threshold:{' '}
          <span style={{ color: 'var(--text)' }}>
            {formatUsd(advisory.thresholdUsd)}
          </span>
          {decision?.reason && (
            <>
              <br />
              reason:{' '}
              <span style={{ color: 'var(--text)' }}>{decision.reason}</span>
            </>
          )}
          {advisory.error && (
            <>
              <br />
              <span style={{ color: 'var(--error)' }}>
                advisory error: {advisory.error}
              </span>
            </>
          )}
        </div>
      </div>

      <SectionHeader>PER MAP</SectionHeader>
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '10px 8px',
          overflowX: 'auto',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: PIXEL_FONT,
            fontSize: 7,
            letterSpacing: 1,
            color: 'var(--text)',
            minWidth: 320,
          }}
        >
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th
                style={{
                  textAlign: 'left',
                  padding: '6px 8px',
                  fontWeight: 'normal',
                }}
              >
                MAP
              </th>
              <th
                style={{
                  textAlign: 'right',
                  padding: '6px 8px',
                  fontWeight: 'normal',
                }}
              >
                CLAIMED
              </th>
              <th
                style={{
                  textAlign: 'right',
                  padding: '6px 8px',
                  fontWeight: 'normal',
                }}
              >
                AVG
              </th>
            </tr>
          </thead>
          <tbody>
            {advisory.loading && (
              <tr>
                <td
                  colSpan={3}
                  style={{ padding: '8px', color: 'var(--text-muted)' }}
                >
                  loading…
                </td>
              </tr>
            )}
            {!advisory.loading && advisory.perMap.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  style={{ padding: '8px', color: 'var(--text-muted)' }}
                >
                  no revealed maps
                </td>
              </tr>
            )}
            {advisory.perMap.map((m) => (
              <tr
                key={m.mapId}
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <td style={{ padding: '6px 8px' }}>MAP {m.mapId}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  {m.fillPct.toFixed(1)}%
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  {formatUsd(m.avgPriceUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function AnalyticsPage() {
  const a = useAnalytics()

  const feePct = a.feeRateBps / 100
  // Treasury take splits into two buckets: 100% of first-time (primary) sales,
  // plus the feeRate cut on resales. `revenueAllTime` is their sum.
  const resaleFee =
    a.feeRateBps > 0 ? (a.resaleVolumeAllTime * BigInt(a.feeRateBps)) / 10_000n : 0n

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

        <SectionHeader>TREASURY REVENUE</SectionHeader>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          <Stat
            label="TREASURY TAKE"
            value={formatUSDT(a.revenueAllTime)}
            unit="USDT"
            loading={a.loading}
          />
          <Stat
            label="PRIMARY SALES"
            value={formatUSDT(a.primaryProceedsAllTime)}
            unit="USDT"
            loading={a.loading}
          />
          <Stat
            label={`RESALE FEES @ ${feePct.toFixed(2)}%`}
            value={formatUSDT(resaleFee)}
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
          fee rate read live from contract · treasury take = 100% of first-time
          (primary) sales + {feePct.toFixed(2)}% fee on resales; actual
          withdrawable balance lives on-chain
        </div>

        <AdvisoryPanel />
      </div>

      <BottomNav activeRoute="/analytics" />
    </div>
  )
}
