import { describe, it, expect } from 'vitest'
import { SLIDES } from '@/components/Overlays/IntroScreen'

const rewards = SLIDES.find((s) => s.key === 'rewards')
const allCopy = SLIDES.map((s) => [s.kicker, s.headline, s.body, s.tagline].filter(Boolean).join(' ')).join('\n')

describe('IntroScreen reward slide', () => {
  it('still exists', () => {
    // The guards below are vacuous if the slide is renamed or dropped.
    expect(rewards).toBeDefined()
    expect(rewards!.body).toBeTruthy()
  })

  it('never promises daily rewards', () => {
    // This slide is shown once, full-screen, to every new player. It used to
    // read "Claim daily rewards" — rewards are neither daily nor claimed, and
    // that one sentence drove most of the "I wasn't paid" support volume.
    expect(allCopy).not.toMatch(/daily/i)
  })

  it('never tells players to claim a reward', () => {
    // Payouts are pushed straight to the wallet; there is nothing to claim and
    // nothing to withdraw. "Claim" invites players to hunt for a button that
    // does not exist.
    expect(rewards!.body).not.toMatch(/\bclaim/i)
    expect(rewards!.body).not.toMatch(/\bwithdraw/i)
  })

  it('makes rewards conditional on a campaign running', () => {
    // Campaigns run on selected days only. Copy that implies rewards are
    // always available recreates the original misunderstanding.
    expect(rewards!.body).toMatch(/campaign/i)
  })
})
