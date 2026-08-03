import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatsRow from '@/components/Profile/StatsRow'

describe('StatsRow', () => {
  it('shows pixels value', () => {
    render(<StatsRow pixels={42} balance="10.00" rank={3} />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('PIXELS')).toBeInTheDocument()
  })

  it('shows balance value with default BALANCE label', () => {
    render(<StatsRow pixels={42} balance="10.00" rank={3} />)
    expect(screen.getByText('10.00')).toBeInTheDocument()
    expect(screen.getByText('BALANCE')).toBeInTheDocument()
  })

  it('shows balance with stablecoin symbol when provided', () => {
    render(<StatsRow pixels={42} balance="10.00" balanceSymbol="USDm" rank={3} />)
    expect(screen.getByText('10.00')).toBeInTheDocument()
    expect(screen.getByText('BALANCE · USDM')).toBeInTheDocument()
  })

  it('shows rank with # prefix', () => {
    render(<StatsRow pixels={42} balance="10.00" rank={3} />)
    expect(screen.getByText('#3')).toBeInTheDocument()
    expect(screen.getByText('RANK')).toBeInTheDocument()
  })

  it('shows dash when rank is 0', () => {
    render(<StatsRow pixels={0} balance="0.00" rank={0} />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('shows the rank-gap nudge under the rank when provided', () => {
    render(<StatsRow pixels={42} balance="10.00" rank={4} rankGapLabel="12 PX FROM #3" />)
    expect(screen.getByText('#4')).toBeInTheDocument()
    expect(screen.getByText('12 PX FROM #3')).toBeInTheDocument()
  })

  it('does not show a rank-gap nudge when unranked, even if passed', () => {
    render(<StatsRow pixels={0} balance="0.00" rank={0} rankGapLabel="RULER" />)
    expect(screen.queryByText('RULER')).not.toBeInTheDocument()
  })

  it('shows the LAND VALUE card when a value is provided', () => {
    render(<StatsRow pixels={42} balance="10.00" rank={3} landValue="12.34" spent="5.00" earned="2.00" />)
    expect(screen.getByText('LAND VALUE')).toBeInTheDocument()
    expect(screen.getByText('12.34')).toBeInTheDocument()
    expect(screen.getByText('SPENT')).toBeInTheDocument()
    expect(screen.getByText('EARNED')).toBeInTheDocument()
  })

  it('omits the LAND VALUE card (and the whole money row) when no money figures are passed', () => {
    render(<StatsRow pixels={42} balance="10.00" rank={3} />)
    expect(screen.queryByText('LAND VALUE')).not.toBeInTheDocument()
    expect(screen.queryByText('SPENT')).not.toBeInTheDocument()
  })
})
