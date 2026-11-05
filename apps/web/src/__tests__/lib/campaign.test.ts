import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// Module-scope mock over a mutable ref: the factory is hoisted, so it must not
// close over anything declared with `const` below it.
const { edgeConfigRef } = vi.hoisted(() => ({ edgeConfigRef: { value: null as unknown } }))
vi.mock('@vercel/edge-config', () => ({ get: async () => edgeConfigRef.value }))

import {
  isCampaignActive,
  readCampaignForBoard,
  timeRemainingLabel,
  SETTLED_BOARD_GRACE_MS,
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

describe('readCampaignForBoard', () => {
  // Edge Config is read through a DYNAMIC import inside the function, so what
  // it resolves is decided at call time, not at module load. The first version
  // of this suite stubbed the env and mocked the module *inside* the awaited
  // call and tore both down in `afterEach` — which made it flaky at roughly 1
  // run in 12, always as `expected null`, i.e. the env stub being removed out
  // from under an in-flight call.
  //
  // So: the mock is module-scope over a mutable ref, and the env is set once
  // per test before anything runs. No test's teardown can race another's setup,
  // and nothing needs `resetModules`.
  const ENDS = '2026-07-10T10:00:00Z'
  const finished: CampaignConfig = { ...base, startsAt: '2026-07-09T10:00:00Z', endsAt: ENDS }

  beforeEach(() => {
    vi.stubEnv('EDGE_CONFIG', 'https://edge-config.test/x')
    edgeConfigRef.value = finished
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function read(at: Date, campaign: CampaignConfig | null = finished) {
    edgeConfigRef.value = campaign
    return readCampaignForBoard(at)
  }

  it('keeps a just-finished campaign visible, flagged as settled', async () => {
    // The settled board is what the payout is computed from. Hiding it the
    // instant the window closes means winners never see the ranking they were
    // paid on — and payouts land the day AFTER a campaign ends.
    const justAfter = new Date(Date.parse(ENDS) + 60_000)
    await expect(read(justAfter)).resolves.toMatchObject({ settled: true })
  })

  it('still serves it the day after, when the payout actually lands', async () => {
    const nextDay = new Date(Date.parse(ENDS) + 25 * 60 * 60 * 1000)
    await expect(read(nextDay)).resolves.toMatchObject({ settled: true })
  })

  it('drops it once the grace period is over', async () => {
    const longAfter = new Date(Date.parse(ENDS) + SETTLED_BOARD_GRACE_MS + 1000)
    await expect(read(longAfter)).resolves.toBeNull()
  })

  it('reports a running campaign as not settled', async () => {
    const during = new Date(Date.parse(ENDS) - 60_000)
    await expect(read(during)).resolves.toMatchObject({ settled: false })
  })

  it('does not show a campaign that has not started yet', async () => {
    // "Not active" covers both ends of the window. Only a FINISHED campaign
    // earns the grace period — showing an unstarted one's empty board is a lie.
    const future: CampaignConfig = {
      ...base,
      startsAt: '2026-07-11T10:00:00Z',
      endsAt: '2026-07-11T20:00:00Z',
    }
    await expect(read(new Date('2026-07-10T12:00:00Z'), future)).resolves.toBeNull()
  })

  it('ignores a finished campaign with no end boundary', async () => {
    const open: CampaignConfig = { ...base, startsAt: '2026-07-01T00:00:00Z' }
    await expect(read(new Date('2026-07-10T12:00:00Z'), open)).resolves.toMatchObject({
      settled: false,
    })
  })
})
