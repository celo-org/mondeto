import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { MapSnapshot } from '@/lib/maps/types'

// Stub navigation / layout chrome so we can render the page in jsdom.
vi.mock('@/components/Layout/TopBar', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}))
vi.mock('@/components/Layout/BottomNav', () => ({
  default: () => <div data-testid="bottom-nav" />,
}))

// Default analytics: stable zeros (we're testing the advisory, not the cards).
vi.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({
    loading: false,
    error: null,
    dailyActiveUsers: 0,
    weeklyActiveUsers: 0,
    allTimePlayers: 0,
    txCount24h: 0,
    txCount7d: 0,
    txCountAllTime: 0,
    volume24h: 0n,
    volume7d: 0n,
    volumeAllTime: 0n,
    feeRateBps: 500,
    revenueAllTime: 0n,
    windowStartBlock: 0n,
    windowEndBlock: 0n,
    fetchedAt: 0,
  }),
}))

// `useMapSnapshots` is the swappable bit. Each test sets the return value.
const mockSnapshots = vi.fn()
vi.mock('@/hooks/useMapSnapshots', () => ({
  OPEN_NEXT_THRESHOLD: 2,
  useMapSnapshots: () => mockSnapshots(),
}))

function makeSnapshot(opts: {
  id: number
  open: boolean
  /** Same price applied to every land pixel — keeps assertions simple. */
  price: number
  /** Fraction in [0, 1] of land pixels with an owner. */
  ownedFraction: number
}): MapSnapshot {
  const total = 100 // 100 land pixels, 0 water — averagePrice ignores water
  const ownedCount = Math.round(opts.ownedFraction * total)
  return {
    meta: { id: opts.id, open: opts.open },
    pixels: Array.from({ length: total }, (_, i) => ({
      id: i,
      x: i,
      y: 0,
      owner: i < ownedCount ? `0x${i.toString(16).padStart(40, '0')}` : null,
      currentPrice: opts.price,
      isLand: true,
    })),
  }
}

describe('AnalyticsPage advisory', () => {
  beforeEach(() => {
    mockSnapshots.mockReset()
  })

  it('renders the healthy advisory when avg price is below threshold', async () => {
    mockSnapshots.mockReturnValue({
      snapshots: [makeSnapshot({ id: 0, open: true, price: 0.04, ownedFraction: 0.12 })],
      loading: false,
      error: null,
    })

    const { default: AnalyticsPage } = await import('@/app/analytics/page')
    render(<AnalyticsPage />)

    const panel = screen.getByTestId('advisory-panel')
    expect(panel.getAttribute('data-decision')).toBe('hold')
    expect(panel.textContent).toMatch(/Healthy/)
    expect(panel.textContent).toMatch(/\$0\.04/)
    expect(panel.textContent).toMatch(/threshold \$2\.00/)
  })

  it('renders the reveal-another-map advisory when avg price hits threshold', async () => {
    mockSnapshots.mockReturnValue({
      snapshots: [makeSnapshot({ id: 0, open: true, price: 2.5, ownedFraction: 0.9 })],
      loading: false,
      error: null,
    })

    const { default: AnalyticsPage } = await import('@/app/analytics/page')
    render(<AnalyticsPage />)

    const panel = screen.getByTestId('advisory-panel')
    expect(panel.getAttribute('data-decision')).toBe('open')
    expect(panel.textContent).toMatch(/Reveal another map/)
    expect(panel.textContent).toMatch(/\$2\.50/)
  })

  it('renders one row per revealed map with avg price and % claimed', async () => {
    mockSnapshots.mockReturnValue({
      snapshots: [makeSnapshot({ id: 0, open: true, price: 0.04, ownedFraction: 0.12 })],
      loading: false,
      error: null,
    })

    const { default: AnalyticsPage } = await import('@/app/analytics/page')
    render(<AnalyticsPage />)

    const row = screen.getByTestId('map-row-0')
    expect(row.textContent).toMatch(/\$0\.04/)
    expect(row.textContent).toMatch(/12%/)
    expect(row.textContent).toMatch(/open/)
  })

  it('shows a loading placeholder while snapshots are fetching', async () => {
    mockSnapshots.mockReturnValue({
      snapshots: [],
      loading: true,
      error: null,
    })

    const { default: AnalyticsPage } = await import('@/app/analytics/page')
    render(<AnalyticsPage />)

    expect(screen.getByText(/loading map snapshots/i)).toBeInTheDocument()
  })

  it('renders the how-to-reveal hint under the table', async () => {
    mockSnapshots.mockReturnValue({
      snapshots: [makeSnapshot({ id: 0, open: true, price: 0.04, ownedFraction: 0.12 })],
      loading: false,
      error: null,
    })

    const { default: AnalyticsPage } = await import('@/app/analytics/page')
    render(<AnalyticsPage />)

    expect(
      screen.getByText(/vercel project's postgres data editor/i),
    ).toBeInTheDocument()
  })
})
