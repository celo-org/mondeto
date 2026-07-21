import { describe, it, expect } from 'vitest'
import {
  isCampaignActive,
  timeRemainingLabel,
  type CampaignConfig,
} from '@/lib/campaign'

const base: CampaignConfig = { id: 'test', text: 'prize pool live' }
const now = new Date('2026-07-10T12:00:00Z')

describe('isCampaignActive', () => {
  it('is active with no window set', () => {
    expect(isCampaignActive(base, now)).toBe(true)
  })

  it('is inactive before startsAt', () => {
    expect(
      isCampaignActive({ ...base, startsAt: '2026-07-11T00:00:00Z' }, now),
    ).toBe(false)
  })

  it('is active after startsAt and before endsAt', () => {
    expect(
      isCampaignActive(
        { ...base, startsAt: '2026-07-10T00:00:00Z', endsAt: '2026-07-17T00:00:00Z' },
        now,
      ),
    ).toBe(true)
  })

  it('is inactive at and after endsAt', () => {
    expect(isCampaignActive({ ...base, endsAt: '2026-07-10T12:00:00Z' }, now)).toBe(false)
    expect(isCampaignActive({ ...base, endsAt: '2026-07-01T00:00:00Z' }, now)).toBe(false)
  })

  it('ignores malformed dates', () => {
    expect(isCampaignActive({ ...base, startsAt: 'soon', endsAt: 'later' }, now)).toBe(true)
  })
})

describe('timeRemainingLabel', () => {
  it('is null without endsAt or when past', () => {
    expect(timeRemainingLabel(base, now)).toBeNull()
    expect(timeRemainingLabel({ ...base, endsAt: '2026-07-01T00:00:00Z' }, now)).toBeNull()
  })

  it('formats days + hours', () => {
    expect(
      timeRemainingLabel({ ...base, endsAt: '2026-07-13T15:30:00Z' }, now),
    ).toBe('3D 3H')
  })

  it('formats hours + minutes under a day', () => {
    expect(
      timeRemainingLabel({ ...base, endsAt: '2026-07-10T16:12:00Z' }, now),
    ).toBe('4H 12M')
  })

  it('formats minutes under an hour with a 0H prefix, floored at 1M', () => {
    // The label never collapses to a bare "45M" — it keeps the "0H " prefix so
    // the countdown always shows two units (see timeRemainingLabel).
    expect(timeRemainingLabel({ ...base, endsAt: '2026-07-10T12:45:00Z' }, now)).toBe('0H 45M')
    expect(timeRemainingLabel({ ...base, endsAt: '2026-07-10T12:00:30Z' }, now)).toBe('0H 1M')
  })
})
