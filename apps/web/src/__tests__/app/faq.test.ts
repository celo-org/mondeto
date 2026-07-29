import { describe, it, expect } from 'vitest'
import { FAQ_GROUPS } from '@/app/faq/content'
import { BOARD_LABELS, type LeaderboardTab } from '@/lib/maps/leaderboards'

const allItems = FAQ_GROUPS.flatMap((g) => g.items)
const allCopy = allItems.map((i) => `${i.q} ${i.a}`).join('\n')

describe('FAQ anchors', () => {
  it('has a unique id for every group and every item', () => {
    // Support pastes these into replies (mondeto.app/faq#payout-timing), and a
    // duplicate id silently sends the player to the wrong answer.
    const ids = [...FAQ_GROUPS.map((g) => g.id), ...allItems.map((i) => i.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses url-safe ids', () => {
    for (const id of [...FAQ_GROUPS.map((g) => g.id), ...allItems.map((i) => i.id)]) {
      expect(id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('keeps the answers support links to most often', () => {
    // These three carry the bulk of the ticket volume; renaming one breaks
    // links already sent to players.
    for (const id of ['payout-timing', 'not-daily', 'ranked-not-paid']) {
      expect(allItems.map((i) => i.id)).toContain(id)
    }
  })
})

describe('FAQ board naming', () => {
  it('never shows an internal board key that differs from its label', () => {
    // The FAQ said "AREA" for months because the key -> label mapping was
    // trapped inside a client component. AREA is internal; players see LAND.
    const internalOnly = (Object.keys(BOARD_LABELS) as LeaderboardTab[]).filter(
      (key) => BOARD_LABELS[key] !== key,
    )
    expect(internalOnly).toContain('AREA')

    for (const key of internalOnly) {
      expect(allCopy).not.toMatch(new RegExp(`\\b${key}\\b`))
    }
  })

  it('names the boards exactly as the leaderboard tabs do', () => {
    const boards = allItems.find((i) => i.id === 'boards')
    expect(boards).toBeDefined()
    for (const label of Object.values(BOARD_LABELS)) {
      expect(boards!.a).toContain(label)
    }
  })

  it('does not use the singular "TYCOON"', () => {
    // The tab is TYCOONS; the old FAQ said TYCOON, so players searching the
    // page for the board they were ranked on found nothing.
    expect(allCopy).not.toMatch(/\bTYCOON\b/)
  })
})

describe('FAQ facts', () => {
  // These are the exact values that were wrong before, verified against
  // mainnet `feeRate()` and `config()`. Re-verify with `cast call` before
  // changing either the copy or this test.
  it('states the 5% fee and never the old 3%', () => {
    expect(allCopy).toContain('5% ')
    expect(allCopy).not.toContain('3%')
  })

  it('does not repeat a stale halving period', () => {
    expect(allCopy).not.toMatch(/\b(14|182)[ -]day/)
    expect(allCopy).not.toMatch(/\bfourteen\b/i)
  })

  it('does not claim USDT is the only accepted coin', () => {
    const currency = allItems.find((i) => i.id === 'currency')
    expect(currency).toBeDefined()
    for (const token of ['USDT', 'USDC', 'USDm']) {
      expect(currency!.a).toContain(token)
    }
    expect(allCopy).not.toMatch(/USDT only/i)
  })

  it('does not promise that a resale pays exactly double', () => {
    // The old answer said getting sniped "pays you double what you paid",
    // which ignores both price decay and the fee.
    expect(allCopy).not.toMatch(/pay you double/i)
  })

  it('never tells players rewards are daily or need claiming', () => {
    expect(allCopy).not.toMatch(/daily reward/i)
    expect(allCopy).not.toMatch(/claim your reward/i)
  })
})
