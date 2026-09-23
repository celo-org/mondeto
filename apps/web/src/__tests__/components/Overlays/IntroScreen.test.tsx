import { describe, it, expect } from 'vitest'
import { SLIDES } from '@/components/Overlays/IntroScreen'

/**
 * Copy regression guard for the onboarding rewards slide.
 *
 * The intro is shown once, full-screen, to every new player, so a wrong
 * promise here is the most expensive copy in the app. The old line read
 * "Claim daily rewards" — rewards are neither daily (campaigns don't run
 * every day) nor claimed (payouts are pushed, the day after a campaign
 * ends). That one sentence drove most of the "I wasn't paid" support
 * volume, and #183 rewrote it. These assertions keep it rewritten.
 */
describe('IntroScreen rewards slide copy', () => {
  const rewards = SLIDES.find((s) => s.key === 'rewards')

  it('exists in the deck', () => {
    expect(rewards).toBeDefined()
  })

  it('never calls rewards daily — campaigns do not run every day', () => {
    expect(`${rewards!.kicker} ${rewards!.headline ?? ''} ${rewards!.body}`).not.toMatch(/daily/i)
  })

  it('never tells players to claim or withdraw — payouts are pushed', () => {
    const copy = `${rewards!.kicker} ${rewards!.headline ?? ''} ${rewards!.body}`
    expect(copy).not.toMatch(/claim/i)
    expect(copy).not.toMatch(/withdraw/i)
  })

  it('keeps getting paid conditional on a campaign running', () => {
    // Both halves matter: naming a campaign, and tying the payout to it.
    expect(rewards!.body).toMatch(/campaign/i)
    expect(rewards!.body).toMatch(/when a campaign runs/i)
  })

  it('never promises claiming or daily rewards anywhere else in the deck', () => {
    // The promise is what misleads, not the slide it sits on — a rewrite
    // that moves the old wording to another slide is the same defect.
    const deck = SLIDES.map((s) => `${s.kicker} ${s.headline ?? ''} ${s.body}`).join(' ')
    expect(deck).not.toMatch(/daily/i)
    expect(deck).not.toMatch(/\bclaim\b/i)
    expect(deck).not.toMatch(/\bwithdraw\b/i)
  })
})

/**
 * Copy regression guard for the resale explanation on the hold slide.
 *
 * Support kept getting "I want to sell my pixel, how do I do it" and "how
 * will I know when someone bought my land" — players assumed a sell step
 * they were missing. There is none: a pixel changes hands only when another
 * player buys it, and the proceeds land in the owner's wallet in that same
 * transaction. The slide has to say that without turning into a promise of
 * resale, a timeline, or a payout — the same bar as the rewards slide.
 */
describe('IntroScreen hold slide resale copy', () => {
  const hold = SLIDES.find((s) => s.key === 'hold')
  const copy = () => `${hold!.kicker} ${hold!.headline ?? ''} ${hold!.body}`

  it('exists in the deck', () => {
    expect(hold).toBeDefined()
  })

  it('says there is no sell step and frames pixels as real estate', () => {
    expect(hold!.body).toMatch(/no sell button/i)
    expect(hold!.body).toMatch(/real estate/i)
  })

  it('ties the sale to another player wanting the pixel, not to the owner acting', () => {
    expect(hold!.body).toMatch(/somebody else wants it/i)
  })

  it('says the proceeds land in the wallet, so the payment itself is the signal', () => {
    expect(hold!.body).toMatch(/wallet/i)
  })

  it('never promises a resale, a timeline, or a guarantee', () => {
    expect(copy()).not.toMatch(/guarantee/i)
    expect(copy()).not.toMatch(/\b(within|in) \d+ (minutes|hours|days|weeks)\b/i)
    expect(copy()).not.toMatch(/\b(always|instantly|quickly) sells?\b/i)
    expect(copy()).not.toMatch(/\b(list|sell) (it|your pixel|now)\b/i)
    expect(copy()).not.toMatch(/notif/i)
  })
})
