import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LeaderboardTabs from '@/components/Leaderboard/LeaderboardTabs'

const RULE = 'Who grew the most during the campaign. Pixels you gained, minus pixels bought from you.'
const NOTE = 'Campaign closed. This is the ranking the payout settles against.'

describe('LeaderboardTabs', () => {
  it('renders the settled note ALONGSIDE the rule, never instead of it', () => {
    // Caught in review on #224: the note used to replace the description, so
    // the only in-app explanation of net gain disappeared at exactly the
    // moment a raided player came to read the final board.
    render(<LeaderboardTabs activeTab="CAMPAIGN" onTabChange={() => {}} campaignNote={NOTE} />)

    expect(screen.getByText(NOTE)).toBeInTheDocument()
    expect(screen.getByText(RULE)).toBeInTheDocument()
  })

  it('shows only the rule while the campaign runs (control)', () => {
    render(<LeaderboardTabs activeTab="CAMPAIGN" onTabChange={() => {}} campaignNote={null} />)

    expect(screen.getByText(RULE)).toBeInTheDocument()
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })

  it('never shows the campaign note on another tab', () => {
    render(<LeaderboardTabs activeTab="AREA" onTabChange={() => {}} campaignNote={NOTE} />)

    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
    expect(screen.getByText('Who owns the most pixels on the map.')).toBeInTheDocument()
  })
})
